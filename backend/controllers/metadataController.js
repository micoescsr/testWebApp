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
/* async function getVulnerabilitiesLatest(req, res) {
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
      // filter by network_id (this is correct)
      query = query.eq("scan.network_id", networkId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Supabase error in getVulnerabilitiesLatest:", error);
      throw error;
    }

    const rows = data.map((item) => ({
      id: item.vt_id,
      severity: item.detail?.vt_severity_rating ?? "N/A",
      name: item.vt_name,
      score: item.detail?.vt_cvss_base_score ?? null,
      observedConfig: item.vt_value,
      detectedTime: item.scan?.scan_start,
      network_id: item.scan?.network_id ?? null, // optional, but real
    }));

    return res.json({ status: "OK", rows });
  } catch (err) {
    console.error("getVulnerabilitiesLatest error:", err);
    return res.status(500).json({
      status: "ERROR",
      error: "Failed to load vulnerabilities",
    });
  }
} */

async function getVulnerabilitiesLatest(req, res) {
  try {
    const { bssid } = req.query;
    console.log("[getVulnerabilitiesLatest] called with bssid:", bssid);

    if (!bssid) {
      return res.status(400).json({ error: "bssid is required" });
    }

    // Normalize bssid for lookup (stored as uppercase)
    const normalizedBssid = String(bssid).toUpperCase();
    console.log("[getVulnerabilitiesLatest] normalized bssid:", normalizedBssid);

    // Step 1: resolve network_id
    const { data: network, error: networkError } = await supabaseClient
      .from("networks")
      .select("network_id")
      .eq("bssid", normalizedBssid)
      .single();

    if (networkError || !network) {
      console.error("[getVulnerabilitiesLatest] Network lookup failed:", networkError);
      return res.status(500).json({ error: "Failed to resolve network" });
    }

    const networkId = network.network_id;
    console.log("[getVulnerabilitiesLatest] resolved network_id:", networkId);

    // Step 1b: resolve the most recent scan for this network. Vulnerability
    // rows are scoped per scan_id (each scan inserts its own fresh batch into
    // vulnerabilities_threat — see rasPiController.saveNetworkMetadataScan),
    // so filtering by network_id alone returns every historical scan's rows
    // merged together, making old scans' findings reappear after a new scan.
    const { data: latestScan, error: latestScanErr } = await supabaseClient
      .from("scans")
      .select("scan_id")
      .eq("network_id", networkId)
      .order("scan_id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestScanErr) {
      console.error("[getVulnerabilitiesLatest] Latest scan lookup failed:", latestScanErr);
      return res.status(500).json({ error: "Failed to resolve latest scan" });
    }

    if (!latestScan) {
      // No scans yet for this network — nothing to show
      return res.json({ status: "OK", rows: [] });
    }

    const latestScanId = latestScan.scan_id;
    console.log("[getVulnerabilitiesLatest] resolved latest scan_id:", latestScanId);

    // Step 2: Build query (DO NOT AWAIT YET)
    let query = supabaseClient
      .from("vulnerabilities_threat")
      .select(`
        vt_id,
        vt_name,
        vt_status,
        vt_value,
        scans!inner(
          scan_id,
          scan_start,
          scan_end,
          network_id,
          networks(
            bssid,
            ssid
          )
        ),
        detail:vulnerability_threat_details(
          vt_code,
          vt_severity_rating,
          vt_cvss_base_score
        )
      `)
      .eq("scan_id", latestScanId);

    // Only return rows that represent vulnerability findings (not runtime threats)
    // Use .ilike for case-insensitive match (DB may store "VULNERABILITY" or "vulnerability")
    query = query.ilike("vt_kind", "vulnerability");

    // Step 3: Execute Query
    const { data, error } = await query;

    if (error) {
      console.error("[getVulnerabilitiesLatest] Supabase query error:", error);
      throw error;
    }

    console.log("[getVulnerabilitiesLatest] raw rows from Supabase:", data?.length, "rows");
    if (data?.length > 0) {
      console.log("[getVulnerabilitiesLatest] first raw row:", JSON.stringify(data[0], null, 2));
    }

    // Step 4: Map Results
    const rows = (data || [])
      .map((item) => {
        // FIX: The property is now "scans" (plural) because we removed the alias
        // Supabase might return an object or single-item array for foreign keys
        const scanObj = Array.isArray(item.scans) ? item.scans[0] : item.scans;
        
        // FIX: The property inside is "networks" (plural)
        const netObj = scanObj?.networks; 

        return {
          id: item.vt_id,
          severity: item.detail?.vt_severity_rating ?? "N/A",
          name: item.vt_name,
          score: item.detail?.vt_cvss_base_score ?? null,
          observedConfig: item.vt_value,
          
          // Use the variables we extracted above
          scan_id: scanObj?.scan_id ?? null,
          detectedTime: scanObj?.scan_start,
          network_id: scanObj?.network_id ?? null,
          bssid: netObj?.bssid ?? null,
          ssid: netObj?.ssid ?? null,
        };
      })
      .sort((a, b) => new Date(b.detectedTime) - new Date(a.detectedTime));

    // Debug log: show how many rows we are returning for this bssid
    console.log(
      `getVulnerabilitiesLatest: bssid=${normalizedBssid}, rows=${rows.length}`
    );

    return res.json({ status: "OK", rows });

  } catch (error) {
    console.error("getVulnerabilitiesLatest error:", error);
    res.status(500).json({ error: "Failed to load vulnerabilities" });
  }
}





module.exports = {
  getNetworkMetadata,
  getVulnerabilitiesLatest,
};
