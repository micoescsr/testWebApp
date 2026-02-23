// __tests__/unit/exportFormatters.test.js
// Unit tests for CSV/XLSX export formatting.

const {
  escapeCSVField,
  formatCSV,
  parseCSV,
  formatXLSXRows,
} = require("../../utils/exportFormatters");

const { sampleVulnerabilityRows } = require("../fixtures/threatDefinitions");

const HEADERS = ["id", "severity", "name", "score", "detectedTime", "category"];

// ─── A. escapeCSVField ──────────────────────────────────────────────────────

describe("escapeCSVField", () => {
  test("plain string passes through", () => {
    expect(escapeCSVField("hello")).toBe("hello");
  });

  test("wraps and escapes commas", () => {
    expect(escapeCSVField("hello, world")).toBe('"hello, world"');
  });

  test("wraps and escapes double quotes", () => {
    expect(escapeCSVField('say "hi"')).toBe('"say ""hi"""');
  });

  test("wraps and escapes newlines", () => {
    expect(escapeCSVField("line1\nline2")).toBe('"line1\nline2"');
  });

  test("handles null/undefined", () => {
    expect(escapeCSVField(null)).toBe("");
    expect(escapeCSVField(undefined)).toBe("");
  });

  test("handles numbers", () => {
    expect(escapeCSVField(9.1)).toBe("9.1");
  });

  test("handles XSS-like strings safely", () => {
    const xss = '<script>alert("xss")</script>';
    const escaped = escapeCSVField(xss);
    // Should be quoted due to double-quotes inside
    expect(escaped).toContain('""');
    expect(escaped.startsWith('"')).toBe(true);
  });
});

// ─── B. formatCSV ───────────────────────────────────────────────────────────

describe("formatCSV", () => {
  test("headers match expected columns", () => {
    const csv = formatCSV(HEADERS, sampleVulnerabilityRows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,severity,name,score,detectedTime,category");
  });

  test("row count matches dataset", () => {
    const csv = formatCSV(HEADERS, sampleVulnerabilityRows);
    const lines = csv.split("\n");
    // header + 6 data rows
    expect(lines.length).toBe(1 + sampleVulnerabilityRows.length);
  });

  test("row count matches filtered dataset", () => {
    const filtered = sampleVulnerabilityRows.filter((r) => r.severity === "High");
    const csv = formatCSV(HEADERS, filtered);
    const lines = csv.split("\n");
    expect(lines.length).toBe(1 + filtered.length);
  });

  test("empty rows produce header-only CSV", () => {
    const csv = formatCSV(HEADERS, []);
    expect(csv).toBe("id,severity,name,score,detectedTime,category");
  });

  test("special characters don't break output (round-trip)", () => {
    const rows = [
      {
        id: 1,
        severity: "High",
        name: 'Evil "Twin" AP, variant',
        score: 8.5,
        detectedTime: "2026-02-23T10:00:00.000Z",
        category: "threat",
      },
    ];

    const csv = formatCSV(HEADERS, rows);
    const parsed = parseCSV(csv);

    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].name).toBe('Evil "Twin" AP, variant');
  });

  test("handles Unicode characters", () => {
    const rows = [
      {
        id: 1,
        severity: "Medium",
        name: "Café WiFi ☕",
        score: 5.0,
        detectedTime: "2026-02-23T10:00:00.000Z",
        category: "misc",
      },
    ];

    const csv = formatCSV(HEADERS, rows);
    expect(csv).toContain("Café WiFi ☕");
  });
});

// ─── C. parseCSV (round-trip verification) ──────────────────────────────────

describe("parseCSV", () => {
  test("parses generated CSV correctly", () => {
    const csv = formatCSV(HEADERS, sampleVulnerabilityRows);
    const parsed = parseCSV(csv);
    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows.length).toBe(sampleVulnerabilityRows.length);
  });

  test("handles empty CSV", () => {
    const { headers, rows } = parseCSV("");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});

// ─── D. formatXLSXRows ─────────────────────────────────────────────────────

describe("formatXLSXRows", () => {
  test("first row is the header row", () => {
    const result = formatXLSXRows(HEADERS, sampleVulnerabilityRows);
    expect(result[0]).toEqual(HEADERS);
  });

  test("row count is header + data rows", () => {
    const result = formatXLSXRows(HEADERS, sampleVulnerabilityRows);
    expect(result.length).toBe(1 + sampleVulnerabilityRows.length);
  });

  test("data rows match dataset values", () => {
    const result = formatXLSXRows(HEADERS, sampleVulnerabilityRows);
    const firstDataRow = result[1];
    expect(firstDataRow[0]).toBe(sampleVulnerabilityRows[0].id);
    expect(firstDataRow[1]).toBe(sampleVulnerabilityRows[0].severity);
    expect(firstDataRow[2]).toBe(sampleVulnerabilityRows[0].name);
  });

  test("missing fields default to empty string", () => {
    const rows = [{ id: 1, severity: "Low" }];
    const result = formatXLSXRows(HEADERS, rows);
    // name, score, detectedTime, category → ""
    expect(result[1][2]).toBe("");
    expect(result[1][3]).toBe("");
  });

  test("empty array returns header only", () => {
    const result = formatXLSXRows(HEADERS, []);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual(HEADERS);
  });
});
