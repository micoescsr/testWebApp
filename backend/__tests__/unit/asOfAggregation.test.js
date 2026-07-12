// __tests__/unit/asOfAggregation.test.js
const {
  isValidDateString,
  manilaEndOfDay,
  manilaDateOf,
  latestScanPerNetwork,
  distinctScanDates,
} = require("../../utils/asOfAggregation");

describe("isValidDateString", () => {
  test("accepts valid calendar dates", () => {
    expect(isValidDateString("2026-06-25")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true); // leap year
  });

  test("rejects malformed values", () => {
    expect(isValidDateString("2026-6-25")).toBe(false);
    expect(isValidDateString("2026-06-25T00:00:00Z")).toBe(false);
    expect(isValidDateString("25-06-2026")).toBe(false);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString(null)).toBe(false);
    expect(isValidDateString(20260625)).toBe(false);
    expect(isValidDateString("2026-06-25'; DROP TABLE scans;--")).toBe(false);
  });

  test("rejects impossible dates", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-00-10")).toBe(false);
    expect(isValidDateString("2025-02-29")).toBe(false); // not a leap year
  });
});

describe("manilaEndOfDay", () => {
  test("converts to end-of-day Manila (UTC+8)", () => {
    // 2026-06-25 23:59:59.999 +08:00 === 2026-06-25 15:59:59.999 UTC
    expect(manilaEndOfDay("2026-06-25")).toBe("2026-06-25T15:59:59.999Z");
  });

  test("returns null for invalid input", () => {
    expect(manilaEndOfDay("bad")).toBeNull();
    expect(manilaEndOfDay(null)).toBeNull();
  });
});

describe("manilaDateOf", () => {
  test("maps a UTC instant to its Manila calendar date", () => {
    // 18:00 UTC = 02:00 next day Manila
    expect(manilaDateOf("2026-06-24T18:00:00Z")).toBe("2026-06-25");
    expect(manilaDateOf("2026-06-25T10:00:00Z")).toBe("2026-06-25");
  });

  test("returns null for missing/invalid values", () => {
    expect(manilaDateOf(null)).toBeNull();
    expect(manilaDateOf("nonsense")).toBeNull();
  });
});

describe("latestScanPerNetwork", () => {
  test("keeps only the newest completed scan per network", () => {
    const rows = [
      { scan_id: 1, network_id: "A", scan_end: "2026-06-20T10:00:00Z" },
      { scan_id: 2, network_id: "A", scan_end: "2026-06-24T10:00:00Z" },
      { scan_id: 3, network_id: "B", scan_end: "2026-06-22T10:00:00Z" },
    ];
    const latest = latestScanPerNetwork(rows);
    expect(latest.size).toBe(2);
    expect(latest.get("A").scan_id).toBe(2);
    expect(latest.get("B").scan_id).toBe(3);
  });

  test("ignores rows without scan_end or network_id", () => {
    const latest = latestScanPerNetwork([
      { scan_id: 1, network_id: "A", scan_end: null },
      { scan_id: 2, network_id: null, scan_end: "2026-06-24T10:00:00Z" },
      { scan_id: 3, network_id: "A", scan_end: "invalid" },
    ]);
    expect(latest.size).toBe(0);
  });

  test("handles empty/undefined input", () => {
    expect(latestScanPerNetwork([]).size).toBe(0);
    expect(latestScanPerNetwork(undefined).size).toBe(0);
  });
});

describe("distinctScanDates", () => {
  test("returns unique Manila dates, newest first", () => {
    const rows = [
      { scan_end: "2026-06-25T01:00:00Z" }, // 09:00 Manila, Jun 25
      { scan_end: "2026-06-24T18:00:00Z" }, // 02:00 Manila, Jun 25 (same day)
      { scan_end: "2026-06-20T10:00:00Z" },
      { scan_end: null },
    ];
    expect(distinctScanDates(rows)).toEqual(["2026-06-25", "2026-06-20"]);
  });
});
