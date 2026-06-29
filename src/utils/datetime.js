// utils/datetime.js
// Single source of truth for user-facing timestamp formatting.
// All displayed timestamps use Philippine time (Asia/Manila) regardless of
// the browser's local timezone, so scan/publish times read consistently.

const MANILA_TZ = "Asia/Manila";

/**
 * Format an ISO/date value as Philippine time.
 * @param {string|number|Date|null|undefined} value
 * @param {{ dateOnly?: boolean }} [opts] - dateOnly drops the time portion.
 * @returns {string|null} e.g. "06/29/2026, 06:40:30 AM" — or null when the
 *          value is missing/invalid (callers render their own "N/A").
 */
export function formatManila(value, { dateOnly = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(dateOnly
      ? {}
      : { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
  }).format(d);
}
