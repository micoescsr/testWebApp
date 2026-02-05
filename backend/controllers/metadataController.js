// controllers/webAppController.js
const { supabaseClient } = require("../config/supabaseClient");

// GET /api/webApp/network_metadata?bssid=...
async function getNetworkMetadata(req, res) {
  try {
    const { bssid } = req.query;
    if (!bssid) {
      return res.status(400).json({ error: "bssid is required" });
    }

    const { data, error } = await supabaseClient
      .from("networks")
      .select("city, province, notes")
      .eq("bssid", bssid)
      .maybeSingle();

    if (error) {
      console.error("getNetworkMetadata error:", error);
      return res.status(500).json({ error: "DB error" });
    }

    return res.json(data || null);
  } catch (err) {
    console.error("getNetworkMetadata server error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// GET /api/webApp/vulnerabilities_latest?bssid=...
async function getVulnerabilitiesLatest(req, res) {
  try {
    const { bssid } = req.query;

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
          network_id
        ),
        detail:vulnerability_threat_details (
          vt_code,
          vt_name,
          vt_cvss_base_score,
          vt_severity_rating
        )
      `
      )
      .order("scan_id", { ascending: false });

    if (networkId) {
      query = query.eq("scan.network_id", networkId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data.map((item) => ({
      id: item.vt_id,
      severity: item.detail?.vt_severity_rating ?? "N/A",
      name: item.vt_name,
      score: item.detail?.vt_cvss_base_score ?? null,
      observedConfig: item.vt_value,
      detectedTime: item.scan?.scan_start,
    }));

    return res.json({ status: "OK", rows });
  } catch (err) {
    console.error("getVulnerabilitiesLatest error:", err);
    return res.status(500).json({
      status: "ERROR",
      error: "Failed to load vulnerabilities",
    });
  }
}

module.exports = {
  getNetworkMetadata,
  getVulnerabilitiesLatest,
};
