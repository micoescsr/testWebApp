// controllers/detectController.js
//
// Endpoints for detection lifecycle + poll proxy.
// All routes are JWT-protected (see detectRoutes.js).

const detectStateService = require("../services/detectStateService");
const { supabaseClient } = require("../config/supabaseClient");
const { logAuditEvent } = require("../utils/auditLogger");
const { piFetch } = require("../services/piGatewayService");

// ─── Shared helpers (moved from server.js) ──────────────────────

async function loadThreatDefinitions() {
  const { data, error } = await supabaseClient
    .from("vulnerability_threat_details")
    .select("vt_code, vt_name, vt_cvss_base_score, vt_severity_rating, vt_kind");

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

async function findLatestScanIdForBssid(targetBssid) {
  if (!targetBssid) return null;

  const { data: networks, error: netErr } = await supabaseClient
    .from("networks")
    .select("network_id, bssid, created_at")
    .eq("bssid", targetBssid)
    .order("created_at", { ascending: false })
    .limit(5);

  if (netErr || !networks || networks.length === 0) return null;
  const networkId = networks[0].network_id;

  const { data: scans, error: scansErr } = await supabaseClient
    .from("scans")
    .select("scan_id, network_id, created_at")
    .eq("network_id", networkId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (scansErr || !scans || scans.length === 0) return null;
  return scans[0].scan_id;
}

async function persistThreatRows(threatRows, targetBssid) {
  if (!Array.isArray(threatRows) || threatRows.length === 0) return;

  const normalizedBssid = targetBssid ? targetBssid.toUpperCase() : null;
  const scanId = await findLatestScanIdForBssid(normalizedBssid);
  if (!scanId) {
    console.warn("No scan_id found, skipping threat persistence");
    return;
  }

  for (const t of threatRows) {
    const { data: detail, error: detailErr } = await supabaseClient
      .from("vulnerability_threat_details")
      .select("vt_detail_id, vt_kind, vt_cvss_base_score")
      .eq("vt_code", t.id)
      .maybeSingle();

    if (detailErr || !detail) {
      console.error("Missing vt_detail for code", t.id, detailErr);
      continue;
    }

    const sessions = t.sessions || t.raw || [];
    const lastSession = sessions[sessions.length - 1] || null;
    const vtStatus = lastSession?.state === "DETECTED" ? "DETECTED" : "CLEARED";

    const payload = {
      scan_id: scanId,
      vt_name: t.name,
      vt_status: vtStatus,
      vt_value: t.name,
      vt_detail_id: detail.vt_detail_id,
      vt_kind: detail.vt_kind,
      severity_score: detail.vt_cvss_base_score,
    };

    const { error: insertErr } = await supabaseClient
      .from("vulnerabilities_threat")
      .insert(payload);

    if (insertErr) {
      console.error("Error inserting threat row", insertErr, payload);
    }
  }

  // Recompute risk score
  const { computeRiskScore } = require("../utils/scoring");
  const findings = threatRows.map((t) => ({ score: t.score ?? 0 }));
  const riskScore = computeRiskScore(findings);

  const { error: scoreErr } = await supabaseClient
    .from("scans")
    .update({ risk_score: riskScore })
    .eq("scan_id", scanId);

  if (scoreErr) {
    console.error("Failed to update scan risk_score", scoreErr);
  } else {
    console.log(`Scan ${scanId} risk_score updated to ${riskScore}`);
  }

  // Risk pipeline
  if (normalizedBssid) {
    const { data: netRow } = await supabaseClient
      .from("networks")
      .select("network_id")
      .eq("bssid", normalizedBssid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (netRow?.network_id) {
      try {
        const { onThreatEvent } = require("../utils/riskPipeline");
        await onThreatEvent(netRow.network_id, threatRows);
      } catch (pipeErr) {
        console.error("[riskPipeline] onThreatEvent error (non-fatal):", pipeErr.message);
      }
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
    return res.status(500).json({ error: "Failed to read detection state", detail: err.message });
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
        error: "scan_id must be a positive integer (bigint from public.scans), not a UUID.",
        received: scan_id,
      });
    }

    const actorId = req.user?.id;
    if (!actorId) {
      return res.status(401).json({ error: "No authenticated user" });
    }

    const row = await detectStateService.startOrSwitch(req, actorId, network_id, numericScanId);

    // Audit is already written inside detectStateService.startOrSwitch()
    // (DETECTION.START or DETECTION.SWITCH_TARGET with entityType DETECTION_STATE)

    return res.json(row);
  } catch (err) {
    console.error("[detect/start] error:", err);

    // Audit: detection start failed
    const actorId = req.user?.id;
    if (actorId) {
      await logAuditEvent({
        req,
        actorId,
        eventName: "DETECTION.START",
        eventStatus: "FAILED",
        entityType: "DETECTION_STATE",
        meta: { error: err.message },
      }).catch((auditErr) => {
        console.error("[detect/start] audit error:", auditErr?.message ?? auditErr);
      });
    }

    return res.status(500).json({ error: "Failed to start detection", detail: err.message });
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
    const row = await detectStateService.stop(req, actorId, { reason_code, reason_note: reason_note || null });

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

    return res.status(500).json({ error: "Failed to stop detection", detail: err.message });
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
    return res.status(500).json({ error: "Failed to update heartbeat", detail: err.message });
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

    // 2) Proxy to Pi (signed)
    const maxItems = Number(req.query.max_items ?? 50);

    let data;
    try {
      data = await piFetch("/detect/poll", {
        method: "GET",
        queryString: `max_items=${maxItems}`,
      });
    } catch (piErr) {
      // Pi returned non-OK — do NOT mark FAILED (heartbeat timeout handles that)
      return res.status(200).json({
        status: stateRow.status,
        running: true,
        results: [],
        threatRows: [],
        last_error: `Pi error: ${piErr.status || 'unreachable'}`,
      });
    }

    if (data) {
      if (data.results && data.results.length > 0) {
        console.log("THREAT DETECTED [Express]:", JSON.stringify(data.results, null, 2));
      } else {
        process.stdout.write(".");
      }

      const defsByCode = await loadThreatDefinitions();
      const threatRows = mapPollResultsToThreatRows(data.results || [], defsByCode);

      // Persist threat rows
      const firstResult = (data.results || [])[0] || null;
      const targetBssid = firstResult?.bssid ? firstResult.bssid.toUpperCase() : null;
      await persistThreatRows(threatRows, targetBssid);

      // 3) Heartbeat on successful poll (redundant with server-side ping,
      //    but harmless — keeps heartbeat fresh from both sources)
      await detectStateService.heartbeat(req).catch(() => {});

      return res.status(200).json({
        ...data,
        status: stateRow.status,
        threatRows,
      });
    }
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
