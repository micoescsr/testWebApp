// __tests__/fixtures/threatDefinitions.js
// Mock threat/vulnerability definitions — mirrors vulnerability_threat_details table.

const threatDefinitions = [
  {
    vt_code: "WFVT-001",
    vt_name: "Lack of Encryption",
    vt_kind: "vulnerability",
    vt_cvss_base_score: 9.1,
    vt_severity_rating: "Critical",
    vt_detail_id: "d001",
  },
  {
    vt_code: "WFVT-002",
    vt_name: "WPS Enabled",
    vt_kind: "vulnerability",
    vt_cvss_base_score: 7.5,
    vt_severity_rating: "High",
    vt_detail_id: "d002",
  },
  {
    vt_code: "WFVT-003",
    vt_name: "Weak Encryption (WEP/TKIP)",
    vt_kind: "vulnerability",
    vt_cvss_base_score: 8.1,
    vt_severity_rating: "High",
    vt_detail_id: "d003",
  },
  {
    vt_code: "WFVT-005",
    vt_name: "Management Frame Protection Disabled",
    vt_kind: "vulnerability",
    vt_cvss_base_score: 5.3,
    vt_severity_rating: "Medium",
    vt_detail_id: "d005",
  },
  {
    vt_code: "WFVT-006",
    vt_name: "Evil Twin Detection",
    vt_kind: "threat",
    vt_cvss_base_score: 8.6,
    vt_severity_rating: "High",
    vt_detail_id: "d006",
  },
  {
    vt_code: "WFVT-007",
    vt_name: "MAC Spoofing Detection",
    vt_kind: "threat",
    vt_cvss_base_score: 6.8,
    vt_severity_rating: "Medium",
    vt_detail_id: "d007",
  },
  {
    vt_code: "WFVT-008",
    vt_name: "Deauthentication Attack",
    vt_kind: "threat",
    vt_cvss_base_score: 7.2,
    vt_severity_rating: "High",
    vt_detail_id: "d008",
  },
];

/** Build a Map<vt_code, definition> for use with mapPollResultsToThreatRows */
function buildDefinitionsMap(defs = threatDefinitions) {
  const map = new Map();
  for (const d of defs) {
    map.set(d.vt_code, d);
  }
  return map;
}

/** Sample poll results from the detection pipeline (FastAPI) */
const samplePollResults = [
  {
    bssid: "AA:BB:CC:DD:EE:FF",
    detection_cycle_start: "2026-02-23T10:00:00.000Z",
    findings: {
      evil_twin: {
        id: "WFVT-006",
        status: "DETECTED",
        details: {
          first_seen_epoch: 1740304800, // 2025-02-23T10:00:00Z
          last_seen_epoch: 1740304860,
        },
      },
      mac_spoofing: {
        id: "WFVT-007",
        status: "DETECTED",
        details: {
          first_seen_epoch: 1740304810,
          last_seen_epoch: 1740304870,
        },
      },
    },
  },
  {
    bssid: "AA:BB:CC:DD:EE:FF",
    detection_cycle_start: "2026-02-23T10:05:00.000Z",
    findings: {
      evil_twin: {
        id: "WFVT-006",
        status: "CLEARED",
        details: {
          first_seen_epoch: 1740304900,
          last_seen_epoch: 1740304960,
        },
      },
      deauthentication: {
        id: "WFVT-008",
        status: "DETECTED",
        details: {
          first_seen_epoch: 1740304920,
          last_seen_epoch: null,
        },
      },
    },
  },
];

/** Sample vulnerability rows for sorting/filtering tests */
const sampleVulnerabilityRows = [
  {
    id: 1,
    severity: "Critical",
    name: "Lack of Encryption",
    score: 9.1,
    detectedTime: "2026-02-20T08:00:00.000Z",
    category: "encryption",
  },
  {
    id: 2,
    severity: "High",
    name: "WPS Enabled",
    score: 7.5,
    detectedTime: "2026-02-21T09:00:00.000Z",
    category: "configuration",
  },
  {
    id: 3,
    severity: "High",
    name: "Weak Encryption",
    score: 8.1,
    detectedTime: "2026-02-22T10:00:00.000Z",
    category: "encryption",
  },
  {
    id: 4,
    severity: "Medium",
    name: "PMF Not Enforced",
    score: 5.3,
    detectedTime: "2026-02-19T07:00:00.000Z",
    category: "configuration",
  },
  {
    id: 5,
    severity: "Low",
    name: "Informational Finding",
    score: 2.1,
    detectedTime: "2026-02-18T06:00:00.000Z",
    category: "information",
  },
  {
    id: 6,
    severity: "None",
    name: "Compliant Setting",
    score: 0.0,
    detectedTime: "2026-02-17T05:00:00.000Z",
    category: "compliance",
  },
];

module.exports = {
  threatDefinitions,
  buildDefinitionsMap,
  samplePollResults,
  sampleVulnerabilityRows,
};
