// backend/utils/reportAggregations.js
// Pure data-shaping functions for the SAM export reports (summary + per-network
// PDF). Kept separate from dashboardService's I/O so the shaping logic is
// independently testable — dashboardService only does the Supabase fetching
// and joining, then hands rows here.

const { categorizeFinding } = require("./findingCategory");
const {
  RECOMMENDATION_MAP,
  getRecommendationsForThreat,
  resolveSourceObjects,
} = require("../../src/data/recommendationMap.cjs");

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
 * rows: [{ finished_at, risk_score }]
 * Returns the per-network report's "Risk Trend" table shape (date/time split
 * from finished_at, level derived via riskLabelForReport).
 */
function buildRiskTrendTable(rows) {
  return (rows || []).map((r) => {
    const score = r.risk_score ?? 0;
    const [date, timeWithZone] = (r.finished_at || "").split("T");
    const time = (timeWithZone || "").replace(/Z$|[+-]\d{2}:?\d{2}$/, "");
    return { date, time, score, level: riskLabelForReport(score) };
  });
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
 * Collect the standards-based recommendations for a single detected vt_code,
 * pulling from recommendationMap.cjs (the single source of truth):
 * - vulnerability codes (WFVT-001..004) map directly to their recommendations
 * - threat codes (WFVT-005..007) reverse-map to recommendations from the
 *   vulnerabilities that reference them
 */
function collectRecommendationsForCode(code) {
  const out = [];
  const entry = RECOMMENDATION_MAP[code];
  if (entry) {
    for (const r of entry.recommendations) {
      out.push({ ...r, fromVulnerability: code, fromVulnerabilityName: entry.name });
    }
  }
  for (const r of getRecommendationsForThreat(code)) {
    out.push(r);
  }
  return out;
}

/**
 * uniqueCodes: string[] of distinct vt_codes detected across the assessed networks.
 * Returns remediation plan + executive-summary inputs, all derived from the
 * standards-based recommendation map (NIST SP 800-97/153, ITL Bulletin) — only
 * for codes actually detected. Unknown codes are ignored.
 *
 * detailedMapping rows carry source label(s) + URL(s) so report templates can
 * render clickable standard references.
 */
function buildRemediationPlan(uniqueCodes) {
  const recs = [];
  for (const code of uniqueCodes || []) {
    for (const r of collectRecommendationsForCode(code)) recs.push(r);
  }

  // De-duplicate by recommendation text (same action across findings/threats).
  const seen = new Set();
  const deduped = recs.filter((r) => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  });

  const detailedMapping = deduped.map((r) => {
    const sourceObjs = resolveSourceObjects(r.sources);
    return {
      finding: r.fromVulnerabilityName || r.fromVulnerability || "—",
      action: r.text,
      source: sourceObjs.map((s) => s.label).join(", "),
      sourceUrls: sourceObjs.map((s) => s.url).filter(Boolean),
      priority: r.priority || "Immediate",
      responsible: r.responsible || "Network Administrator",
    };
  });

  const quickWins = detailedMapping
    .filter((r) => r.priority === "Immediate")
    .map((r) => r.action);

  const mediumTerm = detailedMapping
    .filter((r) => r.priority !== "Immediate")
    .map((r) => r.action);

  const keyBusinessImpacts = [
    ...new Set(deduped.map((r) => r.technicalMeaning).filter(Boolean)),
  ];

  const topActions = [...quickWins, ...mediumTerm].slice(0, 5);

  return { quickWins, mediumTerm, detailedMapping, keyBusinessImpacts, topActions };
}

module.exports = {
  riskLabelForReport,
  buildNetworkRiskTable,
  buildDetailedFindings,
  buildHistoricalScansTable,
  buildRiskTrendTable,
  buildFindingsLists,
  buildRemediationPlan,
};
