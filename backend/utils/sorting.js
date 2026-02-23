// backend/utils/sorting.js
// Pure sort & filter functions — mirrors logic in useSeverityTableControls.js
// for backend-side processing and unit testing.

const SEVERITY_ORDER = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

/**
 * Sort items by severity label.
 * @param {"asc"|"desc"} direction
 */
function sortBySeverity(items, direction = "desc") {
  return [...items].sort((a, b) => {
    const aVal = SEVERITY_ORDER[String(a.severity || "").toLowerCase()] ?? -1;
    const bVal = SEVERITY_ORDER[String(b.severity || "").toLowerCase()] ?? -1;
    return direction === "desc" ? bVal - aVal : aVal - bVal;
  });
}

/**
 * Sort items by numeric CVSS score.
 * @param {"asc"|"desc"} direction
 */
function sortByScore(items, direction = "desc") {
  return [...items].sort((a, b) => {
    const aVal = Number(a.score) || 0;
    const bVal = Number(b.score) || 0;
    return direction === "desc" ? bVal - aVal : aVal - bVal;
  });
}

/**
 * Sort items by date field.
 * @param {string} dateField  – property name containing a date string
 * @param {"asc"|"desc"} direction
 */
function sortByDate(items, dateField = "detectedTime", direction = "desc") {
  return [...items].sort((a, b) => {
    const aVal = new Date(a[dateField] || 0).getTime();
    const bVal = new Date(b[dateField] || 0).getTime();
    return direction === "desc" ? bVal - aVal : aVal - bVal;
  });
}

/**
 * Filter items to only those matching one or more severity labels.
 * @param {string[]} severities – e.g. ["high", "critical"]
 */
function filterBySeverity(items, severities) {
  if (!Array.isArray(severities) || severities.length === 0) return [...items];
  const set = new Set(severities.map((s) => s.toLowerCase()));
  return items.filter((i) => set.has(String(i.severity || "").toLowerCase()));
}

/**
 * Filter items by a date range.
 * @param {string|Date|null} start – inclusive lower bound
 * @param {string|Date|null} end   – inclusive upper bound
 */
function filterByDateRange(items, start, end, dateField = "detectedTime") {
  return items.filter((item) => {
    const d = new Date(item[dateField]);
    if (isNaN(d.getTime())) return false;
    if (start && d < new Date(start)) return false;
    if (end && d > new Date(end)) return false;
    return true;
  });
}

/**
 * Filter items by a category / type field.
 * @param {string} field      – property name to match
 * @param {string[]} values   – allowed values
 */
function filterByCategory(items, field, values) {
  if (!Array.isArray(values) || values.length === 0) return [...items];
  const set = new Set(values.map((v) => String(v).toLowerCase()));
  return items.filter((i) => set.has(String(i[field] || "").toLowerCase()));
}

module.exports = {
  SEVERITY_ORDER,
  sortBySeverity,
  sortByScore,
  sortByDate,
  filterBySeverity,
  filterByDateRange,
  filterByCategory,
};
