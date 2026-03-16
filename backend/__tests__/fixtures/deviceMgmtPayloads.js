// __tests__/fixtures/deviceMgmtPayloads.js
// Canonical test fixtures for device management / AP toggle tests.

const NETWORK_ID = "11111111-1111-1111-1111-111111111111";
const SCAN_ID = "22222222-2222-2222-2222-222222222222";
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
	risk_score_version: 0,
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

/** Fresh vulnerability scan row (finished "now") */
const freshScan = (finishedAt) => ({
  scan_id: SCAN_ID,
  network_id: NETWORK_ID,
  status: "COMPLETED",
  finished_at: finishedAt || new Date().toISOString(),
  error_code: null,
  scan_data: { findings: { example: { id: "WFVT-005", status: "DETECTED" } } },
});

/** Scan from a different network */
const mismatchedScan = (finishedAt) => ({
  scan_id: SCAN_ID,
  network_id: "33333333-3333-3333-3333-333333333333",
  status: "COMPLETED",
  finished_at: finishedAt || new Date().toISOString(),
  error_code: null,
  scan_data: { findings: { example: { id: "WFVT-005", status: "DETECTED" } } },
});

/** Old scan (10 min ago) */
const oldScan = () => ({
  scan_id: SCAN_ID,
  network_id: NETWORK_ID,
	status: "COMPLETED",
	finished_at: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
	error_code: null,
	scan_data: { findings: { example: { id: "WFVT-005", status: "DETECTED" } } },
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

/** Orchestrate/apply ACCEPTED response (async path) */
const fastapiAccepted = {
  status: "ACCEPTED",
  job_id: "orch_1234567890_abcdef01",
  message: "Job queued",
};

/** /orchestrate/poll — job still running */
const orchestratePollOngoing = {
  status: "ONGOING",
  job_id: "orch_1234567890_abcdef01",
  result: null,
};

/** /orchestrate/poll — job done successfully */
const orchestratePollDone = {
  status: "DONE",
  job_id: "orch_1234567890_abcdef01",
  result: { status: "ok", message: "Applied" },
};

/** /orchestrate/poll — job done with application error */
const orchestratePollFailed = {
  status: "DONE",
  job_id: "orch_1234567890_abcdef01",
  result: { status: "ERROR", error_code: "CONNECTION_FAILED", user_message: "Could not connect." },
};

/** /ap/poll — AP enabled */
const apPollEnabled = {
  ap_enabled: true,
  ap_status: "enabled",
  uplink: { status: "connected" },
};

/** /ap/poll — AP disabled */
const apPollDisabled = {
  ap_enabled: false,
  ap_status: "disabled",
  uplink: { status: "disconnected" },
};

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
  fastapiAccepted,
  orchestratePollOngoing,
  orchestratePollDone,
  orchestratePollFailed,
  apPollEnabled,
  apPollDisabled,
  portalPatchSuccess,
};
