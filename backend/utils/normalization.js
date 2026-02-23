// backend/utils/normalization.js
// Payload normalization & validation for scan ingestion.

/**
 * Normalize a raw scan payload into a canonical schema.
 * - BSSID → uppercase with colons
 * - SSID  → trimmed string
 * - channel → integer
 * - timestamp → ISO-8601 string (default: now)
 */
function normalizeScanPayload(payload = {}) {
  return {
    ssid: String(payload.ssid ?? "").trim(),
    bssid: normalizeBSSID(payload.bssid),
    channel: payload.channel != null ? Number(payload.channel) : null,
    timestamp: payload.timestamp || new Date().toISOString(),
    encryption: payload.encryption ?? payload.scan?.encryption ?? null,
    num_clients: payload.num_clients ?? payload.scan?.num_clients ?? null,
    city: sanitizeString(payload.city),
    province: sanitizeString(payload.province),
    notes: sanitizeString(payload.notes),
  };
}

/**
 * Normalize BSSID to uppercase colon-separated format.
 * Handles dash-separated, no-separator, and mixed-case input.
 *
 * Examples:
 *   "aa:bb:cc:dd:ee:ff" → "AA:BB:CC:DD:EE:FF"
 *   "aa-bb-cc-dd-ee-ff" → "AA:BB:CC:DD:EE:FF"
 *   "aabbccddeeff"       → "AA:BB:CC:DD:EE:FF"
 */
function normalizeBSSID(bssid) {
  if (!bssid) return null;
  // Strip any separator, uppercase, then re-insert colons
  const hex = String(bssid).replace(/[:\-\s]/g, "").toUpperCase();
  if (hex.length !== 12 || !/^[0-9A-F]{12}$/.test(hex)) {
    return String(bssid).toUpperCase().trim();
  }
  return hex.match(/.{2}/g).join(":");
}

/**
 * Validate a scan payload. Returns { valid, errors }.
 * Required fields: ssid, bssid, channel (as per rasPiController.js).
 */
function validateScanPayload(payload = {}) {
  const errors = [];

  if (!payload.ssid || String(payload.ssid).trim() === "") {
    errors.push("SSID is required");
  }

  if (!payload.bssid || String(payload.bssid).trim() === "") {
    errors.push("BSSID is required");
  } else {
    const hex = String(payload.bssid).replace(/[:\-\s]/g, "");
    if (hex.length !== 12 || !/^[0-9A-Fa-f]{12}$/.test(hex)) {
      errors.push("BSSID must be a valid MAC address (12 hex digits)");
    }
  }

  if (payload.channel === undefined || payload.channel === null) {
    errors.push("Channel is required");
  } else if (!Number.isFinite(Number(payload.channel)) || Number(payload.channel) < 0) {
    errors.push("Channel must be a non-negative number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize a string to prevent XSS / injection when stored or rendered.
 * Encodes HTML entities for <, >, &, ", '.
 */
function sanitizeString(value) {
  if (value == null) return null;
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}

module.exports = {
  normalizeScanPayload,
  normalizeBSSID,
  validateScanPayload,
  sanitizeString,
};
