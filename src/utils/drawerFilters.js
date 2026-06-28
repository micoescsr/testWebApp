// utils/drawerFilters.js
//
// Pure helpers for the dashboard metric-drawer filter/sort toolbar. Config-driven
// so the four list drawers (open / encrypted / clients / findings) share one
// engine instead of duplicating filter logic. No React here — just data shaping.
import { getRiskLevel } from "./riskColors";

// Severity / risk-level ordering (higher = more severe = sorts first when desc).
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, none: 0, unknown: 0 };

/** Rank a severity or risk-level string (case-insensitive). Unknown → 0. */
export function severityRank(value) {
  return SEVERITY_RANK[String(value || "").toLowerCase()] ?? 0;
}

// Encryption strength ordering for "weakest security first". Lower = weaker =
// sorts first. Matched by keyword so mixed labels ("WPA/WPA2", "WPA2-TKIP") still
// rank sensibly. Unknown is treated as weak (surfaced early) so it isn't hidden.
export function encryptionRank(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("open") || s === "" || s === "none") return 0;
  if (s.includes("unknown")) return 1;
  if (s.includes("wep")) return 2;
  if (s.includes("wpa3")) return 6;
  if (s.includes("wpa2")) return 5;
  if (s.includes("wpa")) return 4;
  if (s.includes("tkip")) return 3;
  return 7; // anything stronger/unrecognised sorts last
}

/** Case-insensitive "contains" used by the search box across configured fields. */
function matchesSearch(row, search, searchFields) {
  if (!search) return true;
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return searchFields.some((f) => String(row[f] ?? "").toLowerCase().includes(q));
}

/**
 * Apply the drawer's search + dropdown filters + sort to a row list.
 * config: { searchFields, filters: [{ id, match }], sorts: [{ id, cmp }] }
 * state:  { search, filters: { [id]: value }, sort }
 * A filter value of "all" (or empty) is treated as inactive.
 */
export function filterAndSort(rows, config, state) {
  const { searchFields = [], filters = [], sorts = [] } = config;
  const out = rows.filter((row) => {
    if (!matchesSearch(row, state.search, searchFields)) return false;
    return filters.every((def) => {
      const val = state.filters[def.id];
      if (val == null || val === "all" || val === "") return true;
      return def.match(row, val);
    });
  });
  const sortDef = sorts.find((s) => s.id === state.sort);
  if (sortDef) out.sort(sortDef.cmp);
  return out;
}

/** Count of active narrowing controls (search + non-"all" filters); sort excluded. */
export function activeFilterCount(config, state) {
  let n = state.search && state.search.trim() ? 1 : 0;
  for (const def of config.filters || []) {
    const val = state.filters[def.id];
    if (val != null && val !== "all" && val !== "") n += 1;
  }
  return n;
}

/** Distinct, sorted option list ({value,label}) for a field across rows. */
export function distinctOptions(rows, accessor) {
  const set = new Set();
  for (const r of rows) {
    const v = accessor(r);
    if (v) set.add(v);
  }
  return [...set].sort().map((v) => ({ value: v, label: v }));
}

// Shared risk-level filter (used by open / encrypted drawers). Only includes
// levels actually present so the dropdown never offers an empty bucket.
export function riskLevelOptions(rows) {
  return distinctOptions(rows, (r) => getRiskLevel(r.risk_score)).map((o) => ({
    value: o.value,
    label: o.value.charAt(0).toUpperCase() + o.value.slice(1),
  }));
}
