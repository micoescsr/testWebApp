// __tests__/fixtures/scanPayloads.js
// Canonical test fixtures for scan ingestion tests.

/** Valid scan payload matching rasPiController.saveNetworkMetadataScan schema */
const validScanPayload = {
  ssid: "TestNetwork_5G",
  bssid: "AA:BB:CC:DD:EE:FF",
  channel: 6,
  city: "Manila",
  province: "NCR",
  notes: "Office Wi-Fi",
  scan: {
    encryption: "WPA2",
    num_clients: 12,
    scan_start: "2026-02-23T10:00:00.000Z",
    scan_end: "2026-02-23T10:05:00.000Z",
    findings: {
      encryption: {
        id: "WFVT-001",
        status: "DETECTED",
        value: "Open",
      },
      wps: {
        id: "WFVT-002",
        status: "DETECTED",
        value: "Enabled",
      },
      mfp: {
        id: "WFVT-005",
        status: "DETECTED",
        value: "Disabled",
      },
    },
  },
};

/** Payload missing SSID — should fail validation */
const missingSSID = {
  bssid: "AA:BB:CC:DD:EE:FF",
  channel: 6,
};

/** Payload missing BSSID — should fail validation */
const missingBSSID = {
  ssid: "TestNetwork_5G",
  channel: 6,
};

/** Payload missing channel — should fail validation */
const missingChannel = {
  ssid: "TestNetwork_5G",
  bssid: "AA:BB:CC:DD:EE:FF",
};

/** Payload with all required fields missing */
const emptyPayload = {};

/** Payload with suspicious / XSS-like strings */
const xssPayload = {
  ssid: '<script>alert("xss")</script>',
  bssid: "AA:BB:CC:DD:EE:FF",
  channel: 1,
  city: '"><img src=x onerror=alert(1)>',
  notes: "Normal notes & special chars <b>bold</b>",
};

/** Payload with various BSSID formats */
const bssidVariants = {
  colonSeparated: "aa:bb:cc:dd:ee:ff",
  dashSeparated: "aa-bb-cc-dd-ee-ff",
  noSeparator: "aabbccddeeff",
  uppercase: "AA:BB:CC:DD:EE:FF",
  mixed: "Aa:Bb:cC:dD:Ee:Ff",
  invalid: "ZZZZZZZZZZZZ",
  tooShort: "AA:BB:CC",
};

/** Payload for triggerScan (FastAPI proxy) */
const triggerScanPayload = {
  ssid: "TestNetwork",
  bssid: "AA:BB:CC:DD:EE:FF",
  channel: 11,
};

module.exports = {
  validScanPayload,
  missingSSID,
  missingBSSID,
  missingChannel,
  emptyPayload,
  xssPayload,
  bssidVariants,
  triggerScanPayload,
};
