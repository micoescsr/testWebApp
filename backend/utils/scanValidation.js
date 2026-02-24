// utils/scanValidation.js
// Extracted scan validation logic — pure functions for unit testing.

/**
 * Validate that a scan exists, belongs to the given network, and is fresh.
 *
 * @param {object}  scan          – scan row from DB (or null/undefined)
 * @param {string}  networkId     – the network_id being enabled
 * @param {number}  maxAgeSeconds – max scan age in seconds
 * @param {number}  [nowMs]       – override Date.now() for testing
 * @returns {{ valid: boolean, error?: string, message?: string, extras?: object }}
 */
function validateScan(scan, networkId, maxAgeSeconds, nowMs) {
  const now = nowMs ?? Date.now();

  // 1. Scan must exist
  if (!scan) {
    return {
      valid: false,
      error: "SCAN_REQUIRED",
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

  // 3. Scan must be fresh
  const scanAge = (now - new Date(scan.created_at).getTime()) / 1000;
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
        ui_color: "#22C55E",
        description: "Low risk — minimal threats detected",
        updated_at: now,
      },
    },
  };
}

module.exports = { validateScan, buildPortalPatchPayload };
