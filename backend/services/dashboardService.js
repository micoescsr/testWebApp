// services/dashboardService.js
//
// Dashboard data service — queries Supabase views and tables to produce
// the exact shapes the frontend charts expect.
//
// Relies on two Postgres views that must exist in Supabase:
//   • latest_scan_per_network  (one row per network: latest COMPLETED scan)
//   • latest_scan_findings     (findings joined through both scan tables)
//
// All queries use the service-role client (bypasses RLS).

const { supabaseClient } = require("../config/supabaseClient");

// ─── Severity buckets (always include all four, even if count is 0) ──
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"];

function buildSeverityData(findings) {
  // findings = array of rows with { vt_severity_rating, vt_kind }
  const map = {};
  SEVERITY_ORDER.forEach((s) => {
    map[s] = { severity: s, vulnerabilities: 0, threats: 0 };
  });

  (findings || []).forEach((f) => {
    // Normalise: DB stores UPPER CASE, chart expects Title Case
    const raw = (f.vt_severity_rating || "").toUpperCase();
    const label =
      raw === "CRITICAL"
        ? "Critical"
        : raw === "HIGH"
        ? "High"
        : raw === "MEDIUM"
        ? "Medium"
        : raw === "LOW"
        ? "Low"
        : null;
    if (!label) return;

    const kind = (f.vt_kind || "").toUpperCase();
    if (kind === "VULNERABILITY") map[label].vulnerabilities += 1;
    else if (kind === "THREAT") map[label].threats += 1;
  });

  return SEVERITY_ORDER.map((s) => map[s]);
}

// ──────────────────────────────────────────────────────────────────────
// 1. GET ALL NETWORKS (for the dropdown)
// ──────────────────────────────────────────────────────────────────────
async function getNetworksList() {
  const { data, error } = await supabaseClient
    .from("networks")
    .select("network_id, ssid")
    .order("ssid", { ascending: true });

  if (error) throw error;
  return data || [];
}

// ──────────────────────────────────────────────────────────────────────
// 2. GET SCAN LIST FOR A NETWORK (for the date dropdown)
//    Query #19 — all COMPLETED vulnerability_scans for a network
// ──────────────────────────────────────────────────────────────────────
async function getScansForNetwork(networkId) {
  const { data, error } = await supabaseClient
    .from("vulnerability_scans")
    .select("scan_id, finished_at")
    .eq("network_id", networkId)
    .eq("status", "COMPLETED")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// ──────────────────────────────────────────────────────────────────────
// 3. SUMMARY DATA (all networks aggregated) — Queries #11-#18
// ──────────────────────────────────────────────────────────────────────
async function getSummaryData() {
  // --- Query #11: last scan date (global) ---
  const lastScanP = supabaseClient
    .from("vulnerability_scans")
    .select("finished_at")
    .eq("status", "COMPLETED")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // --- Query #12: open networks ---
  const openP = supabaseClient
    .from("networks")
    .select("network_id", { count: "exact", head: true })
    .eq("encryption_status", "Open");

  // --- Query #13: encrypted networks ---
  const encP = supabaseClient
    .from("networks")
    .select("network_id", { count: "exact", head: true })
    .neq("encryption_status", "Open");

  // --- Query #15: total clients ---
  const clientsP = supabaseClient.from("networks").select("num_clients");

  // --- Query #16: avg risk score from latest_scan_per_network ---
  const riskP = supabaseClient
    .from("latest_scan_per_network")
    .select("risk_score");

  // --- Queries #14, #17, #18: need findings ---
  const findingsP = supabaseClient
    .from("latest_scan_findings")
    .select(
      "vt_detail_id, vt_severity_rating, vt_kind, vt_cvss_base_score, network_id"
    );

  // --- Networks for top-5 join ---
  const networksP = supabaseClient
    .from("networks")
    .select("network_id, ssid, num_clients, risk_score");

  // Execute all in parallel
  const [lastScanR, openR, encR, clientsR, riskR, findingsR, networksR] =
    await Promise.all([
      lastScanP,
      openP,
      encP,
      clientsP,
      riskP,
      findingsP,
      networksP,
    ]);

  // Throw on any critical error
  for (const r of [lastScanR, openR, encR, clientsR, riskR, findingsR, networksR]) {
    if (r.error) throw r.error;
  }

  // --- Derive values ---
  const lastScan = lastScanR.data?.finished_at || null;

  const openNetworks = openR.count ?? 0;
  const encryptedNetworks = encR.count ?? 0;

  // #14: total distinct findings
  const uniqueDetails = new Set(
    (findingsR.data || []).map((f) => f.vt_detail_id).filter(Boolean)
  );
  const totalFindings = uniqueDetails.size;

  // #15: sum clients
  const totalClients = (clientsR.data || []).reduce(
    (sum, n) => sum + (n.num_clients || 0),
    0
  );

  // #16: avg risk
  const riskRows = riskR.data || [];
  const avgRisk =
    riskRows.length > 0
      ? Math.round(
          riskRows.reduce((s, r) => s + (r.risk_score || 0), 0) /
            riskRows.length
        )
      : 0;

  const riskScoreData = [{ name: "Wi-Fi Risk", value: avgRisk }];

  // #17: severity breakdown
  const severityData = buildSeverityData(findingsR.data);

  // #18: top 5 networks by risk
  const networkMap = {};
  (networksR.data || []).forEach((n) => {
    networkMap[n.network_id] = n;
  });

  // Count severities per network from findings
  const netSevCount = {};
  (findingsR.data || []).forEach((f) => {
    if (!f.network_id) return;
    netSevCount[f.network_id] = (netSevCount[f.network_id] || 0) + 1;
  });

  const topRisks = Object.values(networkMap)
    .map((n) => ({
      ssid: n.ssid || "Unknown",
      risk: n.risk_score || 0,
      severityCount: netSevCount[n.network_id] || 0,
      clients: n.num_clients || 0,
    }))
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 5);

  // Derived: encryption pie
  const networkEncryptionData = [
    { name: "Open", value: openNetworks },
    { name: "Encrypted", value: encryptedNetworks },
  ];

  return {
    lastScan,
    openNetworks,
    encryptedNetworks,
    totalFindings,
    totalClients,
    riskScoreData,
    severityData,
    topRisks,
    networkEncryptionData,
  };
}

// ──────────────────────────────────────────────────────────────────────
// 4. PER-NETWORK DATA (latest scan) — Queries #1-#10
// ──────────────────────────────────────────────────────────────────────
async function getNetworkDashboard(networkId, scanId) {
  // If a specific scanId is provided, use the scan-scoped path
  if (scanId) {
    return getNetworkDashboardByScan(networkId, scanId);
  }
  return getNetworkDashboardLatest(networkId);
}

async function getNetworkDashboardLatest(networkId) {
  // --- #1 + #2: latest scan info ---
  const latestScanP = supabaseClient
    .from("latest_scan_per_network")
    .select("finished_at, risk_score")
    .eq("network_id", networkId)
    .maybeSingle();

  // --- #3 + #4: network info ---
  const networkP = supabaseClient
    .from("networks")
    .select("encryption_status, num_clients")
    .eq("network_id", networkId)
    .maybeSingle();

  // --- #5-#9: findings for this network's latest scan ---
  const findingsP = supabaseClient
    .from("latest_scan_findings")
    .select(
      "vt_detail_id, vt_name, vt_severity_rating, vt_kind, vt_cvss_base_score"
    )
    .eq("network_id", networkId);

  // --- #10: historical scans (always all, not scoped) ---
  const historyP = supabaseClient
    .from("vulnerability_scans")
    .select("finished_at, scan_risk_score")
    .eq("network_id", networkId)
    .eq("status", "COMPLETED")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: true });

  // --- Historical client counts from networks table (only one row for now) ---
  const networkClientsP = supabaseClient
    .from("networks")
    .select("num_clients")
    .eq("network_id", networkId)
    .maybeSingle();

  // --- #19: scan list for date dropdown ---
  const scanListP = getScansForNetwork(networkId);

  const [latestScanR, networkR, findingsR, historyR, networkClientsR, scanList] =
    await Promise.all([
      latestScanP,
      networkP,
      findingsP,
      historyP,
      networkClientsP,
      scanListP,
    ]);

  // Check errors
  for (const r of [latestScanR, networkR, findingsR, historyR, networkClientsR]) {
    if (r.error) throw r.error;
  }

  return shapeNetworkResponse(
    latestScanR.data,
    networkR.data,
    findingsR.data,
    historyR.data,
    networkClientsR.data,
    scanList
  );
}

// ──────────────────────────────────────────────────────────────────────
// 4b. PER-NETWORK DATA — SCOPED TO A SPECIFIC SCAN (date filter)
//     Queries #1-#9 re-run against the chosen scan_id.
//     Query #10 (history) is always ALL scans (gives trend context).
// ──────────────────────────────────────────────────────────────────────
async function getNetworkDashboardByScan(networkId, scanId) {
  // Validate the scan belongs to this network
  const { data: scanRow, error: scanErr } = await supabaseClient
    .from("vulnerability_scans")
    .select("scan_id, finished_at, scan_risk_score, network_id")
    .eq("scan_id", scanId)
    .eq("network_id", networkId)
    .eq("status", "COMPLETED")
    .maybeSingle();

  if (scanErr) throw scanErr;
  if (!scanRow) {
    const err = new Error("Scan not found for this network");
    err.status = 404;
    throw err;
  }

  // Find the legacy scans row whose scan_end is closest to (and at or before)
  // this vulnerability_scan's finished_at, so we can join vulnerabilities_threat
  // and read the correct risk_score for the selected scan date.
  const { data: legacyScan, error: legErr } = await supabaseClient
    .from("scans")
    .select("scan_id, risk_score")
    .eq("network_id", networkId)
    .lte("scan_end", scanRow.finished_at)
    .order("scan_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legErr) throw legErr;

  let findings = [];
  if (legacyScan) {
    // Get findings for this legacy scan
    const { data: vtRows, error: vtErr } = await supabaseClient
      .from("vulnerabilities_threat")
      .select("vt_detail_id, vt_name, vt_kind, severity_score, scan_id")
      .eq("scan_id", legacyScan.scan_id);

    if (vtErr) throw vtErr;

    // Enrich with detail table for severity_rating and cvss
    if (vtRows && vtRows.length > 0) {
      const detailIds = [
        ...new Set(vtRows.map((v) => v.vt_detail_id).filter(Boolean)),
      ];

      if (detailIds.length > 0) {
        const { data: details, error: dErr } = await supabaseClient
          .from("vulnerability_threat_details")
          .select("vt_detail_id, vt_severity_rating, vt_kind, vt_cvss_base_score, vt_name")
          .in("vt_detail_id", detailIds);

        if (dErr) throw dErr;

        const detailMap = {};
        (details || []).forEach((d) => {
          detailMap[d.vt_detail_id] = d;
        });

        findings = vtRows.map((v) => {
          const d = detailMap[v.vt_detail_id] || {};
          return {
            vt_detail_id: v.vt_detail_id,
            vt_name: d.vt_name || v.vt_name,
            vt_severity_rating: d.vt_severity_rating || null,
            vt_kind: d.vt_kind || v.vt_kind,
            vt_cvss_base_score: d.vt_cvss_base_score ?? v.severity_score ?? null,
          };
        });
      }
    }
  }

  // Network info
  const { data: networkInfo, error: netErr } = await supabaseClient
    .from("networks")
    .select("encryption_status, num_clients")
    .eq("network_id", networkId)
    .maybeSingle();

  if (netErr) throw netErr;

  // History (always all scans)
  const { data: history, error: histErr } = await supabaseClient
    .from("vulnerability_scans")
    .select("finished_at, scan_risk_score")
    .eq("network_id", networkId)
    .eq("status", "COMPLETED")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: true });

  if (histErr) throw histErr;

  // Scan list for dropdown
  const scanList = await getScansForNetwork(networkId);

  // Shape the scan row like what shapeNetworkResponse expects.
  // Prefer the legacy scans.risk_score (always populated) over
  // vulnerability_scans.scan_risk_score (often null).
  const latestScanData = {
    finished_at: scanRow.finished_at,
    risk_score: legacyScan?.risk_score ?? scanRow.scan_risk_score ?? 0,
  };

  return shapeNetworkResponse(
    latestScanData,
    networkInfo,
    findings,
    history,
    networkInfo,
    scanList
  );
}

// ──────────────────────────────────────────────────────────────────────
// SHARED: shape the per-network response object
// ──────────────────────────────────────────────────────────────────────
function shapeNetworkResponse(
  latestScan,
  networkInfo,
  findings,
  history,
  networkClients,
  scanList
) {
  const lastScan = latestScan?.finished_at || null;
  const riskScore = latestScan?.risk_score ?? 0;
  const riskScoreData = [{ name: "Wi-Fi Risk", value: riskScore }];

  const encryptionStatus = networkInfo?.encryption_status || "Unknown";
  const numClients = networkClients?.num_clients ?? 0;

  const safeFindings = findings || [];

  // #5 + #6: count vulns vs threats
  let totalVulns = 0;
  let totalThreats = 0;
  safeFindings.forEach((f) => {
    const kind = (f.vt_kind || "").toUpperCase();
    if (kind === "VULNERABILITY") totalVulns++;
    else if (kind === "THREAT") totalThreats++;
  });

  // #7: kind split
  const kindSplitData = [
    { name: "THREAT", value: totalThreats },
    { name: "VULNERABILITY", value: totalVulns },
  ];

  // #8: severity breakdown
  const severityData = buildSeverityData(safeFindings);

  // #9: top 5 by CVSS
  const commonVulnsData = safeFindings
    .filter((f) => f.vt_cvss_base_score != null)
    .sort((a, b) => (b.vt_cvss_base_score || 0) - (a.vt_cvss_base_score || 0))
    .slice(0, 5)
    .map((f) => ({
      name: f.vt_name || "Unknown",
      severity: normaliseSeverity(f.vt_severity_rating),
      vt_cvss_base_score: f.vt_cvss_base_score,
    }));

  // #10: clients vs risk trend
  const clientsRiskTrendData = (history || []).map((h, i) => ({
    scan: formatDateLabel(h.finished_at, i),
    clients: numClients, // per-scan client snapshot not stored; use current
    risk: h.scan_risk_score ?? 0,
  }));

  return {
    lastScan,
    riskScoreData,
    encryptionStatus,
    numClients,
    totalVulns,
    totalThreats,
    kindSplitData,
    severityData,
    commonVulnsData,
    clientsRiskTrendData,
    scanList: scanList || [],
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function normaliseSeverity(rating) {
  const r = (rating || "").toUpperCase();
  if (r === "CRITICAL") return "Critical";
  if (r === "HIGH") return "High";
  if (r === "MEDIUM") return "Medium";
  if (r === "LOW") return "Low";
  return "Unknown";
}

function formatDateLabel(isoDate, index) {
  if (!isoDate) return `Scan ${index + 1}`;
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return `Scan ${index + 1}`;
  }
}

module.exports = {
  getNetworksList,
  getScansForNetwork,
  getSummaryData,
  getNetworkDashboard,
};
