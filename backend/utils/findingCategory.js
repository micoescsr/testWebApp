// backend/utils/findingCategory.js
// Pure function — buckets a finding into the 3 fixed report categories
// (Open Networks & Weak Crypto / Wireless Misconfigurations / Active Threat
// Indicators) used by the SAM export "Detailed Findings" section.
// Mapping is static because vulnerability_threat_details has no category
// column — update CRYPTO_CODES if new WFVT vulnerability codes are added.

const CRYPTO_CODES = new Set(["WFVT-001", "WFVT-003"]);

function categorizeFinding({ vt_code, vt_kind }) {
  if ((vt_kind || "").toUpperCase() === "THREAT") return "activeThreats";
  if (CRYPTO_CODES.has(vt_code)) return "openAndWeakCrypto";
  return "misconfigurations";
}

module.exports = { categorizeFinding };
