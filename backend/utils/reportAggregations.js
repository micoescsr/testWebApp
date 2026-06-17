// backend/utils/reportAggregations.js
// Pure data-shaping functions for the SAM export reports (summary + per-network
// PDF). Kept separate from dashboardService's I/O so the shaping logic is
// independently testable — dashboardService only does the Supabase fetching
// and joining, then hands rows here.

const { categorizeFinding } = require("./findingCategory");

/** Mirrors the risk bands shown in the report's "Risk Classification Bands" table. */
function riskLabelForReport(score) {
  const n = Number(score) || 0;
  if (n <= 0) return "None";
  if (n < 40) return "Low";
  if (n < 70) return "Medium";
  if (n < 90) return "High";
  return "Critical";
}

/**
 * rows: [{ ssid, bssid, channel, encryption_status, num_clients, risk_score, findings }]
 * Returns the report's `networks[]` shape, sorted by risk descending.
 */
function buildNetworkRiskTable(rows) {
  return (rows || [])
    .map((r) => ({
      ssid: r.ssid,
      bssid: r.bssid,
      channel: r.channel,
      encryption: r.encryption_status,
      clients: r.num_clients || 0,
      riskPercent: r.risk_score || 0,
      riskLabel: riskLabelForReport(r.risk_score),
      findings: r.findings || 0,
    }))
    .sort((a, b) => b.riskPercent - a.riskPercent);
}

/**
 * findings: [{ network, vt_code, vt_name, vt_kind, vt_severity_rating, vt_cvss_base_score, occurrences }]
 * Returns the report's `detailedFindings` shape — 3 fixed buckets.
 */
function buildDetailedFindings(findings) {
  const buckets = { openAndWeakCrypto: [], misconfigurations: [], activeThreats: [] };

  (findings || []).forEach((f) => {
    const bucket = categorizeFinding({ vt_code: f.vt_code, vt_kind: f.vt_kind });
    const kind = (f.vt_kind || "").toUpperCase() === "THREAT" ? "Threat" : "Vulnerability";
    const row = {
      network: f.network,
      finding: `${f.vt_name} (${f.vt_code})`,
      kind,
      severity: f.vt_severity_rating,
      cvss: f.vt_cvss_base_score,
    };
    if (kind === "Threat") row.occurrences = f.occurrences || 0;
    buckets[bucket].push(row);
  });

  return buckets;
}

/**
 * rows: [{ scan_id, ssid, bssid, finished_at, risk_score }]
 * Returns the report's Appendix "Historical Scan Data" shape.
 * Scan start/end aren't tracked separately today, so both columns use finished_at.
 */
function buildHistoricalScansTable(rows) {
  return (rows || []).map((r) => ({
    scanId: r.scan_id,
    ssid: r.ssid,
    bssid: r.bssid,
    start: r.finished_at,
    end: r.finished_at,
    risk: r.risk_score,
  }));
}

/**
 * findings: [{ vt_code, vt_name, vt_kind, vt_severity_rating, vt_cvss_base_score, occurrences }]
 * Returns the per-network report's `vulnerabilities` / `threats` list shape.
 */
function buildFindingsLists(findings) {
  const vulnerabilities = [];
  const threats = [];

  (findings || []).forEach((f) => {
    const isThreat = (f.vt_kind || "").toUpperCase() === "THREAT";
    const row = {
      id: f.vt_code,
      name: f.vt_name,
      severity: f.vt_severity_rating,
      cvss: f.vt_cvss_base_score,
    };
    if (isThreat) {
      row.occurrences = f.occurrences || 0;
      threats.push(row);
    } else {
      row.presence = "Detected";
      vulnerabilities.push(row);
    }
  });

  return { vulnerabilities, threats };
}

/**
 * Static rule-based remediation catalog keyed by vt_code — mirrors the
 * report's own claim of being "rule-based, no AI". Update when new WFVT
 * codes are catalogued (see backend/THREATS.md / vulnerability_threat_details).
 */
const REMEDIATION_CATALOG = {
  "WFVT-001": {
    action: "Migrate to WPA3-SAE / WPA2-AES",
    priority: "Immediate",
    responsible: "Network Admin",
    quickWinText: "Migrate open SSIDs to WPA3-SAE or WPA2-AES only",
    impact: "Exposure of traffic to interception on open networks",
  },
  "WFVT-002": {
    action: "Disable WPS on all access points",
    priority: "Immediate",
    responsible: "Network Admin",
    quickWinText: "Disable WPS on all access points",
    impact: "Risk of password recovery via WPS PIN brute-force",
  },
  "WFVT-003": {
    action: "Migrate to WPA3-SAE / WPA2-AES, disable TKIP",
    priority: "Immediate",
    responsible: "Network Admin",
    quickWinText: "Migrate weakly-encrypted SSIDs to WPA3-SAE or WPA2-AES only",
    impact: "Exposure of traffic to interception via weak/deprecated encryption",
  },
  "WFVT-005": {
    action: "Enable PMF (required mode)",
    priority: "Immediate",
    responsible: "Network Admin",
    quickWinText: "Enable Protected Management Frames (PMF) in required mode",
    impact: "Disruption of connectivity through deauthentication attacks",
  },
  "WFVT-006": {
    action: "Enable rogue AP / evil twin detection",
    priority: "Immediate",
    responsible: "Network Admin / ITSO",
    quickWinText: "Configure rogue AP / evil twin detection on WLAN controller",
    impact: "Potential account takeover via evil twin hotspots",
  },
  "WFVT-007": {
    action: "Deploy DAI + DHCP snooping",
    priority: "Short term",
    responsible: "Network Admin",
    quickWinText: "Deploy dynamic ARP inspection (DAI) and DHCP snooping",
    impact: "Risk of data theft and unauthorized network access via MAC spoofing",
  },
  "WFVT-008": {
    action: "Deploy WIDS deauth alerts",
    priority: "Immediate",
    responsible: "Network Admin / SOC",
    quickWinText: "Deploy WIDS alerts for deauthentication frame bursts",
    impact: "Disruption of connectivity through deauthentication attacks",
  },
};

/**
 * uniqueCodes: string[] of distinct vt_codes detected across the assessed networks.
 * Returns remediation plan + executive-summary inputs, all derived from the
 * static rule-based catalog above — nothing invented per-network.
 */
function buildRemediationPlan(uniqueCodes) {
  const entries = (uniqueCodes || [])
    .map((code) => ({ code, def: REMEDIATION_CATALOG[code] }))
    .filter((e) => e.def);

  const detailedMapping = entries.map(({ code, def }) => ({
    finding: code,
    action: def.action,
    priority: def.priority,
    responsible: def.responsible,
  }));

  const quickWins = entries
    .filter((e) => e.def.priority === "Immediate")
    .map((e) => e.def.quickWinText);

  const mediumTerm = entries
    .filter((e) => e.def.priority === "Short term")
    .map((e) => e.def.quickWinText);

  const keyBusinessImpacts = [...new Set(entries.map((e) => e.def.impact))];

  const topActions = [...quickWins, ...mediumTerm].slice(0, 5);

  return { quickWins, mediumTerm, detailedMapping, keyBusinessImpacts, topActions };
}

module.exports = {
  riskLabelForReport,
  buildNetworkRiskTable,
  buildDetailedFindings,
  buildHistoricalScansTable,
  buildFindingsLists,
  buildRemediationPlan,
};
