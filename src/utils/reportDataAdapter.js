// utils/reportDataAdapter.js
// Maps live /api/dashboard responses into the shape reportTemplates.js expects
// (previously fed by src/data/mockReportData.js). See
// docs/feature-notes/SAM_EXPORT_IMPLEMENTATION_PLAN.md for the field mapping.

import { getDashboardSummary, getDashboardForNetwork } from "../api/dashboardApi";
import {
  RECOMMENDATION_MAP,
  SOURCES,
  getRecommendationsForThreat,
} from "../data/recommendationMap.cjs";

/** Resolve source keys → label string + url list for report rendering. */
function recToReportItem(r) {
  const labels = (r.sources || []).map((s) => SOURCES[s]?.label || s);
  const sourceUrls = (r.sources || []).map((s) => SOURCES[s]?.url).filter(Boolean);
  return {
    text: r.text,
    ref: labels.join(", "),
    sourceUrls,
    responsible: r.responsible || "Network Administrator",
    priority: r.priority || "Immediate",
  };
}

/**
 * Conditional recommendations for the detected findings only:
 * vulnerabilities map directly, threats reverse-map. De-duped by text.
 */
function collectRecsForFindings(vulns = [], threats = []) {
  const recs = [];
  for (const v of vulns) {
    const entry = RECOMMENDATION_MAP[v.id];
    if (!entry) continue;
    for (const r of entry.recommendations) {
      recs.push({ ...r, fromVulnerabilityName: entry.name });
    }
  }
  for (const t of threats) {
    for (const r of getRecommendationsForThreat(t.id)) recs.push(r);
  }
  const seen = new Set();
  return recs.filter((r) => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  });
}

/** Finding-level issue/impact/evidence blocks built from the recommendation map. */
function buildFindingDetails(vulns = [], threats = []) {
  const details = [];
  for (const v of vulns) {
    const entry = RECOMMENDATION_MAP[v.id];
    const recs = entry ? entry.recommendations : [];
    details.push({
      id: v.id,
      title: v.name,
      issue: entry ? `${entry.name} was detected during analysis.` : `${v.name} was detected during analysis.`,
      impact: recs.map((r) => r.technicalMeaning).filter(Boolean).join(" ") || "Review and apply the recommendations to mitigate risk.",
      evidence: recs.map((r) => r.verbatimEvidence).filter(Boolean).map((e) => `"${e}"`).join(" | ") || "N/A",
      isThreat: false,
    });
  }
  for (const t of threats) {
    const recs = getRecommendationsForThreat(t.id);
    details.push({
      id: t.id,
      title: t.name,
      issue: `${t.name} detected during monitoring.`,
      impact: recs.map((r) => r.technicalMeaning).filter(Boolean).join(" ") || "Review and apply the recommendations to mitigate risk.",
      evidence: recs.map((r) => r.verbatimEvidence).filter(Boolean).map((e) => `"${e}"`).join(" | ") || "N/A",
      isThreat: true,
    });
  }
  return details;
}

function todayFormatted() {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Mirrors backend/utils/reportAggregations.js riskLabelForReport (same risk bands shown in the report). */
function riskLabelForScore(score) {
  const n = Number(score) || 0;
  if (n <= 0) return "None";
  if (n < 40) return "Low";
  if (n < 70) return "Medium";
  if (n < 90) return "High";
  return "Critical";
}

export async function buildOverallReportData() {
  const { data } = await getDashboardSummary();

  const overallRiskScore = data.riskScoreData?.[0]?.value ?? 0;
  const severityBreakdown = (data.severityData || []).map((s) => ({
    ...s,
    total: (s.vulnerabilities || 0) + (s.threats || 0),
  }));
  const criticalRow = severityBreakdown.find((s) => s.severity === "Critical");
  const highRow = severityBreakdown.find((s) => s.severity === "High");
  const remediation = data.remediation || { quickWins: [], mediumTerm: [], detailedMapping: [], keyBusinessImpacts: [], topActions: [] };

  return {
    meta: {
      version: "1.0",
      dateOfIssue: todayFormatted(),
      preparedBy: "Why-PII Wi-Fi Security Team",
      reviewedBy: "—",
      classification: "Confidential – For internal use only",
      assessmentWindow: data.lastScan ? `Through ${new Date(data.lastScan).toLocaleDateString()}` : "N/A",
    },
    executiveSummary: {
      overallRiskScore,
      riskLabel: riskLabelForScore(overallRiskScore),
      criticalFindings: criticalRow?.total ?? 0,
      highFindings: highRow?.total ?? 0,
      totalClientsAtRisk: data.totalClients ?? 0,
      keyBusinessImpacts: remediation.keyBusinessImpacts || [],
      top5Actions: remediation.topActions || [],
    },
    networks: data.allNetworks || [],
    severityBreakdown,
    detailedFindings: data.detailedFindings || { openAndWeakCrypto: [], misconfigurations: [], activeThreats: [] },
    remediation,
    historicalScans: data.historicalScans || [],
  };
}

export async function buildPerNetworkReportData(networkId, scanId) {
  const { data } = await getDashboardForNetwork(networkId, scanId);

  const riskScore = data.riskScoreData?.[0]?.value ?? 0;
  const findings = data.reportFindings || { vulnerabilities: [], threats: [] };

  // Conditional, standards-sourced recommendations for the detected findings.
  const recItems = collectRecsForFindings(findings.vulnerabilities, findings.threats).map(recToReportItem);

  return {
    meta: {
      dateOfIssue: todayFormatted(),
      preparedBy: "Why-PII Wi-Fi Security Team",
      forWhom: "Network Owner / Administrator",
      classification: "Confidential",
      lastScan: data.lastScan || "N/A",
    },
    network: {
      ssid: data.ssid,
      bssid: data.bssid,
      channel: data.channel,
      encryption: data.encryptionStatus,
      clients: data.numClients ?? 0,
      lastScanDate: data.lastScan,
      lastScanTime: data.lastScan,
    },
    riskScore,
    riskLabel: data.riskLabel,
    vulnerabilities: findings.vulnerabilities,
    threats: findings.threats,
    findingDetails: buildFindingDetails(findings.vulnerabilities, findings.threats),
    recommendations: {
      immediate: recItems.filter((r) => r.priority === "Immediate"),
      shortTerm: recItems.filter((r) => r.priority !== "Immediate"),
    },
    riskTrend: data.riskTrend || [],
    historicalScans: data.historicalScans || [],
  };
}
