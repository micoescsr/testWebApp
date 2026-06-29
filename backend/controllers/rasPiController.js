// controllers/rasPiController.js
const crypto = require("crypto");
const { piFetch } = require("../utils/piFetch");
const { supabaseClient } = require("../config/supabaseClient");
const { logAuditEvent } = require("../utils/auditLogger");
const detectStateService = require("../services/detectStateService");

function getRiskLabel(score) {
  const s = Number(score) || 0;
  if (s === 0) return "NONE";
  if (s <= 39) return "LOW";
  if (s <= 69) return "MEDIUM";
  if (s <= 89) return "HIGH";
  return "CRITICAL";
}

  // --- 1. TRIGGER SCAN: ONLY TALKS TO FASTAPI, NO DB ---
async function triggerScan(req, res) {
  try {
    const { ssid, bssid, channel } = req.body;

    if (!ssid || !bssid || channel === undefined) {
      return res
        .status(400)
        .json({ status: "ERROR", error: "Missing ssid/bssid/channel" });
    }

    const payload = { ssid, bssid, channel };
    console.log("triggerScan payload:", payload);
    const { ok: piOk, status: piStatus, data: fastapiData } = await piFetch("/scan", {
      method: "POST",
      jsonBody: payload,
    });

    // Audit: scan triggered
    if (req.user?.id) {
      await logAuditEvent({
        req,
        actorId: req.user.id,
        eventName: "SCAN_TRIGGER",
        eventStatus: piOk ? "SUCCESS" : "FAILED",
        entityType: "SCAN",
        entityIdUuid: req.user.id,
        meta: { ssid, bssid, channel, fastapiStatus: piStatus },
      }).catch(() => {});
    }

    return res.status(piStatus).json(fastapiData);
  } catch (err) {
    console.error("triggerScan error:", err);
    if (req.user?.id) {
      await logAuditEvent({
        req,
        actorId: req.user.id,
        eventName: "SCAN_TRIGGER",
        eventStatus: "FAILED",
        entityType: "SCAN",
        entityIdUuid: req.user.id,
        meta: { error: "SCAN_TRIGGER_ERROR" },
      }).catch(() => {});
    }
    return res.status(502).json({ status: "ERROR", error: "Scan failed" });
  }
}

async function getNetworksList(req, res) {
  try {
    const { status, data } = await piFetch("/networks");
    console.log("getNetworksList response:", data);
    return res.status(status).json(data);

  } catch (err) {
    return res.status(err.status || 502).json({
      status: "ERROR",
      error: "Failed to reach FastAPI /networks",
    });
  }
};

// --- 2. SAVE NETWORK + SCAN + FINDINGS ---  // POST /api/rasPi/networks WORKING
async function saveNetworkMetadataScan(req, res) {
  try {
    const { ssid, bssid, channel, city, province, notes, scan } = req.body;

    if (!ssid || !bssid || channel === undefined) {
      return res
        .status(400)
        .json({ status: "ERROR", error: "Missing ssid/bssid/channel" });
    }

    const encryption = scan?.encryption || null;
    const num_clients = scan?.num_clients ?? null;

    // Normalize BSSID for consistent storage/lookup
    const normalizedBssid = String(bssid).toUpperCase();

    // 1. Upsert network
    let { data: network, error: lookupErr } = await supabaseClient
      .from("networks")
      .select("network_id")
      .eq("bssid", normalizedBssid)
      .maybeSingle();
    if (lookupErr) throw lookupErr;

    if (!network) {
      const { data: newNet, error: insertErr } = await supabaseClient
        .from("networks")
        .insert({
          ssid,
          bssid: normalizedBssid,
          channel,
          city,
          province,
          notes,
          encryption_status: encryption,
          num_clients,
        })
        .select("network_id, *")
        .single();
      if (insertErr) throw insertErr;
      network = newNet;
    } else {
      const { error: updateErr } = await supabaseClient
        .from("networks")
        .update({
          ssid,
          channel,
          city,
          province,
          notes,
          encryption_status: encryption,
          num_clients,
          bssid: normalizedBssid,
        })
        .eq("network_id", network.network_id);
      if (updateErr) throw updateErr;
    }

    // 2. Insert scan (linked to network_id) — legacy scans table
    let scanRow = null;
    let vulnScanRow = null; // vulnerability_scans row (UUID PK, used by AP enable)
    let riskScoreValue = 0;
    if (scan) {
      const { data: scanInsert, error: scanErr } = await supabaseClient
        .from("scans")
        .insert({
          network_id: network.network_id,
          scan_data: scan,
          scan_start: scan.scan_start || new Date().toISOString(),
          scan_end: scan.scan_end || null,
        })
        .select("scan_id")
        .single();
      if (scanErr) throw scanErr;
      scanRow = scanInsert;

      // 2b. Dual-write: also insert into vulnerability_scans (UUID PK)
      //     This is the table used by AP enable, scan validation, and risk pipeline.
      const profileId = req.user?.id || null;
      const scanStart = scan.scan_start || new Date().toISOString();
      const scanEnd = scan.scan_end || new Date().toISOString();
      const idempotencyKey = crypto.randomUUID(); // unique per save

      const vulnScanPayload = {
        network_id: network.network_id,
        requested_by_profile_id: profileId,
        status: 'COMPLETED',
        started_at: scanStart,
        finished_at: scanEnd,
        target_snapshot: {
          ssid,
          bssid: normalizedBssid,
          channel,
        },
        idempotency_key: idempotencyKey,
        scan_data: scan,
        error_code: null,
      };

      const { data: vulnScanInsert, error: vulnScanErr } = await supabaseClient
        .from("vulnerability_scans")
        .insert(vulnScanPayload)
        .select("scan_id")
        .single();

      if (vulnScanErr) {
        // Non-fatal: log but don't fail the save — old scan still works
        console.error("[saveNetworkMetadataScan] vulnerability_scans insert failed:", vulnScanErr.message);
      } else {
        vulnScanRow = vulnScanInsert;
        console.log("[saveNetworkMetadataScan] vulnerability_scans row created:", vulnScanRow.scan_id);
      }
    }

    // 3. Insert vulnerabilities_threat from scan.findings
    if (scanRow && scan?.findings) {
      const vulnRows = [];
      console.log("[saveNetworkMetadataScan] scan.findings type:", typeof scan.findings, "keys:", Object.keys(scan.findings));

      // findings = { encryption: {...}, wps: {...}, mfp: {...} }
      for (const [key, finding] of Object.entries(scan.findings)) {
        // finding.id is the vt_code like "WFVT-005"
        const { data: detail, error: detailErr } = await supabaseClient
          .from("vulnerability_threat_details")
          .select("vt_detail_id, vt_name, vt_kind, vt_cvss_base_score")
          .eq("vt_code", finding.id)
          .maybeSingle();
        if (detailErr) throw detailErr;

        // ✅ Guard: if vt_code not found in details, skip (won't be counted anyway)
        if (!detail?.vt_detail_id) {
          console.warn(
            "[saveNetworkMetadataScan] Missing vt_detail_id for vt_code:",
            finding.id,
            "skipping row."
          );
          continue;
        }

        const vtKindUpper = (detail?.vt_kind || "VULNERABILITY").toUpperCase();
        const statusUpper = String(finding.status || "").toUpperCase();

        // ✅ Threat counts as present only if occurrence_count >= 1
        const occurrenceCount =
          vtKindUpper === "THREAT" && statusUpper === "DETECTED" ? 1 : 0;

        vulnRows.push({
          scan_id: scanRow.scan_id,

          // canonical name if available, else fallback
          vt_name: detail.vt_name || key,
          vt_status: finding.status, // "DETECTED"
          vt_value: finding.value,   // e.g. "Disabled"

          vt_detail_id: detail.vt_detail_id,

          // keep your existing lowercase convention
          vt_kind: vtKindUpper.toLowerCase(), // "vulnerability" or "threat"

          // optional; scoring uses details table, but good for UI/debug
          severity_score: detail.vt_cvss_base_score ?? null,

          // ✅ important for threats
          occurrence_count: occurrenceCount,

          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        });
      }

      if (vulnRows.length > 0) {
        console.log("[saveNetworkMetadataScan] inserting", vulnRows.length, "vuln rows:", JSON.stringify(vulnRows, null, 2));
        const { error: vulnErr } = await supabaseClient
          .from("vulnerabilities_threat")
          .insert(vulnRows);
        if (vulnErr) throw vulnErr;
        console.log("[saveNetworkMetadataScan] vuln insert succeeded");
      } else {
        console.log("[saveNetworkMetadataScan] no vuln rows to insert");
      }

      // ✅ Compute + persist risk score AFTER inserting findings (once per scan)
      const { data: riskScore, error: riskErr } = await supabaseClient.rpc(
        "compute_scan_risk",
        { p_scan_id: scanRow.scan_id }
      );
      if (riskErr) throw riskErr;

      riskScoreValue = riskScore ?? 0;
      console.log("[saveNetworkMetadataScan] risk score computed:", riskScoreValue);
      
    }

    // Audit: scan results saved successfully
    if (req.user?.id) {
      await logAuditEvent({
        req,
        actorId: req.user.id,
        eventName: "SCAN_SAVE",
        eventStatus: "SUCCESS",
        entityType: "SCAN",
        entityIdUuid: req.user.id,
        newValues: {
          network_id: network.network_id,
          scan_id: vulnScanRow?.scan_id || scanRow?.scan_id || null,
          legacy_scan_id: scanRow?.scan_id || null,
          ssid,
          bssid,
        },
      }).catch(() => {});
    }

    // Trigger risk pipeline from the new vulnerability_scans row (non-fatal)
    if (vulnScanRow?.scan_id) {
      try {
        const { onScanCompleted } = require("../utils/riskPipeline");
        // Pass the legacy public.scans BIGINT id so the risk pipeline can call
        // compute_scan_risk(p_scan_id bigint) directly (vulnerabilities_threat
        // is keyed by this id). scanRow.scan_id is that BIGINT.
        await onScanCompleted(vulnScanRow.scan_id, req, { legacyScanId: scanRow?.scan_id ?? null });
        console.log("[saveNetworkMetadataScan] riskPipeline.onScanCompleted triggered for", vulnScanRow.scan_id);
      } catch (pipeErr) {
        console.error("[saveNetworkMetadataScan] riskPipeline error (non-fatal):", pipeErr.message);
      }
    }

    // ── Auto-start (or switch) detection after scan save ──
    // IMPORTANT: uses scanRow.scan_id (BIGINT from public.scans), NOT vulnScanRow (UUID).
    if (scanRow?.scan_id && network?.network_id && req.user?.id) {
      try {
        await detectStateService.startOrSwitch(req, req.user.id, network.network_id, scanRow.scan_id);
        console.log("[saveNetworkMetadataScan] detection started/switched for scan", scanRow.scan_id);
      } catch (detectErr) {
        console.error("[saveNetworkMetadataScan] detectStateService.startOrSwitch error (non-fatal):", detectErr.message);
      }
    }

    // Return UUID scan_id (from vulnerability_scans) for AP enable;
    // legacy_scan_id (bigint from scans) for backward compat.
    return res.status(201).json({
      status: "OK",
      network_id: network.network_id,
      scan_id: vulnScanRow?.scan_id ?? scanRow?.scan_id ?? null,
      legacy_scan_id: scanRow?.scan_id ?? null,
      risk_score: riskScoreValue,
      risk_label: getRiskLabel(riskScoreValue),
      network,
    });
  } catch (err) {
    console.error("Save network/metadata/scan error:", err);
    if (req.user?.id) {
      await logAuditEvent({
        req,
        actorId: req.user.id,
        eventName: "SCAN_SAVE",
        eventStatus: "FAILED",
        entityType: "SCAN",
        entityIdUuid: req.user.id,
        meta: { error: "SCAN_SAVE_ERROR" },
      }).catch(() => {});
    }
    return res.status(500).json({
      status: "ERROR",
      error: "Failed to save network data",
    });
  }
}

async function getAccessPointDetails(req, res) {
  try {
    const { data, error } = await supabaseClient
      .from("networks")
      .select("SSID, Status");
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to get access point details" });
  }
}

// Get specific saved network config by network_id (used by web UI)
async function getNetworkById(req, res) {
  try {
    const { networkId } = req.params;
    const { data, error } = await supabaseClient
      .from("networks")
      .select("ssid, bssid, channel, encryption_status")
      .eq("network_id", networkId)
      .single();

    if (error) throw error;
    res.json({
      ssid: data.ssid,
      bssid: data.bssid,
      channel: data.channel,
      encryption_type: data.encryption_status,
    });
  } catch (err) {
    console.error("getNetworkById error:", err);
    res.status(500).json({ message: "Failed to load network config" });
  }
}

module.exports = { triggerScan, getNetworksList, saveNetworkMetadataScan, getAccessPointDetails, getNetworkById };
