// controllers/rasPiController.js
const rasPiService = require("../services/rasPiService");
const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://mothership-1.tail781e52.ts.net:8000";
const { supabaseClient } = require("../config/supabaseClient");

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
    const r = await fetch(`${FASTAPI_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const fastapiData = await r.json();
    return res.status(r.status).json(fastapiData);
  } catch (err) {
    console.error("triggerScan error:", err);
    return res.status(502).json({ status: "ERROR", error: "Scan failed" });
  }
}

async function getNetworksList(req, res) {
  try {
    const r = await fetch(`${FASTAPI_BASE}/networks`, { //dpt aligned sa endpoint ni kerby which is naka /network lng
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    const data = await r.json();
    console.log("getNetworksList response:", data);
    return res.status(r.status).json(data);

  } catch (err) {
    return res.status(502).json({
      status: "ERROR",
      error: "Failed to reach FastAPI /networks",
      detail: String(err),
      fastapi_base: FASTAPI_BASE,
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

    // 2. Insert scan (linked to network_id)
    let scanRow = null;
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

        vulnRows.push({
          scan_id: scanRow.scan_id,
          // use the canonical name from details if available, otherwise fallback
          vt_name: detail?.vt_name || key,      // e.g. "Management Frame Protection" or "mfp"
          vt_status: finding.status,            // "DETECTED"
          vt_value: finding.value,              // "Disabled"
          vt_detail_id: detail?.vt_detail_id || null,
          // Mark these rows explicitly as vulnerability findings so they can be filtered
          // Normalize to lowercase for consistent querying
          vt_kind: (detail?.vt_kind || 'vulnerability').toLowerCase(),
          severity_score: detail?.vt_cvss_base_score ?? null,
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
    }

    return res.status(201).json({
      status: "OK",
      network_id: network.network_id,
      network,
    });
  } catch (err) {
    console.error("Save network/metadata/scan error:", err);
    return res.status(500).json({
      status: "ERROR",
      error: "Failed to save network data",
      detail: err.message,
    });
  }
}


/* async function insertMetadata(req, res) {
  try {
    const metadata = await rasPiService.insertMetadata(req.body);  // now orchestrates everything
    res.status(201).json(metadata);
  } catch (err) { //better error logging
    console.error("insertMetadata ERROR:", err);
    res.status(500).json({ error: err.message });
  }} */


    //to be implemented soon...
async function getAccessPointDetails(req, res) {
  try {
    const networks = await rasPiService.getAccessPointDetails();
    res.status(200).json(networks);  // 200 for GET
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
/*
module.exports = {insertMetadata, getAccessPointDetails};

// controllers/rasPiController.js (unchanged structure pero sabi minimal change)
const rasPiService = require("../services/rasPiService");

async function insertMetadata(req, res) {
  try {
    const metadata = await rasPiService.insertMetadata(req.body);  // now orchestrates everything
    res.status(201).json(metadata);
  /* } catch (err) {
    res.status(500).json({ error: "Failed to insert metadata" });
  } *//*
    } catch (err) { //better error logging
    console.error("insertMetadata ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}

async function getAccessPointDetails(req, res) {
  try {
    const networks = await rasPiService.getAccessPointDetails();
    res.status(200).json(networks);  // 200 for GET
  } catch (err) {
    res.status(500).json({ error: "Failed to get access point details" });
  }
}

module.exports = { insertMetadata, getAccessPointDetails };
*/