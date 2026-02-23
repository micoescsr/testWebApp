// __tests__/unit/scoring.test.js
// Unit tests for scoring & severity functions.

const {
  computeSeverityFromScore,
  computeRiskScore,
  mapPollResultsToThreatRows,
} = require("../../utils/scoring");

const {
  buildDefinitionsMap,
  samplePollResults,
} = require("../fixtures/threatDefinitions");

// ─── A. computeSeverityFromScore ────────────────────────────────────────────

describe("computeSeverityFromScore", () => {
  // Boundary checks: 3.9→4.0, 6.9→7.0, 8.9→9.0
  const cases = [
    // None
    [0, "None"],
    [0.0, "None"],
    // Low range
    [0.1, "Low"],
    [1.0, "Low"],
    [3.9, "Low"],
    // Boundary: 3.9 → Low, 4.0 → Medium
    [3.99, "Low"],
    [4.0, "Medium"],
    // Medium range
    [4.1, "Medium"],
    [5.5, "Medium"],
    [6.9, "Medium"],
    // Boundary: 6.9 → Medium, 7.0 → High
    [6.99, "Medium"],
    [7.0, "High"],
    // High range
    [7.1, "High"],
    [8.0, "High"],
    [8.9, "High"],
    // Boundary: 8.9 → High, 9.0 → Critical
    [8.99, "High"],
    [9.0, "Critical"],
    // Critical range
    [9.1, "Critical"],
    [10.0, "Critical"],
  ];

  test.each(cases)("score %s → %s", (score, expected) => {
    expect(computeSeverityFromScore(score)).toBe(expected);
  });

  test("null score returns N/A", () => {
    expect(computeSeverityFromScore(null)).toBe("N/A");
  });

  test("undefined score returns N/A", () => {
    expect(computeSeverityFromScore(undefined)).toBe("N/A");
  });

  test("empty string returns N/A", () => {
    expect(computeSeverityFromScore("")).toBe("N/A");
  });

  test("NaN string returns N/A", () => {
    expect(computeSeverityFromScore("not-a-number")).toBe("N/A");
  });

  test("negative score returns N/A", () => {
    expect(computeSeverityFromScore(-1)).toBe("N/A");
  });

  test("score > 10 returns N/A", () => {
    expect(computeSeverityFromScore(10.1)).toBe("N/A");
  });

  test("string-encoded number works", () => {
    expect(computeSeverityFromScore("7.5")).toBe("High");
  });
});

// ─── B. computeRiskScore ────────────────────────────────────────────────────

describe("computeRiskScore", () => {
  test("empty findings returns 0", () => {
    expect(computeRiskScore([])).toBe(0);
  });

  test("null/undefined returns 0", () => {
    expect(computeRiskScore(null)).toBe(0);
    expect(computeRiskScore(undefined)).toBe(0);
  });

  test("single critical finding scores 10", () => {
    expect(computeRiskScore([{ score: 9.5 }])).toBe(10);
  });

  test("single low finding scores 1", () => {
    expect(computeRiskScore([{ score: 2.0 }])).toBe(1);
  });

  test("mixed findings produce weighted sum", () => {
    const findings = [
      { score: 9.1 }, // critical → 10
      { score: 7.5 }, // high     → 7
      { score: 5.3 }, // medium   → 4
      { score: 2.1 }, // low      → 1
    ];
    expect(computeRiskScore(findings)).toBe(10 + 7 + 4 + 1); // 22
  });

  test("clamps to 100 for many findings", () => {
    const findings = Array(20).fill({ score: 9.5 }); // 20 × 10 = 200 → clamp 100
    expect(computeRiskScore(findings)).toBe(100);
  });

  test("none-severity findings contribute 0", () => {
    expect(computeRiskScore([{ score: 0 }])).toBe(0);
  });

  test("missing score fields don't break scoring", () => {
    // N/A severity → weight 0
    expect(computeRiskScore([{ score: null }, { score: undefined }, {}])).toBe(0);
  });
});

// ─── C. mapPollResultsToThreatRows ──────────────────────────────────────────

describe("mapPollResultsToThreatRows", () => {
  const defsByCode = buildDefinitionsMap();

  test("maps poll results to aggregated threat rows", () => {
    const rows = mapPollResultsToThreatRows(samplePollResults, defsByCode);
    expect(rows.length).toBe(3); // WFVT-006, WFVT-007, WFVT-008
  });

  test("groups duplicate vt_code across cycles", () => {
    const rows = mapPollResultsToThreatRows(samplePollResults, defsByCode);
    const evilTwin = rows.find((r) => r.id === "WFVT-006");
    expect(evilTwin).toBeDefined();
    expect(evilTwin.occurrences).toBe(2); // appears in both cycles
    expect(evilTwin.sessions.length).toBe(2);
  });

  test("latest status overrides previous (CLEARED > DETECTED)", () => {
    const rows = mapPollResultsToThreatRows(samplePollResults, defsByCode);
    const evilTwin = rows.find((r) => r.id === "WFVT-006");
    expect(evilTwin.status).toBe("CLEARED"); // second cycle is CLEARED
  });

  test("includes correct severity and score from definitions", () => {
    const rows = mapPollResultsToThreatRows(samplePollResults, defsByCode);
    const macSpoof = rows.find((r) => r.id === "WFVT-007");
    expect(macSpoof.severity).toBe("Medium");
    expect(macSpoof.score).toBe(6.8);
  });

  test("ignores findings without matching definition", () => {
    const emptyDefs = new Map();
    const rows = mapPollResultsToThreatRows(samplePollResults, emptyDefs);
    expect(rows.length).toBe(0);
  });

  test("handles empty results array", () => {
    const rows = mapPollResultsToThreatRows([], defsByCode);
    expect(rows.length).toBe(0);
  });

  test("handles null/undefined results", () => {
    expect(mapPollResultsToThreatRows(null, defsByCode)).toEqual([]);
    expect(mapPollResultsToThreatRows(undefined, defsByCode)).toEqual([]);
  });

  test("handles results with no findings key", () => {
    const results = [{ bssid: "AA:BB:CC:DD:EE:FF" }];
    const rows = mapPollResultsToThreatRows(results, defsByCode);
    expect(rows.length).toBe(0);
  });

  test("detected time uses first_seen_epoch for initial detection", () => {
    const rows = mapPollResultsToThreatRows(samplePollResults, defsByCode);
    const macSpoof = rows.find((r) => r.id === "WFVT-007");
    // first_seen_epoch = 1740304810 → Date should be valid ISO string
    expect(macSpoof.detectedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
