// __tests__/unit/scanValidation.test.js
// Unit tests for utils/scanValidation.js — scan validation + portal payload builder.

const { validateScan, buildPortalPatchPayload } = require("../../utils/scanValidation");

// ─── Fixed "now" for deterministic tests ────────────────────────

const NOW = new Date("2026-02-24T12:00:00.000Z").getTime(); // epoch ms
const NETWORK_ID = "net-abc-123";
const MAX_AGE = 300; // 5 minutes

/**
 * Helper: build a scan row at a specific age (in seconds before NOW).
 */
const makeScan = (overrides = {}) => ({
  scan_id: "scan-001",
  network_id: NETWORK_ID,
	status: "COMPLETED",
	finished_at: new Date(NOW - 60 * 1000).toISOString(), // 1 min ago
	error_code: null,
	scan_data: { findings: { example: { id: "WFVT-005", status: "DETECTED" } } },
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────
// A. validateScan
// ─────────────────────────────────────────────────────────────────

describe("validateScan", () => {
  // 1. Scan missing / null
  test("returns SCAN_NOT_FOUND when scan is null", () => {
    const result = validateScan(null, NETWORK_ID, MAX_AGE, NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("SCAN_NOT_FOUND");
  });

  test("returns SCAN_NOT_FOUND when scan is undefined", () => {
    const result = validateScan(undefined, NETWORK_ID, MAX_AGE, NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("SCAN_NOT_FOUND");
  });

  // 2. Network mismatch
  test("returns SCAN_NETWORK_MISMATCH when network_id differs", () => {
    const scan = makeScan({ network_id: "other-network" });
    const result = validateScan(scan, NETWORK_ID, MAX_AGE, NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("SCAN_NETWORK_MISMATCH");
  });

  test("coerces numeric network_id to string for comparison", () => {
    // scan has numeric 42, request has string "42" — should still pass
    const scan = makeScan({ network_id: 42 });
    const result = validateScan(scan, "42", MAX_AGE, NOW);
    expect(result.valid).toBe(true);
  });

  // 3. Scan freshness
  test("returns SCAN_TOO_OLD when scan exceeds max age", () => {
    const scan = makeScan({
		finished_at: new Date(NOW - 600 * 1000).toISOString(), // 10 min ago
    });
    const result = validateScan(scan, NETWORK_ID, MAX_AGE, NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("SCAN_TOO_OLD");
    expect(result.extras).toBeDefined();
    expect(result.extras.scan_age_seconds).toBe(600);
    expect(result.extras.max_age_seconds).toBe(300);
  });

  test("passes when scan is exactly at the age boundary", () => {
    // finished_at exactly 300 s ago → age === limit → NOT too old (scanAge > not >=)
    const scan = makeScan({
		finished_at: new Date(NOW - MAX_AGE * 1000).toISOString(),
    });
    const result = validateScan(scan, NETWORK_ID, MAX_AGE, NOW);
    // 300 > 300 is false so it passes
    expect(result.valid).toBe(true);
  });

  test("returns SCAN_TOO_OLD when scan is 1 second past the limit", () => {
    const scan = makeScan({
		finished_at: new Date(NOW - (MAX_AGE + 1) * 1000).toISOString(),
    });
    const result = validateScan(scan, NETWORK_ID, MAX_AGE, NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("SCAN_TOO_OLD");
  });

  // 4. Valid scan
  test("returns valid for a fresh scan on the correct network", () => {
    const scan = makeScan(); // 1 min old, correct network
    const result = validateScan(scan, NETWORK_ID, MAX_AGE, NOW);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("valid scan 0 seconds ago", () => {
    const scan = makeScan({
		finished_at: new Date(NOW).toISOString(),
    });
    const result = validateScan(scan, NETWORK_ID, MAX_AGE, NOW);
    expect(result.valid).toBe(true);
  });

  // 5. Configurable max age
  test("respects custom max age", () => {
    const scan = makeScan({
		finished_at: new Date(NOW - 120 * 1000).toISOString(), // 2 min ago
    });
    // 2 min old, but max is 1 min
    const result = validateScan(scan, NETWORK_ID, 60, NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("SCAN_TOO_OLD");
  });

  // 6. Default now (uses Date.now if nowMs omitted)
  test("uses Date.now() when nowMs is not provided", () => {
    const scan = makeScan({
		finished_at: new Date().toISOString(), // just now
    });
    const result = validateScan(scan, NETWORK_ID, MAX_AGE);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// B. buildPortalPatchPayload
// ─────────────────────────────────────────────────────────────────

describe("buildPortalPatchPayload", () => {
  const BSSID = "AA:BB:CC:DD:EE:FF";
  const SSID = "TestNet";
  const FIXED_UNIX = 1740400000;

  test("constructs network_id as 'BSSID | SSID'", () => {
    const payload = buildPortalPatchPayload(BSSID, SSID, FIXED_UNIX);
    expect(payload.network_id).toBe("AA:BB:CC:DD:EE:FF | TestNet");
  });

  test("includes announcements with correct text", () => {
    const payload = buildPortalPatchPayload(BSSID, SSID, FIXED_UNIX);
    const ann = payload.patch.portal_content.announcements;
    expect(ann.updated_at).toBe(FIXED_UNIX);
    expect(ann.announcement_text).toContain("Welcome");
  });

  test("includes terms with version matching date", () => {
    const payload = buildPortalPatchPayload(BSSID, SSID, FIXED_UNIX);
    const terms = payload.patch.portal_content.terms;
    expect(terms.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(terms.text).toContain("terms of service");
  });

  test("includes 3 tips", () => {
    const payload = buildPortalPatchPayload(BSSID, SSID, FIXED_UNIX);
    const tips = payload.patch.portal_content.tips;
    expect(tips.items).toHaveLength(3);
    expect(tips.updated_at).toBe(FIXED_UNIX);
  });

  test("security section defaults to LOW when score is 0", () => {
    const payload = buildPortalPatchPayload(BSSID, SSID, FIXED_UNIX);
    const sec = payload.patch.security;
    expect(sec.score).toBe(0);
    expect(sec.risk_level).toBe("LOW");
    expect(sec.riskColor).toBe("#22C55E");
    expect(sec.riskDescription).toBe("Low risk — minimal threats detected");
  });

  test("uses Date.now when nowUnix is omitted", () => {
    const payload = buildPortalPatchPayload(BSSID, SSID);
    // Just ensure updated_at is a reasonable number (within last minute)
    const now = Math.floor(Date.now() / 1000);
    expect(payload.patch.security.updated_at).toBeGreaterThanOrEqual(now - 60);
    expect(payload.patch.security.updated_at).toBeLessThanOrEqual(now + 1);
  });
});
