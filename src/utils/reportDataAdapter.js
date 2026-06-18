// utils/reportDataAdapter.js
// Maps live /api/dashboard responses into the shape reportTemplates.js expects
// (previously fed by src/data/mockReportData.js). See
// docs/feature-notes/SAM_EXPORT_IMPLEMENTATION_PLAN.md for the field mapping.

import { getDashboardSummary, getDashboardForNetwork } from "../api/dashboardApi";

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
    riskTrend: data.riskTrend || [],
    historicalScans: data.historicalScans || [],
  };
}
