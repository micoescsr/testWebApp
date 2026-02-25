// api/dashboardApi.js
import { supabase } from "../lib/supabaseClient";

// ================================================================
// SUMMARY DASHBOARD
// ================================================================

export const getDashboardSummary = async () => {
  // Q11: Global last scan date
  const { data: lastScanRow } = await supabase
    .from("scans")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Q12: Open networks count
  const { count: openCount } = await supabase
    .from("networks")
    .select("*", { count: "exact", head: true })
    .eq("encryption_status", "Open");

  // Q13: Encrypted networks count
  const { count: encryptedCount } = await supabase
    .from("networks")
    .select("*", { count: "exact", head: true })
    .neq("encryption_status", "Open");

  // Q14: Total unique vulnerabilities/threats across all networks
  const { data: totalFindingsRow } = await supabase
    .from("latest_scan_findings")
    .select("vt_detail_id");
  const totalFindings = new Set(totalFindingsRow?.map((r) => r.vt_detail_id)).size;

  // Q15: Total clients
  const { data: clientsRow } = await supabase
    .from("networks")
    .select("num_clients");
  const totalClients = clientsRow?.reduce((sum, r) => sum + (r.num_clients || 0), 0) ?? 0;

  // Q16: Global average risk score
  const { data: avgRiskRow } = await supabase
    .from("latest_scan_per_network")
    .select("risk_score");
  const avgRisk = avgRiskRow?.length
    ? Math.round(avgRiskRow.reduce((sum, r) => sum + r.risk_score, 0) / avgRiskRow.length)
    : 0;

  // Q17: Severity by kind (global)
  const { data: severityRows } = await supabase
    .from("latest_scan_findings")
    .select("vt_severity_rating, vt_kind, vt_detail_id");

  // Q18: Top 5 high-risk networks
  const { data: topNetworksRaw } = await supabase
    .from("latest_scan_per_network")
    .select(`
      network_id,
      risk_score,
      networks ( ssid, num_clients )
    `)
    .order("risk_score", { ascending: false })
    .limit(5);

  // Get finding counts per network for top 5
  const topNetworkIds = topNetworksRaw?.map((r) => r.network_id) ?? [];
  const { data: findingCounts } = await supabase
    .from("latest_scan_findings")
    .select("network_id, vt_detail_id")
    .in("network_id", topNetworkIds);

  // Shape severityData for the bar chart
  // Format: [{ severity, vulnerabilities, threats }, ...]
  const severityMap = {};
  const uniqueFindings = new Map();
  severityRows?.forEach((r) => {
    const key = `${r.vt_detail_id}`;
    if (uniqueFindings.has(key)) return;
    uniqueFindings.set(key, true);

    const sev = r.vt_severity_rating;
    const kind = r.vt_kind?.toUpperCase();
    if (!sev) return;
    if (!severityMap[sev]) severityMap[sev] = { severity: sev, vulnerabilities: 0, threats: 0 };
    if (kind === "VULNERABILITY") severityMap[sev].vulnerabilities += 1;
    if (kind === "THREAT") severityMap[sev].threats += 1;
  });
  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const severityData = severityOrder
    .filter((s) => severityMap[s])
    .map((s) => severityMap[s]);

  // Shape topRisks for the table
  const countsByNetwork = {};
  findingCounts?.forEach((r) => {
    if (!countsByNetwork[r.network_id]) countsByNetwork[r.network_id] = new Set();
    countsByNetwork[r.network_id].add(r.vt_detail_id);
  });
  const topRisks = topNetworksRaw?.map((r) => ({
    ssid: r.networks?.ssid ?? "Unknown",
    risk: r.risk_score,
    severityCount: countsByNetwork[r.network_id]?.size ?? 0,
    clients: r.networks?.num_clients ?? 0,
  })) ?? [];

  // Shape networkEncryptionData for the pie chart
  const networkEncryptionData = [
    { name: "Open", value: openCount ?? 0 },
    { name: "Encrypted", value: encryptedCount ?? 0 },
  ];

  return {
    // Stat cards
    lastScan: lastScanRow?.created_at ?? null,
    openNetworks: openCount ?? 0,
    encryptedNetworks: encryptedCount ?? 0,
    totalFindings,
    totalClients,
    // Charts
    riskScoreData: [{ name: "Wi-Fi Risk", value: avgRisk }],
    severityData,
    topRisks,
    networkEncryptionData,
  };
};


// ================================================================
// PER-NETWORK DASHBOARD
// ================================================================

export const getDashboardForNetwork = async (networkId) => {
  // Q1: Last scan date
  const { data: lastScanRow } = await supabase
    .from("latest_scan_per_network")
    .select("created_at, risk_score")
    .eq("network_id", networkId)
    .single();

  // Q3: Network encryption
  const { data: networkRow } = await supabase
    .from("networks")
    .select("encryption_status, num_clients")
    .eq("network_id", networkId)
    .single();

  // Q5: Total vulnerabilities
  const { data: vulnRows } = await supabase
    .from("latest_scan_findings")
    .select("vt_detail_id")
    .eq("network_id", networkId)
    .eq("vt_kind", "VULNERABILITY");
  const totalVulns = new Set(vulnRows?.map((r) => r.vt_detail_id)).size;

  // Q6: Total threats
  const { data: threatRows } = await supabase
    .from("latest_scan_findings")
    .select("vt_detail_id")
    .eq("network_id", networkId)
    .eq("vt_kind", "THREAT");
  const totalThreats = new Set(threatRows?.map((r) => r.vt_detail_id)).size;

  // Q7: Threat vs Vulnerability donut
  const kindSplitData = [
    { name: "VULNERABILITY", value: totalVulns },
    { name: "THREAT", value: totalThreats },
  ];

  // Q8: Severity distribution (bar chart)
  const { data: severityRows } = await supabase
    .from("latest_scan_findings")
    .select("vt_severity_rating, vt_kind, vt_detail_id")
    .eq("network_id", networkId);

  const severityMap = {};
  const seen = new Set();
  severityRows?.forEach((r) => {
    if (seen.has(r.vt_detail_id)) return;
    seen.add(r.vt_detail_id);
    const sev = r.vt_severity_rating;
    const kind = r.vt_kind?.toUpperCase();
    if (!sev) return;
    if (!severityMap[sev]) severityMap[sev] = { severity: sev, vulnerabilities: 0, threats: 0 };
    if (kind === "VULNERABILITY") severityMap[sev].vulnerabilities += 1;
    if (kind === "THREAT") severityMap[sev].threats += 1;
  });
  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const severityData = severityOrder
    .filter((s) => severityMap[s])
    .map((s) => severityMap[s]);

  // Q9: Top high-risk issues
  const { data: topIssuesRaw } = await supabase
    .from("latest_scan_findings")
    .select("vt_name, vt_severity_rating, vt_cvss_base_score")
    .eq("network_id", networkId)
    .order("vt_cvss_base_score", { ascending: false })
    .limit(5);
  // Deduplicate by name
  const seen2 = new Set();
  const commonVulnsData = topIssuesRaw
    ?.filter((r) => {
      if (seen2.has(r.vt_name)) return false;
      seen2.add(r.vt_name);
      return true;
    })
    .map((r) => ({
      name: r.vt_name,
      severity: r.vt_severity_rating,
      cvss: r.vt_cvss_base_score,
    })) ?? [];

  // Q10: Clients vs Risk trend (line chart)
  const { data: trendRaw } = await supabase
    .from("scans")
    .select("created_at, risk_score, networks(num_clients)")
    .eq("network_id", networkId)
    .order("created_at", { ascending: true });
  const clientsRiskTrendData = trendRaw?.map((r, i) => ({
    scan: `Scan ${i + 1}`,
    clients: r.networks?.num_clients ?? 0,
    risk: r.risk_score ?? 0,
  })) ?? [];

  // Previous scan status (second latest scan's risk score)
  const { data: prevScans } = await supabase
    .from("scans")
    .select("created_at, risk_score")
    .eq("network_id", networkId)
    .order("created_at", { ascending: false })
    .limit(2);
  const prevScore = prevScans?.[1]?.risk_score ?? null;
  const prevScanDate = prevScans?.[1]?.created_at ?? null;

  return {
    // Stat cards
    lastScan: lastScanRow?.created_at ?? null,
    currentRiskScore: lastScanRow?.risk_score ?? 0,
    prevScore,
    prevScanDate,
    encryption: networkRow?.encryption_status ?? "Unknown",
    numClients: networkRow?.num_clients ?? 0,
    totalVulns,
    totalThreats,
    // Charts
    riskScoreData: [{ name: "Wi-Fi Risk", value: lastScanRow?.risk_score ?? 0 }],
    severityData,
    kindSplitData,
    commonVulnsData,
    clientsRiskTrendData,
  };
};