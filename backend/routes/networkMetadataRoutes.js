// routes/networkMetadata.js
const express = require("express");
const router = express.Router();
const { supabaseClient } = require("../config/supabaseClient");

/* router.get("/network_metadata", async (req, res) => {
  const { bssid } = req.query;

  if (!bssid) {
    return res.status(400).json({ error: "bssid is required" });
  }

  const { data, error } = await supabaseClient
    .from("networks")
    .select("city, province, notes, ssid, channel") // add more if you want
    .eq("bssid", bssid)
    .maybeSingle(); // returns one row or null

  if (error) {
    console.error("network_metadata error:", error);
    return res.status(500).json({ error: "DB error" });
  }

  if (!data) {
    // no metadata yet for this BSSID
    return res.json(null);
  }

  return res.json(data);
}); */

router.get('/', async (req, res) => {
  try {
    const { bssid } = req.query;
    // Query your DB (Supabase/Postgres) for network by bssid
    const { data, error } = await supabaseClient
      .from('networks')
      .select('city, province, notes')
      .eq('bssid', bssid)
      .single();

    if (error || !data) {
      return res.json(null);  // Returns null for no match (prefill clears)
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* router.get("/vulnerabilities_latest", async (req, res) => {
  try {
    const { bssid } = req.query; // optional filter by current network

    // First, optionally resolve network_id from bssid
    let networkId = null;
    if (bssid) {
      const { data: net, error: netErr } = await supabaseClient
        .from("networks")
        .select("network_id")
        .eq("bssid", bssid)
        .maybeSingle();
      if (netErr) throw netErr;
      networkId = net?.network_id ?? null;
    }

    // Join scans + vulnerabilities_threat (+ details for severity/score)
    let query = supabaseClient
    .from("vulnerabilities_threat")
    .select(
      `
      vt_id,
      vt_name,
      vt_status,
      vt_value,
      scan:scans (
        scan_id,
        scan_start,
        scan_end,
        network_id,
        network:networks (
          bssid,
          ssid
        )
      ),
      detail:vulnerability_threat_details (
        vt_code,
        severity,
        severity_score
      )
      `
    )
    .order("scan_id", { ascending: false });

    if (networkId) {
      query = query.eq("scan.network_id", networkId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Shape it into table rows
    const rows = data.map((item) => ({
      id: item.vt_id,
      severity: item.detail?.severity ?? "CRITICAL", // fallback if needed
      name: item.vt_name,
      score: item.detail?.severity_score ?? null,
      observedConfig: item.vt_value,
      detectedTime: item.scan?.scan_start,

          // ADD THESE
      network_id: item.scan?.network_id,
      bssid: item.scan?.network?.bssid,
      ssid: item.scan?.network?.ssid,
    }));

    return res.json({ status: "OK", rows });
  } catch (err) {
    console.error("vulnerabilities_latest error:", err);
    return res.status(500).json({
      status: "ERROR",
      error: "Failed to load vulnerabilities",
    });
  }
}); */

module.exports = router;
