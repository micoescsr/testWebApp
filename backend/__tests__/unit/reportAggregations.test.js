// __tests__/unit/reportAggregations.test.js
const {
  riskLabelForReport,
  buildNetworkRiskTable,
  buildDetailedFindings,
  buildHistoricalScansTable,
  buildRiskTrendTable,
  buildFindingsLists,
  buildRemediationPlan,
} = require("../../utils/reportAggregations");

describe("riskLabelForReport", () => {
  test.each([
    [0, "None"],
    [1, "Low"],
    [39, "Low"],
    [40, "Medium"],
    [69, "Medium"],
    [70, "High"],
    [89, "High"],
    [90, "Critical"],
    [100, "Critical"],
  ])("score %d -> %s", (score, expected) => {
    expect(riskLabelForReport(score)).toBe(expected);
  });

  test("null -> None", () => expect(riskLabelForReport(null)).toBe("None"));
});

describe("buildNetworkRiskTable", () => {
  const rows = [
    { ssid: "Low_Net", bssid: "BB", channel: 1, encryption_status: "WPA2", num_clients: 5, risk_score: 10, findings: 1 },
    { ssid: "High_Net", bssid: "AA", channel: 6, encryption_status: "Open", num_clients: 20, risk_score: 95, findings: 4 },
  ];

  test("sorts descending by risk_score", () => {
    const result = buildNetworkRiskTable(rows);
    expect(result.map((r) => r.ssid)).toEqual(["High_Net", "Low_Net"]);
  });

  test("maps fields to report shape with riskLabel", () => {
    const [top] = buildNetworkRiskTable(rows);
    expect(top).toEqual({
      ssid: "High_Net",
      bssid: "AA",
      channel: 6,
      encryption: "Open",
      clients: 20,
      riskPercent: 95,
      riskLabel: "Critical",
      findings: 4,
    });
  });

  test("empty input returns empty array", () => {
    expect(buildNetworkRiskTable([])).toEqual([]);
  });

  test("undefined input returns empty array", () => {
    expect(buildNetworkRiskTable(undefined)).toEqual([]);
  });

  test("defaults missing clients/risk/findings to 0", () => {
    const [row] = buildNetworkRiskTable([{ ssid: "X", bssid: "Y", channel: 1, encryption_status: "Open" }]);
    expect(row).toMatchObject({ clients: 0, riskPercent: 0, findings: 0 });
  });
});

describe("buildDetailedFindings", () => {
  const findings = [
    { network: "Nacho_WiFi", vt_code: "WFVT-001", vt_name: "Lack of Encryption", vt_kind: "VULNERABILITY", vt_severity_rating: "Critical", vt_cvss_base_score: 9.1 },
    { network: "Nacho_WiFi", vt_code: "WFVT-002", vt_name: "WPS Enabled", vt_kind: "VULNERABILITY", vt_severity_rating: "High", vt_cvss_base_score: 7.5 },
    { network: "Nacho_WiFi", vt_code: "WFVT-008", vt_name: "Deauthentication Attack", vt_kind: "THREAT", vt_severity_rating: "High", vt_cvss_base_score: 7.2, occurrences: 5 },
  ];

  test("buckets findings into the 3 fixed report sections", () => {
    const result = buildDetailedFindings(findings);
    expect(result.openAndWeakCrypto).toHaveLength(1);
    expect(result.misconfigurations).toHaveLength(1);
    expect(result.activeThreats).toHaveLength(1);
  });

  test("shapes each row with network/finding/kind/severity/cvss", () => {
    const result = buildDetailedFindings(findings);
    expect(result.openAndWeakCrypto[0]).toEqual({
      network: "Nacho_WiFi",
      finding: "Lack of Encryption (WFVT-001)",
      kind: "Vulnerability",
      severity: "Critical",
      cvss: 9.1,
    });
  });

  test("includes occurrences on activeThreats rows", () => {
    const result = buildDetailedFindings(findings);
    expect(result.activeThreats[0].occurrences).toBe(5);
  });

  test("empty input returns all 3 empty arrays", () => {
    expect(buildDetailedFindings([])).toEqual({
      openAndWeakCrypto: [],
      misconfigurations: [],
      activeThreats: [],
    });
  });

  test("undefined input returns all 3 empty arrays", () => {
    expect(buildDetailedFindings(undefined)).toEqual({
      openAndWeakCrypto: [],
      misconfigurations: [],
      activeThreats: [],
    });
  });

  test("defaults missing occurrences on a threat row to 0", () => {
    const result = buildDetailedFindings([
      { network: "N", vt_code: "WFVT-008", vt_name: "Deauth", vt_kind: "THREAT", vt_severity_rating: "High", vt_cvss_base_score: 7.2 },
    ]);
    expect(result.activeThreats[0].occurrences).toBe(0);
  });
});

describe("buildFindingsLists", () => {
  const findings = [
    { vt_code: "WFVT-001", vt_name: "Lack of Encryption", vt_kind: "VULNERABILITY", vt_severity_rating: "Critical", vt_cvss_base_score: 9.1 },
    { vt_code: "WFVT-008", vt_name: "Deauthentication Attack", vt_kind: "THREAT", vt_severity_rating: "High", vt_cvss_base_score: 7.2, occurrences: 5 },
  ];

  test("splits into vulnerabilities and threats lists", () => {
    const result = buildFindingsLists(findings);
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.threats).toHaveLength(1);
  });

  test("shapes vulnerability rows with id/name/severity/cvss/presence", () => {
    const result = buildFindingsLists(findings);
    expect(result.vulnerabilities[0]).toEqual({
      id: "WFVT-001",
      name: "Lack of Encryption",
      severity: "Critical",
      cvss: 9.1,
      presence: "Detected",
    });
  });

  test("shapes threat rows with id/name/severity/cvss/occurrences", () => {
    const result = buildFindingsLists(findings);
    expect(result.threats[0]).toEqual({
      id: "WFVT-008",
      name: "Deauthentication Attack",
      severity: "High",
      cvss: 7.2,
      occurrences: 5,
    });
  });

  test("empty input returns both empty arrays", () => {
    expect(buildFindingsLists([])).toEqual({ vulnerabilities: [], threats: [] });
  });

  test("undefined input returns both empty arrays", () => {
    expect(buildFindingsLists(undefined)).toEqual({ vulnerabilities: [], threats: [] });
  });

  test("defaults missing occurrences on a threat row to 0", () => {
    const result = buildFindingsLists([
      { vt_code: "WFVT-008", vt_name: "Deauth", vt_kind: "THREAT", vt_severity_rating: "High", vt_cvss_base_score: 7.2 },
    ]);
    expect(result.threats[0].occurrences).toBe(0);
  });
});

describe("buildRemediationPlan", () => {
  test("maps known codes to detailedMapping rows with action/priority/responsible", () => {
    const result = buildRemediationPlan(["WFVT-002"]);
    expect(result.detailedMapping).toEqual([
      { finding: "WFVT-002", action: "Disable WPS on all access points", priority: "Immediate", responsible: "Network Admin" },
    ]);
  });

  test("splits quickWins (Immediate) from mediumTerm (Short term) actions", () => {
    const result = buildRemediationPlan(["WFVT-002", "WFVT-007"]);
    expect(result.quickWins).toContain("Disable WPS on all access points");
    expect(result.mediumTerm).toContain("Deploy dynamic ARP inspection (DAI) and DHCP snooping");
  });

  test("derives keyBusinessImpacts from detected codes, deduplicated", () => {
    const result = buildRemediationPlan(["WFVT-006"]);
    expect(result.keyBusinessImpacts).toEqual([
      "Potential account takeover via evil twin hotspots",
    ]);
  });

  test("topActions caps at 5 and prioritizes Immediate first", () => {
    const result = buildRemediationPlan([
      "WFVT-001", "WFVT-002", "WFVT-003", "WFVT-005", "WFVT-006", "WFVT-007", "WFVT-008",
    ]);
    expect(result.topActions.length).toBeLessThanOrEqual(5);
  });

  test("unknown code is ignored, not throw", () => {
    expect(() => buildRemediationPlan(["WFVT-999"])).not.toThrow();
  });

  test("empty input returns empty plan", () => {
    expect(buildRemediationPlan([])).toEqual({
      quickWins: [],
      mediumTerm: [],
      detailedMapping: [],
      keyBusinessImpacts: [],
      topActions: [],
    });
  });

  test("undefined input returns empty plan", () => {
    expect(buildRemediationPlan(undefined)).toEqual({
      quickWins: [],
      mediumTerm: [],
      detailedMapping: [],
      keyBusinessImpacts: [],
      topActions: [],
    });
  });
});

describe("buildRiskTrendTable", () => {
  const rows = [
    { finished_at: "2026-01-10T08:59:55Z", risk_score: 14 },
    { finished_at: "2026-02-05T16:30:00Z", risk_score: 95 },
  ];

  test("maps DB rows to report risk-trend shape with date/time/score/level", () => {
    const result = buildRiskTrendTable(rows);
    expect(result).toEqual([
      { date: "2026-01-10", time: "08:59:55", score: 14, level: "Low" },
      { date: "2026-02-05", time: "16:30:00", score: 95, level: "Critical" },
    ]);
  });

  test("empty input returns empty array", () => {
    expect(buildRiskTrendTable([])).toEqual([]);
  });

  test("undefined input returns empty array", () => {
    expect(buildRiskTrendTable(undefined)).toEqual([]);
  });

  test("missing risk_score defaults to 0", () => {
    const [row] = buildRiskTrendTable([{ finished_at: "2026-01-10T08:59:55Z" }]);
    expect(row).toMatchObject({ score: 0, level: "None" });
  });
});

describe("buildHistoricalScansTable", () => {
  const rows = [
    { scan_id: "s1", ssid: "Nacho_WiFi", bssid: "AA", finished_at: "2026-01-10T08:59:55Z", risk_score: 14 },
  ];

  test("maps DB rows to report appendix shape", () => {
    const result = buildHistoricalScansTable(rows);
    expect(result).toEqual([
      { scanId: "s1", ssid: "Nacho_WiFi", bssid: "AA", start: "2026-01-10T08:59:55Z", end: "2026-01-10T08:59:55Z", risk: 14 },
    ]);
  });

  test("empty input returns empty array", () => {
    expect(buildHistoricalScansTable([])).toEqual([]);
  });

  test("undefined input returns empty array", () => {
    expect(buildHistoricalScansTable(undefined)).toEqual([]);
  });
});
