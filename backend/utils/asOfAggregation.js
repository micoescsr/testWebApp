// utils/asOfAggregation.js
//
// Pure helpers for the historical ("as-of") dashboard summary.
//
// The dashboard summary is an environment-wide aggregate of the latest
// completed scan per network. The as-of view applies the same rule with a
// cutoff: for each network, the latest completed scan whose scan_end is at or
// before the end of the selected date (Philippine time — the app-wide display
// timezone, see src/utils/datetime.js). Asia/Manila is UTC+8 with no DST, so
// the end-of-day instant is a fixed offset.

const MANILA_OFFSET = "+08:00";

/** Strict YYYY-MM-DD calendar-date check (rejects impossible dates). */
function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

/**
 * Convert a YYYY-MM-DD selected date to the end-of-day instant in Manila time.
 * Returns an ISO string, or null when the input is invalid.
 */
function manilaEndOfDay(dateString) {
  if (!isValidDateString(dateString)) return null;
  return new Date(`${dateString}T23:59:59.999${MANILA_OFFSET}`).toISOString();
}

/** Manila calendar date (YYYY-MM-DD) for an ISO timestamp, or null. */
function manilaDateOf(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA locale formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Reduce scan rows to the latest completed scan per network.
 * rows: [{ scan_id, network_id, scan_end, ... }] — rows without a network_id
 * or scan_end are ignored (scan_end null means the scan never completed).
 * Returns a Map of network_id → row.
 */
function latestScanPerNetwork(rows) {
  const latest = new Map();
  (rows || []).forEach((r) => {
    if (!r || !r.network_id || !r.scan_end) return;
    const t = new Date(r.scan_end).getTime();
    if (Number.isNaN(t)) return;
    const current = latest.get(r.network_id);
    if (!current || t > new Date(current.scan_end).getTime()) {
      latest.set(r.network_id, r);
    }
  });
  return latest;
}

/** Distinct Manila scan dates (YYYY-MM-DD), newest first. */
function distinctScanDates(rows) {
  const dates = new Set();
  (rows || []).forEach((r) => {
    const day = manilaDateOf(r?.scan_end);
    if (day) dates.add(day);
  });
  return [...dates].sort((a, b) => b.localeCompare(a));
}

module.exports = {
  isValidDateString,
  manilaEndOfDay,
  manilaDateOf,
  latestScanPerNetwork,
  distinctScanDates,
};
