// __tests__/fixtures/deviceMgmtPayloads.js
// Canonical test fixtures for device management / AP toggle tests.

const NETWORK_ID = "net-abc-123";
const SCAN_ID = "scan-001";
const BSSID = "30:40:74:8E:8D:2A";
const SSID = "DMSCVG 2.4G";
const CHANNEL = 4;
const ENCRYPTION = "WPA2 WPA2-PSK AES-CCMP";

/** Network row as returned by Supabase */
const networkRow = {
  network_id: NETWORK_ID,
  ssid: SSID,
  bssid: BSSID,
  channel: CHANNEL,
  encryption_status: ENCRYPTION,
  portal_initialized: false,
  ap_enabled: false,
};

/** Network row after portal has already been initialized */
const networkRowInitialized = {
  ...networkRow,
  portal_initialized: true,
};

/** Network row with AP already enabled */
const networkRowEnabled = {
  ...networkRowInitialized,
  ap_enabled: true,
};

/** Fresh scan row (created "now") — tests should inject created_at */
const freshScan = (createdAt) => ({
  scan_id: SCAN_ID,
  network_id: NETWORK_ID,
  created_at: createdAt || new Date().toISOString(),
});

/** Scan from a different network */
const mismatchedScan = (createdAt) => ({
  scan_id: SCAN_ID,
  network_id: "other-net-999",
  created_at: createdAt || new Date().toISOString(),
});

/** Old scan (10 min ago) */
const oldScan = () => ({
  scan_id: SCAN_ID,
  network_id: NETWORK_ID,
  created_at: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
});

/** Valid enable request body */
const enableBody = {
  network_id: NETWORK_ID,
  scan_id: SCAN_ID,
  ap_status: "enable",
  ap_password: "#Dns1125",
};

/** Enable without scan_id */
const enableBodyNoScan = {
  network_id: NETWORK_ID,
  ap_status: "enable",
};

/** Disable request body */
const disableBody = {
  network_id: NETWORK_ID,
  ap_status: "disable",
};

/** Orchestrate/apply success response from FastAPI */
const fastapiSuccess = { status: "ok", message: "Applied" };

/** Portal/patch success response from FastAPI */
const portalPatchSuccess = { status: "ok", message: "Patched" };

module.exports = {
  NETWORK_ID,
  SCAN_ID,
  BSSID,
  SSID,
  CHANNEL,
  ENCRYPTION,
  networkRow,
  networkRowInitialized,
  networkRowEnabled,
  freshScan,
  mismatchedScan,
  oldScan,
  enableBody,
  enableBodyNoScan,
  disableBody,
  fastapiSuccess,
  portalPatchSuccess,
};
