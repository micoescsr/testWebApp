// __tests__/unit/normalization.test.js
// Unit tests for payload normalization & validation.

const {
  normalizeScanPayload,
  normalizeBSSID,
  validateScanPayload,
  sanitizeString,
} = require("../../utils/normalization");

const {
  validScanPayload,
  missingSSID,
  missingBSSID,
  missingChannel,
  emptyPayload,
  xssPayload,
  bssidVariants,
} = require("../fixtures/scanPayloads");

// ─── A. normalizeBSSID ──────────────────────────────────────────────────────

describe("normalizeBSSID", () => {
  test("normalizes lowercase colon-separated", () => {
    expect(normalizeBSSID(bssidVariants.colonSeparated)).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("normalizes dash-separated", () => {
    expect(normalizeBSSID(bssidVariants.dashSeparated)).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("normalizes no-separator", () => {
    expect(normalizeBSSID(bssidVariants.noSeparator)).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("preserves already-uppercase colon-separated", () => {
    expect(normalizeBSSID(bssidVariants.uppercase)).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("normalizes mixed case", () => {
    expect(normalizeBSSID(bssidVariants.mixed)).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("returns uppercase for invalid hex (too short)", () => {
    expect(normalizeBSSID(bssidVariants.tooShort)).toBe("AA:BB:CC");
  });

  test("returns null for null/undefined/empty", () => {
    expect(normalizeBSSID(null)).toBeNull();
    expect(normalizeBSSID(undefined)).toBeNull();
    expect(normalizeBSSID("")).toBeNull();
  });
});

// ─── B. normalizeScanPayload ────────────────────────────────────────────────

describe("normalizeScanPayload", () => {
  test("normalizes a valid payload", () => {
    const result = normalizeScanPayload(validScanPayload);
    expect(result.ssid).toBe("TestNetwork_5G");
    expect(result.bssid).toBe("AA:BB:CC:DD:EE:FF");
    expect(result.channel).toBe(6);
    expect(result.encryption).toBe("WPA2");
    expect(result.num_clients).toBe(12);
  });

  test("trims SSID whitespace", () => {
    const result = normalizeScanPayload({ ssid: "  My WiFi  ", bssid: "aabbccddeeff", channel: 1 });
    expect(result.ssid).toBe("My WiFi");
  });

  test("uppercases BSSID", () => {
    const result = normalizeScanPayload({ ssid: "X", bssid: "aa:bb:cc:dd:ee:ff", channel: 1 });
    expect(result.bssid).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("provides default timestamp when missing", () => {
    const result = normalizeScanPayload(validScanPayload);
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  test("defaults empty object safely", () => {
    const result = normalizeScanPayload({});
    expect(result.ssid).toBe("");
    expect(result.bssid).toBeNull();
    expect(result.channel).toBeNull();
  });

  test("sanitizes city and notes strings", () => {
    const result = normalizeScanPayload(xssPayload);
    expect(result.city).not.toContain("<");
    expect(result.city).not.toContain(">");
    expect(result.notes).toContain("&lt;");
  });
});

// ─── C. validateScanPayload ────────────────────────────────────────────────

describe("validateScanPayload", () => {
  test("valid payload passes", () => {
    const { valid, errors } = validateScanPayload(validScanPayload);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test("rejects missing SSID", () => {
    const { valid, errors } = validateScanPayload(missingSSID);
    expect(valid).toBe(false);
    expect(errors).toContain("SSID is required");
  });

  test("rejects missing BSSID", () => {
    const { valid, errors } = validateScanPayload(missingBSSID);
    expect(valid).toBe(false);
    expect(errors).toContain("BSSID is required");
  });

  test("rejects missing channel", () => {
    const { valid, errors } = validateScanPayload(missingChannel);
    expect(valid).toBe(false);
    expect(errors).toContain("Channel is required");
  });

  test("rejects empty payload with multiple errors", () => {
    const { valid, errors } = validateScanPayload(emptyPayload);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  test("rejects invalid BSSID format", () => {
    const { valid, errors } = validateScanPayload({
      ssid: "Test",
      bssid: "ZZZZZZ",
      channel: 1,
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("MAC address"))).toBe(true);
  });

  test("rejects negative channel", () => {
    const { valid, errors } = validateScanPayload({
      ssid: "Test",
      bssid: "AA:BB:CC:DD:EE:FF",
      channel: -1,
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("non-negative"))).toBe(true);
  });

  test("accepts channel 0 (valid)", () => {
    const { valid } = validateScanPayload({
      ssid: "Test",
      bssid: "AA:BB:CC:DD:EE:FF",
      channel: 0,
    });
    expect(valid).toBe(true);
  });

  test("accepts various valid BSSID formats", () => {
    const formats = ["aa:bb:cc:dd:ee:ff", "aa-bb-cc-dd-ee-ff", "aabbccddeeff"];
    for (const bssid of formats) {
      const { valid } = validateScanPayload({ ssid: "X", bssid, channel: 1 });
      expect(valid).toBe(true);
    }
  });
});

// ─── D. sanitizeString ──────────────────────────────────────────────────────

describe("sanitizeString", () => {
  test("escapes HTML entities", () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  test("escapes ampersand", () => {
    expect(sanitizeString("foo & bar")).toBe("foo &amp; bar");
  });

  test("escapes single quotes", () => {
    expect(sanitizeString("it's")).toBe("it&#x27;s");
  });

  test("trims whitespace", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
  });

  test("returns null for null/undefined", () => {
    expect(sanitizeString(null)).toBeNull();
    expect(sanitizeString(undefined)).toBeNull();
  });

  test("converts numbers to string", () => {
    expect(sanitizeString(42)).toBe("42");
  });
});
