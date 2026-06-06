// __tests__/unit/riskPipeline.buckets.test.js
// Pure function tests: bucketize, maxBucket, deriveBucketFromScanData, deriveBucketFromThreats

jest.mock("../../config/supabaseClient", () => ({ supabaseClient: { from: jest.fn() } }));
jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/piFetch", () => ({ piFetch: jest.fn() }));
jest.mock("../../utils/portalTipResolver", () => ({
  computePortalTipsetHash: jest.fn().mockReturnValue("hash"),
  resolveFinalPortalTipsForNetwork: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../controllers/captivePortalController", () => ({
  buildPortalPayloadFromDB: jest.fn().mockResolvedValue({}),
}));

const {
  bucketize,
  maxBucket,
  deriveBucketFromScanData,
  deriveBucketFromThreats,
} = require("../../utils/riskPipeline");

// ─── bucketize ────────────────────────────────────────────────────

describe("bucketize", () => {
  test.each([
    [0,   "LOW"],
    [-10, "LOW"],
    [1,   "LOW"],
    [39,  "LOW"],
    [40,  "MEDIUM"],
    [69,  "MEDIUM"],
    [70,  "HIGH"],
    [89,  "HIGH"],
    [90,  "CRITICAL"],
    [100, "CRITICAL"],
  ])("score %d → %s", (score, expected) => {
    expect(bucketize(score)).toBe(expected);
  });

  test("null → LOW", () => expect(bucketize(null)).toBe("LOW"));
  test("undefined → LOW", () => expect(bucketize(undefined)).toBe("LOW"));
  test("non-numeric string → LOW", () => expect(bucketize("bad")).toBe("LOW"));
});

// ─── maxBucket ────────────────────────────────────────────────────

describe("maxBucket", () => {
  test.each([
    ["LOW",    "HIGH",     "HIGH"],
    ["HIGH",   "LOW",      "HIGH"],
    ["MEDIUM", "CRITICAL", "CRITICAL"],
    ["LOW",    "LOW",      "LOW"],
    ["HIGH",   "CRITICAL", "CRITICAL"],
  ])("maxBucket(%s, %s) → %s", (a, b, expected) => {
    expect(maxBucket(a, b)).toBe(expected);
  });
});

// ─── deriveBucketFromScanData ─────────────────────────────────────

describe("deriveBucketFromScanData", () => {
  test("null → LOW", () => expect(deriveBucketFromScanData(null)).toBe("LOW"));
  test("undefined → LOW", () => expect(deriveBucketFromScanData(undefined)).toBe("LOW"));
  test("empty array → LOW", () => expect(deriveBucketFromScanData([])).toBe("LOW"));
  test("empty object → LOW", () => expect(deriveBucketFromScanData({})).toBe("LOW"));

  test("CRITICAL severity string short-circuits", () => {
    expect(deriveBucketFromScanData([{ severity: "CRITICAL" }])).toBe("CRITICAL");
  });

  test("HIGH severity → HIGH", () => {
    expect(deriveBucketFromScanData([{ severity: "HIGH" }])).toBe("HIGH");
  });

  test("MEDIUM severity → MEDIUM", () => {
    expect(deriveBucketFromScanData([{ severity: "MEDIUM" }])).toBe("MEDIUM");
  });

  test("numeric score >= 9.0 → CRITICAL", () => {
    expect(deriveBucketFromScanData([{ score: 9.5 }])).toBe("CRITICAL");
  });

  test("numeric score 7.0–8.9 → HIGH", () => {
    expect(deriveBucketFromScanData([{ score: 7.5 }])).toBe("HIGH");
  });

  test("numeric score 4.0–6.9 → MEDIUM", () => {
    expect(deriveBucketFromScanData([{ score: 5.0 }])).toBe("MEDIUM");
  });

  test("object with findings array", () => {
    expect(deriveBucketFromScanData({ findings: [{ severity: "HIGH" }] })).toBe("HIGH");
  });

  test("keyed findings object with real finding → MEDIUM fallback", () => {
    expect(deriveBucketFromScanData({ enc: { vt_name: "WEP" } })).toBe("MEDIUM");
  });

  test("mixed HIGH and MEDIUM → HIGH (takes max)", () => {
    const data = [{ severity: "MEDIUM" }, { severity: "HIGH" }];
    expect(deriveBucketFromScanData(data)).toBe("HIGH");
  });

  test("vt_severity_rating field recognized", () => {
    expect(deriveBucketFromScanData([{ vt_severity_rating: "CRITICAL" }])).toBe("CRITICAL");
  });
});

// ─── deriveBucketFromThreats ──────────────────────────────────────

describe("deriveBucketFromThreats", () => {
  test("empty array → LOW", () => expect(deriveBucketFromThreats([])).toBe("LOW"));
  test("null → LOW", () => expect(deriveBucketFromThreats(null)).toBe("LOW"));

  test("CLEARED threats are ignored", () => {
    expect(deriveBucketFromThreats([{ severity: "CRITICAL", status: "CLEARED" }])).toBe("LOW");
  });

  test("DETECTED CRITICAL → CRITICAL", () => {
    expect(deriveBucketFromThreats([{ severity: "CRITICAL", status: "DETECTED" }])).toBe("CRITICAL");
  });

  test("threat score >= 9 → CRITICAL", () => {
    expect(deriveBucketFromThreats([{ score: 9.1, status: "DETECTED" }])).toBe("CRITICAL");
  });

  test("threat score 7.0–8.9 → HIGH", () => {
    expect(deriveBucketFromThreats([{ score: 8.0, status: "DETECTED" }])).toBe("HIGH");
  });

  test("multiple threats: returns highest active", () => {
    const rows = [
      { severity: "MEDIUM", status: "DETECTED" },
      { severity: "HIGH",   status: "DETECTED" },
      { severity: "CRITICAL", status: "CLEARED" },
    ];
    expect(deriveBucketFromThreats(rows)).toBe("HIGH");
  });
});
