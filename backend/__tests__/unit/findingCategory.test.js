// __tests__/unit/findingCategory.test.js
const { categorizeFinding } = require("../../utils/findingCategory");

describe("categorizeFinding", () => {
  test("buckets WFVT-001 (Lack of Encryption) as openAndWeakCrypto", () => {
    expect(categorizeFinding({ vt_code: "WFVT-001", vt_kind: "VULNERABILITY" })).toBe(
      "openAndWeakCrypto"
    );
  });

  test("buckets WFVT-003 (Weak Encryption WEP/TKIP) as openAndWeakCrypto", () => {
    expect(categorizeFinding({ vt_code: "WFVT-003", vt_kind: "VULNERABILITY" })).toBe(
      "openAndWeakCrypto"
    );
  });

  test("buckets WFVT-002 (WPS Enabled) as misconfigurations", () => {
    expect(categorizeFinding({ vt_code: "WFVT-002", vt_kind: "VULNERABILITY" })).toBe(
      "misconfigurations"
    );
  });

  test("buckets WFVT-005 (PMF Disabled) as misconfigurations", () => {
    expect(categorizeFinding({ vt_code: "WFVT-005", vt_kind: "VULNERABILITY" })).toBe(
      "misconfigurations"
    );
  });

  test("buckets any THREAT kind as activeThreats regardless of code", () => {
    expect(categorizeFinding({ vt_code: "WFVT-006", vt_kind: "THREAT" })).toBe(
      "activeThreats"
    );
    expect(categorizeFinding({ vt_code: "WFVT-007", vt_kind: "threat" })).toBe(
      "activeThreats"
    );
  });

  test("falls back unknown vulnerability codes to misconfigurations", () => {
    expect(categorizeFinding({ vt_code: "WFVT-999", vt_kind: "VULNERABILITY" })).toBe(
      "misconfigurations"
    );
  });

  test("falls back missing/null vt_code to misconfigurations when kind is vulnerability", () => {
    expect(categorizeFinding({ vt_code: null, vt_kind: "VULNERABILITY" })).toBe(
      "misconfigurations"
    );
  });

  test("falls back missing/null vt_kind to misconfigurations (not a threat)", () => {
    expect(categorizeFinding({ vt_code: "WFVT-002", vt_kind: null })).toBe(
      "misconfigurations"
    );
  });
});
