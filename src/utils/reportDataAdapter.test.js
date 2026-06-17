// utils/reportDataAdapter.test.js
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../api/dashboardApi", () => ({
  getDashboardSummary: vi.fn(),
  getDashboardForNetwork: vi.fn(),
}));

import { getDashboardSummary, getDashboardForNetwork } from "../api/dashboardApi";
import { buildOverallReportData, buildPerNetworkReportData } from "./reportDataAdapter";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildOverallReportData", () => {
  const summaryResponse = {
    data: {
      riskScoreData: [{ name: "Wi-Fi Risk", value: 72 }],
      severityData: [
        { severity: "Critical", vulnerabilities: 2, threats: 3 },
        { severity: "High", vulnerabilities: 4, threats: 4 },
        { severity: "Medium", vulnerabilities: 0, threats: 0 },
        { severity: "Low", vulnerabilities: 0, threats: 0 },
      ],
      totalClients: 75,
      allNetworks: [
        { ssid: "Nacho_WiFi", bssid: "AA", channel: 6, encryption: "Open", clients: 22, riskPercent: 100, riskLabel: "Critical", findings: 6 },
      ],
      detailedFindings: { openAndWeakCrypto: [], misconfigurations: [], activeThreats: [] },
      historicalScans: [],
      remediation: { quickWins: [], mediumTerm: [], detailedMapping: [], keyBusinessImpacts: [], topActions: [] },
    },
  };

  test("fetches summary and maps overallRiskScore from riskScoreData", async () => {
    getDashboardSummary.mockResolvedValue(summaryResponse);
    const result = await buildOverallReportData();
    expect(result.executiveSummary.overallRiskScore).toBe(72);
  });

  test("derives riskLabel from overallRiskScore", async () => {
    getDashboardSummary.mockResolvedValue(summaryResponse);
    const result = await buildOverallReportData();
    expect(result.executiveSummary.riskLabel).toBe("High");
  });

  test("derives criticalFindings/highFindings from severityData totals", async () => {
    getDashboardSummary.mockResolvedValue(summaryResponse);
    const result = await buildOverallReportData();
    expect(result.executiveSummary.criticalFindings).toBe(5);
    expect(result.executiveSummary.highFindings).toBe(8);
  });

  test("maps severityBreakdown rows with a computed total", async () => {
    getDashboardSummary.mockResolvedValue(summaryResponse);
    const result = await buildOverallReportData();
    expect(result.severityBreakdown[0]).toEqual({
      severity: "Critical",
      vulnerabilities: 2,
      threats: 3,
      total: 5,
    });
  });

  test("passes through allNetworks/detailedFindings/historicalScans/remediation as networks/detailedFindings/historicalScans/remediation", async () => {
    getDashboardSummary.mockResolvedValue(summaryResponse);
    const result = await buildOverallReportData();
    expect(result.networks).toEqual(summaryResponse.data.allNetworks);
    expect(result.detailedFindings).toEqual(summaryResponse.data.detailedFindings);
    expect(result.historicalScans).toEqual(summaryResponse.data.historicalScans);
    expect(result.remediation).toEqual(summaryResponse.data.remediation);
  });

  test("top5Actions comes from remediation.topActions and keyBusinessImpacts from remediation.keyBusinessImpacts", async () => {
    getDashboardSummary.mockResolvedValue({
      data: { ...summaryResponse.data, remediation: { ...summaryResponse.data.remediation, topActions: ["Do X"], keyBusinessImpacts: ["Impact Y"] } },
    });
    const result = await buildOverallReportData();
    expect(result.executiveSummary.top5Actions).toEqual(["Do X"]);
    expect(result.executiveSummary.keyBusinessImpacts).toEqual(["Impact Y"]);
  });
});

describe("buildPerNetworkReportData", () => {
  const networkResponse = {
    data: {
      lastScan: "2026-02-25T09:00:00Z",
      riskScoreData: [{ name: "Wi-Fi Risk", value: 100 }],
      riskLabel: "Critical",
      ssid: "Nacho_WiFi",
      bssid: "AA:BB:CC:DD:EE:01",
      channel: 6,
      encryptionStatus: "Open",
      numClients: 22,
      reportFindings: {
        vulnerabilities: [{ id: "WFVT-001", name: "Lack of Encryption", severity: "Critical", cvss: 9.1, presence: "Detected" }],
        threats: [{ id: "WFVT-008", name: "Deauthentication Attack", severity: "High", cvss: 7.2, occurrences: 5 }],
      },
      clientsRiskTrendData: [{ scan: "Jan 10", clients: 22, risk: 14 }],
      historicalScans: [{ scanId: "s1", ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", start: "2026-01-10T08:59:55Z", end: "2026-01-10T08:59:55Z", risk: 14 }],
    },
  };

  test("fetches per-network dashboard data for the given networkId", async () => {
    getDashboardForNetwork.mockResolvedValue(networkResponse);
    await buildPerNetworkReportData("net-1");
    expect(getDashboardForNetwork).toHaveBeenCalledWith("net-1", undefined);
  });

  test("maps riskScore/riskLabel from response and vulnerabilities/threats from reportFindings", async () => {
    getDashboardForNetwork.mockResolvedValue(networkResponse);
    const result = await buildPerNetworkReportData("net-1");
    expect(result.riskScore).toBe(100);
    expect(result.riskLabel).toBe("Critical");
    expect(result.vulnerabilities).toEqual(networkResponse.data.reportFindings.vulnerabilities);
    expect(result.threats).toEqual(networkResponse.data.reportFindings.threats);
  });

  test("maps network ssid/bssid/channel/encryption/clients", async () => {
    getDashboardForNetwork.mockResolvedValue(networkResponse);
    const result = await buildPerNetworkReportData("net-1");
    expect(result.network).toMatchObject({
      ssid: "Nacho_WiFi",
      bssid: "AA:BB:CC:DD:EE:01",
      channel: 6,
      encryption: "Open",
      clients: 22,
    });
  });

  test("maps riskTrend from clientsRiskTrendData and passes through historicalScans", async () => {
    getDashboardForNetwork.mockResolvedValue(networkResponse);
    const result = await buildPerNetworkReportData("net-1");
    expect(result.riskTrend).toHaveLength(1);
    expect(result.historicalScans).toEqual(networkResponse.data.historicalScans);
  });
});
