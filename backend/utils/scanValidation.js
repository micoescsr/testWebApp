// utils/scanValidation.js
// Extracted scan validation logic — pure functions for unit testing.
// Uses the `vulnerability_scans` table (uuid scan_id, status, finished_at, error_code).
// Risk score lives on `networks`, NOT on scan rows.

/**
 * Validate that a vulnerability scan exists, belongs to the given network,
 * completed successfully with data, and is fresh.
 *
 * Validation order:
 *   1. Scan row must exist                        → SCAN_NOT_FOUND
 *   2. scan.network_id == networkId                → SCAN_NETWORK_MISMATCH
 *   3a. status IN (FAILED,CANCELLED,TIMEOUT)       → SCAN_FAILED
 *   3b. status != 'COMPLETED' || !finished_at      → SCAN_NOT_FINISHED
 *   4. scan.error_code is null                     → SCAN_HAS_ERRORS
 *   5. scan.scan_data is present                   → SCAN_INVALID_DATA
 *   6. finished_at >= now - maxAge                 → SCAN_TOO_OLD
 *
 * @param {object}  scan          – vulnerability_scans row from DB (or null/undefined)
 * @param {string}  networkId     – the network_id being enabled
 * @param {number}  maxAgeSeconds – max scan age in seconds
 * @param {number}  [nowMs]       – override Date.now() for testing
 * @returns {{ valid: boolean, error?: string, message?: string, extras?: object }}
 */
const SCAN_SUCCESS_STATUS = 'COMPLETED';
const SCAN_FAILURE_STATUSES = new Set(['FAILED', 'CANCELLED', 'TIMEOUT']);

function validateScan(scan, networkId, maxAgeSeconds, nowMs) {
  const now = nowMs ?? Date.now();

  // 1. Scan must exist
  if (!scan) {
    return {
      valid: false,
      error: "SCAN_NOT_FOUND",
      message: "Scan not found. Run a new scan first.",
    };
  }

  // 2. Scan must belong to the requested network
  if (String(scan.network_id) !== String(networkId)) {
    return {
      valid: false,
      error: "SCAN_NETWORK_MISMATCH",
      message: "Scan does not belong to this network.",
    };
  }

  // 3a. Terminal failure states (FAILED / CANCELLED / TIMEOUT)
  if (SCAN_FAILURE_STATUSES.has(scan.status)) {
    return {
      valid: false,
      error: "SCAN_FAILED",
      message: `Scan ${scan.status.toLowerCase()}. Run a new scan.`,
      extras: { scan_status: scan.status },
    };
  }

  // 3b. Not completed yet (QUEUED, RUNNING, or unknown)
  if (scan.status !== SCAN_SUCCESS_STATUS || !scan.finished_at) {
    return {
      valid: false,
      error: "SCAN_NOT_FINISHED",
      message: `Scan is not complete (status: ${scan.status || 'unknown'}). Wait for the scan to finish.`,
    };
  }

  // 4. Scan must not have errors
  if (scan.error_code) {
    return {
      valid: false,
      error: "SCAN_HAS_ERRORS",
      message: `Scan completed with errors (${scan.error_code}). Run a new scan.`,
    };
  }

  // 5. Scan must have data (protects against COMPLETED set by mistake / partial pipeline)
  if (!scan.scan_data || (typeof scan.scan_data === 'object' && Object.keys(scan.scan_data).length === 0)) {
    return {
      valid: false,
      error: "SCAN_INVALID_DATA",
      message: "Scan completed but contains no data. Run a new scan.",
    };
  }

  // 6. Scan must be fresh (finished_at within maxAgeSeconds)
  const scanAge = (now - new Date(scan.finished_at).getTime()) / 1000;
  if (scanAge > maxAgeSeconds) {
    return {
      valid: false,
      error: "SCAN_TOO_OLD",
      message: `Scan is ${Math.round(scanAge / 60)} min old. Max allowed: ${Math.round(maxAgeSeconds / 60)} min. Run a new scan.`,
      extras: {
        scan_age_seconds: Math.round(scanAge),
        max_age_seconds: maxAgeSeconds,
      },
    };
  }

  return { valid: true };
}

/**
 * Validate that the network row has the required config fields
 * for FastAPI orchestration (ssid, bssid, channel).
 *
 * @param {object} network – network row from DB
 * @returns {{ valid: boolean, error?: string, message?: string, missing?: string[] }}
 */
function validateNetworkConfig(network) {
  const required = ['ssid', 'bssid', 'channel'];
  const missing = required.filter((k) => !network?.[k]);

  if (missing.length > 0) {
    return {
      valid: false,
      error: "NETWORK_CONFIG_MISSING",
      message: `Network is missing required config: ${missing.join(', ')}.`,
      missing,
    };
  }
  return { valid: true };
}

/**
 * Encryption types that indicate an open (unencrypted) network.
 * Any value not in this set is considered encrypted → password required.
 */
const OPEN_ENCRYPTION_VALUES = new Set([
  'open', 'none', 'unencrypted', '', null, undefined,
]);

/**
 * Validate AP password requirements based on the network's encryption_status.
 *
 * @param {string|null} encryptionStatus – networks.encryption_status
 * @param {string}      apPassword       – password supplied by admin
 * @returns {{ valid: boolean, error?: string, message?: string }}
 */
function validateApPassword(encryptionStatus, apPassword) {
  const isOpen = OPEN_ENCRYPTION_VALUES.has(
    (encryptionStatus || '').toLowerCase().trim()
  );

  // Open networks don't need a password
  if (isOpen) return { valid: true };

  // Encrypted network — password required
  if (!apPassword || apPassword.trim().length === 0) {
    return {
      valid: false,
      error: "AP_PASSWORD_REQUIRED",
      message: "An AP password is required for encrypted networks.",
    };
  }

  // Minimum strength check (WPA2 minimum = 8 chars)
  if (apPassword.trim().length < 8) {
    return {
      valid: false,
      error: "AP_PASSWORD_WEAK",
      message: "AP password must be at least 8 characters.",
    };
  }

  return { valid: true };
}

/**
 * Build the default portal patch payload for first-time initialization.
 *
 * @param {string} bssid
 * @param {string} ssid
 * @param {number} [nowUnix] – override for testing
 * @returns {object} payload for POST /portal/patch
 */
function buildPortalPatchPayload(bssid, ssid, nowUnix) {
  const now = nowUnix ?? Math.floor(Date.now() / 1000);
  const portalNetworkId = `${bssid} | ${ssid}`;

  return {
    network_id: portalNetworkId,
    patch: {
      portal_content: {
        announcements: {
          updated_at: now,
          announcement_text:
            "Welcome to this secured network. Stay safe online.",
        },
        terms: {
          version: new Date(now * 1000).toISOString().slice(0, 10),
          updated_at: now,
          text: "By connecting to this network, you agree to our terms of service and acceptable use policy.",
        },
        tips: {
          updated_at: now,
          items: [
            "Use a VPN when possible.",
            "Avoid banking on public Wi-Fi.",
            "Keep your device software up to date.",
          ],
        },
      },
      security: {
        score: 0,
        risk_level: "LOW",
        riskColor: "#22C55E",
        riskDescription: "Low risk — minimal threats detected",
        updated_at: now,
      },
    },
  };
}

module.exports = {
  validateScan,
  validateNetworkConfig,
  validateApPassword,
  buildPortalPatchPayload,
};
