// controllers/detectController.js
//
// Endpoints for detection lifecycle + poll proxy.
// All routes are JWT-protected (see detectRoutes.js).

const detectStateService = require("../services/detectStateService");
const { supabaseClient } = require("../config/supabaseClient");
const { logAuditEvent } = require("../utils/auditLogger");
const { piFetch } = require("../utils/piFetch");

// ─── Shared helpers (moved from server.js) ──────────────────────

async function loadThreatDefinitions() {
  const { data, error } = await supabaseClient
    .from("vulnerability_threat_details")
    .select(
      "vt_code, vt_name, vt_cvss_base_score, vt_severity_rating, vt_kind",
    );

  if (error) throw error;
  const map = new Map();
  for (const d of data) {
    map.set(d.vt_code, d);
  }
  return map;
}

function mapPollResultsToThreatRows(results, defsByCode) {
  const grouped = new Map();
  const findingKeys = ["evil_twin", "mac_spoofing", "deauthentication"];

  for (const r of results || []) {
    for (const key of findingKeys) {
      const f = r?.findings?.[key];
      if (!f) continue;

      const vtCode = f.id;
      const detail = defsByCode.get(vtCode);
      if (!detail) continue;

      const firstSeen = f.details?.first_seen_epoch;
      const lastSeen = f.details?.last_seen_epoch;
      const mapKey = vtCode;

      if (!grouped.has(mapKey)) {
        grouped.set(mapKey, {
          id: vtCode,
          name: detail.vt_name,
          severity: detail.vt_severity_rating,
          score: detail.vt_cvss_base_score,
          status: f.status,
          occurrences: 1,
          detectedTime: firstSeen
            ? new Date(firstSeen * 1000).toISOString()
            : r.detection_cycle_start,
          sessions: [{ firstSeen, lastSeen, state: f.status }],
          raw: [r],
        });
      } else {
        const agg = grouped.get(mapKey);
        agg.occurrences += 1;
        agg.status = f.status;
        if (lastSeen) {
          agg.detectedTime = new Date(lastSeen * 1000).toISOString();
        }
        agg.sessions.push({ firstSeen, lastSeen, state: f.status });
        agg.raw.push(r);
      }
    }
  }
  return Array.from(grouped.values());
}

/**
 * Persist threat rows using detection_state's scan_id (no BSSID lookup).
 * - Inserts event history into vulnerability_threat_events
 * - Upserts current state in vulnerabilities_threat per (scan_id, vt_detail_id)
 * - Recomputes risk via RPC compute_scan_risk
 * - Calls riskPipeline.updateNetworkRisk with real score
 */
async function persistThreatRows(threatRows, scanId, activeNetworkId) {
  if (!Array.isArray(threatRows) || threatRows.length === 0) return;
  if (!scanId) {
    console.warn(
      "[persistThreatRows] No scanId provided, skipping threat persistence",
    );
    return;
  }

  const now = new Date().toISOString();

  for (const t of threatRows) {
    // Resolve vt_detail_id from vt_code
    const { data: detail, error: detailErr } = await supabaseClient
      .from("vulnerability_threat_details")
      .select("vt_detail_id, vt_kind, vt_cvss_base_score")
      .eq("vt_code", t.id)
      .maybeSingle();

    if (detailErr || !detail) {
      console.error(
        "[persistThreatRows] Missing vt_detail for code",
        t.id,
        detailErr,
      );
      continue;
    }

    const sessions = t.sessions || t.raw || [];
    const lastSession = sessions[sessions.length - 1] || null;
    const isDetected = lastSession?.state === "DETECTED";
    const eventType = isDetected ? "DETECTED" : "CLEARED";

    // 1) Append event to vulnerability_threat_events (append-only audit log)
    const { error: eventErr } = await supabaseClient
      .from("vulnerability_threat_events")
      .insert({
        scan_id: scanId,
        vt_detail_id: detail.vt_detail_id,
        event_state: eventType,
        event_time: now,
      });

    if (eventErr) {
      console.error("[persistThreatRows] Event insert failed", eventErr);
    }

    // 2) Upsert current state in vulnerabilities_threat keyed on (scan_id, vt_detail_id)
    const { data: existing, error: lookErr } = await supabaseClient
      .from("vulnerabilities_threat")
      .select("vt_id, occurrence_count, first_seen_at")
      .eq("scan_id", scanId)
      .eq("vt_detail_id", detail.vt_detail_id)
      .maybeSingle();

    if (lookErr) {
      console.error("[persistThreatRows] Lookup failed", lookErr);
      continue;
    }

    if (existing) {
      // Update existing row
      const updatePayload = isDetected
        ? {
            vt_status: "ACTIVE",
            occurrence_count: (existing.occurrence_count || 0) + 1,
            last_seen_at: now,
          }
        : {
            vt_status: "INACTIVE",
            last_seen_at: now,
          };

      const { error: updErr } = await supabaseClient
        .from("vulnerabilities_threat")
        .update(updatePayload)
        .eq("vt_id", existing.vt_id);

      if (updErr) {
        console.error("[persistThreatRows] Update failed", updErr);
      }
    } else {
      // Insert new row — always record first_seen_at even for CLEARED,
      // so the threat is visible in scan history.
      const firstSeenFromSessions = t.sessions?.[0]?.firstSeen
        ? new Date(t.sessions[0].firstSeen * 1000).toISOString()
        : now;
      const insertPayload = {
        scan_id: scanId,
        vt_name: t.name,
        vt_status: isDetected ? "ACTIVE" : "INACTIVE",
        vt_value: t.name,
        vt_detail_id: detail.vt_detail_id,
        vt_kind: detail.vt_kind,
        severity_score: detail.vt_cvss_base_score,
        occurrence_count: 1,
        first_seen_at: firstSeenFromSessions,
        last_seen_at: now,
      };

      const { error: insErr } = await supabaseClient
        .from("vulnerabilities_threat")
        .insert(insertPayload);

      if (insErr) {
        console.error("[persistThreatRows] Insert failed", insErr);
      }
    }
  }

  // Recompute risk score via authoritative DB RPC; fall back to JS scoring if RPC is unavailable
  let effectiveScore = 0;
  const { data: rpcScore, error: rpcErr } = await supabaseClient.rpc(
    "compute_scan_risk",
    { p_scan_id: scanId },
  );

  if (rpcErr) {
    console.warn(
      "[persistThreatRows] compute_scan_risk RPC failed, falling back to JS scoring",
      rpcErr,
    );
    const { computeRiskScore } = require("../utils/scoring");
    const findings = threatRows.map((t) => ({ score: t.score ?? 0 }));
    effectiveScore = computeRiskScore(findings);
    const { error: scoreErr } = await supabaseClient
      .from("scans")
      .update({ risk_score: effectiveScore })
      .eq("scan_id", scanId);
    if (scoreErr) {
      console.error(
        "[persistThreatRows] Fallback risk_score update failed",
        scoreErr,
      );
    } else {
      console.log(
        `[persistThreatRows] Fallback risk_score ${effectiveScore} written for scan ${scanId}`,
      );
    }
  } else {
    effectiveScore = rpcScore ?? 0;
    console.log(
      `[persistThreatRows] compute_scan_risk returned ${effectiveScore} for scan ${scanId}`,
    );
  }

  // Risk pipeline: update network risk with effective score + official bucket
  if (activeNetworkId) {
    try {
      const { bucketize, updateNetworkRisk } = require("../utils/riskPipeline");
      const newScore = effectiveScore;
      const newBucket = bucketize(newScore);
      await updateNetworkRisk(activeNetworkId, {
        newBucket,
        newScore,
        reason: "threat_detected",
        // Don't pass scanId — it's a bigint from scans table,
        // but networks.last_scan_id is uuid (from vulnerability_scans)
      });
    } catch (pipeErr) {
      console.error(
        "[riskPipeline] updateNetworkRisk error (non-fatal):",
        pipeErr.message,
      );
    }
  }
}

// ─── Route handlers ─────────────────────────────────────────────

/**
 * GET /api/detect/status
 * Returns current detection state, enforcing heartbeat timeout.
 */
async function getStatus(req, res) {
  try {
    const row = await detectStateService.getStatusAndMaybeFail(req);

    // Enrich with SSID from networks table so the frontend can display
    // which network is being monitored — even after a page refresh.
    if (row.active_network_id) {
      const { data: net } = await supabaseClient
        .from("networks")
        .select("ssid")
        .eq("network_id", row.active_network_id)
        .maybeSingle();
      row.ssid = net?.ssid || null;
    } else {
      row.ssid = null;
    }

    return res.json(row);
  } catch (err) {
    console.error("[detect/status] error:", err);
    return res.status(500).json({ error: "Failed to read detection state" });
  }
}

/**
 * POST /api/detect/start
 * Body: { network_id, scan_id }
 * scan_id MUST be a numeric bigint (from public.scans), NOT a UUID.
 */
async function start(req, res) {
  try {
    const { network_id, scan_id } = req.body;

    if (!network_id) {
      return res.status(400).json({ error: "Missing network_id" });
    }

    // Reject UUID-shaped scan_id; coerce to number
    const numericScanId = Number(scan_id);
    if (
      !scan_id ||
      !Number.isFinite(numericScanId) ||
      numericScanId <= 0 ||
      String(scan_id).includes("-") // UUID guard
    ) {
      return res.status(400).json({
        error:
          "scan_id must be a positive integer (bigint from public.scans), not a UUID.",
        received: scan_id,
      });
    }

    const actorId = req.user?.id;
    if (!actorId) {
      return res.status(401).json({ error: "No authenticated user" });
    }

    const row = await detectStateService.startOrSwitch(
      req,
      actorId,
      network_id,
      numericScanId,
    );

    // Audit is already written inside detectStateService.startOrSwitch()
    // (DETECTION.START or DETECTION.SWITCH_TARGET with entityType DETECTION_STATE)

    return res.json(row);
  } catch (err) {
    console.error("[detect/start] error:", err);

    // Audit: detection start failed
    const actorId = req.user?.id;
    if (actorId) {
      logAuditEvent({
        req,
        actorId,
        eventName: "DETECTION.START",
        eventStatus: "FAILED",
        entityType: "DETECTION_STATE",
        meta: { error: err.message },
      }).catch(() => {});
    }

    return res.status(500).json({ error: "Failed to start detection" });
  }
}

// Allowed reason_code values for governed STOP
const STOP_REASON_CODES = [
  "MAINTENANCE",
  "DEVICE_RESTART",
  "FALSE_POSITIVES",
  "CLIENT_REQUEST",
  "SCOPE_CHANGE",
  "EVIDENCE_PRESERVATION",
  "OTHER",
];

/**
 * POST /api/detect/stop
 * Body: { reason_code: string, reason_note?: string }
 */
async function stopDetection(req, res) {
  try {
    const actorId = req.user?.id;
    if (!actorId) {
      return res.status(401).json({ error: "No authenticated user" });
    }

    const { reason_code, reason_note } = req.body || {};

    // Validate reason_code
    if (!reason_code || !STOP_REASON_CODES.includes(reason_code)) {
      return res.status(400).json({
        error: `reason_code is required and must be one of: ${STOP_REASON_CODES.join(", ")}`,
        received: reason_code,
      });
    }

    // Validate reason_note required when OTHER
    if (reason_code === "OTHER" && (!reason_note || !reason_note.trim())) {
      return res.status(400).json({
        error: "reason_note is required when reason_code is OTHER",
      });
    }

    // Delegate to service (SUCCESS audit is written there, not here)
    const row = await detectStateService.stop(req, actorId, {
      reason_code,
      reason_note: reason_note || null,
    });

    // Finalization: recompute risk one last time + stamp scan_end + update network risk (best-effort)
    if (row.active_scan_id) {
      try {
        let score = 0;
        const { data: finalScore, error: rpcErr } = await supabaseClient.rpc(
          "compute_scan_risk",
          { p_scan_id: row.active_scan_id },
        );
        if (rpcErr) {
          console.warn(
            "[stopDetection] compute_scan_risk RPC failed, using fallback",
            rpcErr,
          );
          const { computeRiskScore } = require("../utils/scoring");
          score = computeRiskScore([]); // no threat rows available at stop time; score derived from DB state
        } else {
          score = finalScore ?? 0;
          console.log(
            `[stopDetection] Final compute_scan_risk returned ${score} for scan ${row.active_scan_id}`,
          );
        }

        // Update network risk with final score
        if (row.active_network_id) {
          const {
            bucketize,
            updateNetworkRisk,
          } = require("../utils/riskPipeline");
          await updateNetworkRisk(row.active_network_id, {
            newBucket: bucketize(score),
            newScore: score,
            reason: "detection_stopped",
            scanId: row.active_scan_id,
          });
        }
      } catch (err) {
        console.error(
          "[stopDetection] Final risk recompute failed (non-fatal):",
          err.message,
        );
      }

      await supabaseClient
        .from("scans")
        .update({ scan_end: new Date().toISOString() })
        .eq("scan_id", row.active_scan_id)
        .then(() =>
          console.log(
            `[stopDetection] scan_end stamped for scan ${row.active_scan_id}`,
          ),
        )
        .catch((err) =>
          console.error(
            "[stopDetection] scan_end update failed (non-fatal):",
            err.message,
          ),
        );
    }

    return res.json(row);
  } catch (err) {
    console.error("[detect/stop] error:", err);

    // Audit: detection stop failed (server error only, not 400 validation)
    const actorId = req.user?.id;
    if (actorId) {
      logAuditEvent({
        req,
        actorId,
        eventName: "DETECTION.STOP",
        eventStatus: "FAILED",
        entityType: "DETECTION_STATE",
        meta: { error: err.message },
      }).catch(() => {});
    }

    return res.status(500).json({ error: "Failed to stop detection" });
  }
}

/**
 * POST /api/detect/heartbeat
 */
async function heartbeat(req, res) {
  try {
    const row = await detectStateService.heartbeat(req);
    return res.json(row);
  } catch (err) {
    console.error("[detect/heartbeat] error:", err);
    return res.status(500).json({ error: "Failed to update heartbeat" });
  }
}

/**
 * GET /api/detect/poll
 * Gated by detection state: only proxies to FastAPI when RUNNING.
 * Updates heartbeat on successful poll.
 */
async function poll(req, res) {
  try {
    // 1) Check detection state (also enforces heartbeat timeout)
    const stateRow = await detectStateService.getStatusAndMaybeFail(req);

    if (stateRow.status !== "RUNNING") {
      return res.status(200).json({
        status: stateRow.status,
        running: false,
        results: [],
        threatRows: [],
        last_error: stateRow.failure_reason || null,
      });
    }

    // 2) Proxy to FastAPI
    const maxItems = Number(req.query.max_items ?? 50);

    // Query string is included in the signature (matches Pi verifier).
    const { ok: piOk, data } = await piFetch("/detect/poll", {
      query: `max_items=${encodeURIComponent(maxItems)}`,
    });

    if (piOk && data) {
      if (data.results && data.results.length > 0) {
        console.log(
          "THREAT DETECTED [Express]:",
          JSON.stringify(data.results, null, 2),
        );
      } else {
        process.stdout.write(".");
      }

      const defsByCode = await loadThreatDefinitions();
      const threatRows = mapPollResultsToThreatRows(
        data.results || [],
        defsByCode,
      );

      // Persist threat rows using detection_state's scan_id and network_id
      await persistThreatRows(
        threatRows,
        stateRow.active_scan_id,
        stateRow.active_network_id,
      );

      // 3) Heartbeat on successful poll (redundant with server-side ping,
      //    but harmless — keeps heartbeat fresh from both sources)
      await detectStateService.heartbeat(req).catch(() => {});

      return res.status(200).json({
        ...data,
        status: stateRow.status,
        threatRows,
      });
    }

    // FastAPI returned non-OK — do NOT mark FAILED (heartbeat timeout handles that)
    return res.status(200).json({
      status: stateRow.status,
      running: true,
      results: [],
      threatRows: [],
      last_error: `FastAPI error: ${r.status}`,
    });
  } catch (err) {
    console.error("Poll Proxy Exception:", err.message);
    return res.status(200).json({
      running: false,
      results: [],
      threatRows: [],
      last_error: "Backend unavailable",
    });
  }
}

module.exports = { getStatus, start, stopDetection, heartbeat, poll };
