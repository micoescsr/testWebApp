// __tests__/unit/sorting.test.js
// Unit tests for sort & filter functions.

const {
  sortBySeverity,
  sortByScore,
  sortByDate,
  filterBySeverity,
  filterByDateRange,
  filterByCategory,
} = require("../../utils/sorting");

const { sampleVulnerabilityRows } = require("../fixtures/threatDefinitions");

// ─── Sort: high→low and low→high ────────────────────────────────────────────

describe("sortBySeverity", () => {
  test("desc: Critical → High → Medium → Low → None", () => {
    const sorted = sortBySeverity(sampleVulnerabilityRows, "desc");
    const severities = sorted.map((r) => r.severity);
    expect(severities).toEqual([
      "Critical",
      "High",
      "High",
      "Medium",
      "Low",
      "None",
    ]);
  });

  test("asc: None → Low → Medium → High → Critical", () => {
    const sorted = sortBySeverity(sampleVulnerabilityRows, "asc");
    const severities = sorted.map((r) => r.severity);
    expect(severities).toEqual([
      "None",
      "Low",
      "Medium",
      "High",
      "High",
      "Critical",
    ]);
  });

  test("does not mutate original array", () => {
    const original = [...sampleVulnerabilityRows];
    sortBySeverity(sampleVulnerabilityRows, "desc");
    expect(sampleVulnerabilityRows).toEqual(original);
  });

  test("handles empty array", () => {
    expect(sortBySeverity([], "desc")).toEqual([]);
  });

  test("handles items with unknown severity", () => {
    const items = [{ severity: "Unknown" }, { severity: "High" }];
    const sorted = sortBySeverity(items, "desc");
    expect(sorted[0].severity).toBe("High");
  });
});

describe("sortByScore", () => {
  test("desc: highest score first", () => {
    const sorted = sortByScore(sampleVulnerabilityRows, "desc");
    expect(sorted[0].score).toBe(9.1);
    expect(sorted[sorted.length - 1].score).toBe(0.0);
  });

  test("asc: lowest score first", () => {
    const sorted = sortByScore(sampleVulnerabilityRows, "asc");
    expect(sorted[0].score).toBe(0.0);
    expect(sorted[sorted.length - 1].score).toBe(9.1);
  });

  test("handles missing scores as 0", () => {
    const items = [{ score: 5 }, { score: null }, { score: undefined }];
    const sorted = sortByScore(items, "desc");
    expect(sorted[0].score).toBe(5);
  });
});

describe("sortByDate", () => {
  test("desc: newest first", () => {
    const sorted = sortByDate(sampleVulnerabilityRows, "detectedTime", "desc");
    const dates = sorted.map((r) => new Date(r.detectedTime).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });

  test("asc: oldest first", () => {
    const sorted = sortByDate(sampleVulnerabilityRows, "detectedTime", "asc");
    const dates = sorted.map((r) => new Date(r.detectedTime).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
    }
  });
});

// ─── Filter: severity, date, category ───────────────────────────────────────

describe("filterBySeverity", () => {
  test("filters by single severity", () => {
    const result = filterBySeverity(sampleVulnerabilityRows, ["High"]);
    expect(result.length).toBe(2);
    result.forEach((r) => expect(r.severity).toBe("High"));
  });

  test("filters by multiple severities", () => {
    const result = filterBySeverity(sampleVulnerabilityRows, ["High", "Critical"]);
    expect(result.length).toBe(3);
  });

  test("case-insensitive", () => {
    const result = filterBySeverity(sampleVulnerabilityRows, ["high", "CRITICAL"]);
    expect(result.length).toBe(3);
  });

  test("empty filter returns all items", () => {
    const result = filterBySeverity(sampleVulnerabilityRows, []);
    expect(result.length).toBe(sampleVulnerabilityRows.length);
  });

  test("null filter returns all items", () => {
    const result = filterBySeverity(sampleVulnerabilityRows, null);
    expect(result.length).toBe(sampleVulnerabilityRows.length);
  });

  test("non-matching filter returns empty", () => {
    const result = filterBySeverity(sampleVulnerabilityRows, ["nonexistent"]);
    expect(result.length).toBe(0);
  });
});

describe("filterByDateRange", () => {
  test("filters within date range", () => {
    const result = filterByDateRange(
      sampleVulnerabilityRows,
      "2026-02-20T00:00:00.000Z",
      "2026-02-21T23:59:59.000Z",
      "detectedTime"
    );
    expect(result.length).toBe(2); // Feb 20 and Feb 21
  });

  test("start-only filter", () => {
    const result = filterByDateRange(
      sampleVulnerabilityRows,
      "2026-02-21T00:00:00.000Z",
      null,
      "detectedTime"
    );
    expect(result.length).toBe(2); // Feb 21 and Feb 22
  });

  test("end-only filter", () => {
    const result = filterByDateRange(
      sampleVulnerabilityRows,
      null,
      "2026-02-19T23:59:59.000Z",
      "detectedTime"
    );
    expect(result.length).toBe(3); // Feb 17, 18, 19
  });

  test("null range returns all items", () => {
    const result = filterByDateRange(sampleVulnerabilityRows, null, null, "detectedTime");
    expect(result.length).toBe(sampleVulnerabilityRows.length);
  });
});

describe("filterByCategory", () => {
  test("filters by single category", () => {
    const result = filterByCategory(sampleVulnerabilityRows, "category", ["encryption"]);
    expect(result.length).toBe(2);
  });

  test("filters by multiple categories", () => {
    const result = filterByCategory(sampleVulnerabilityRows, "category", [
      "encryption",
      "configuration",
    ]);
    expect(result.length).toBe(4);
  });

  test("case-insensitive", () => {
    const result = filterByCategory(sampleVulnerabilityRows, "category", ["ENCRYPTION"]);
    expect(result.length).toBe(2);
  });

  test("empty values returns all", () => {
    const result = filterByCategory(sampleVulnerabilityRows, "category", []);
    expect(result.length).toBe(sampleVulnerabilityRows.length);
  });
});
