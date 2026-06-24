// utils/networkGrouping.js
//
// Groups the flat network list (from /api/dashboard/networks) by SSID while
// preserving each distinct AP/BSSID underneath. Repeated SSIDs are a real data
// shape (one SSID can be broadcast by several access points), so we group for
// display instead of deleting duplicates — each AP keeps its own network_id,
// which is what the dashboard selects on.

import { getRiskLevel, getRiskLabel } from "./riskColors";

/** Short, human-scannable BSSID tail (last 3 octets), e.g. "A1:B2:C3". */
export function bssidSuffix(bssid) {
  if (!bssid) return null;
  const parts = String(bssid).split(":");
  return parts.length > 3 ? parts.slice(-3).join(":") : bssid;
}

/** Fallback label for networks with no broadcast SSID (e.g. Kismet hidden APs). */
export const HIDDEN_SSID_LABEL = "Hidden SSID";

/** True when a row has a real broadcast SSID (not null/blank/whitespace). */
function hasRealSsid(ssid) {
  return ssid != null && String(ssid).trim() !== "";
}

/** Decorate a raw network row with display SSID + derived risk for display. */
function decorate(n) {
  const score = n.risk_score;
  const hasScore = score != null && score !== "";
  const real = hasRealSsid(n.ssid);
  return {
    ...n,
    displaySsid: real ? n.ssid : HIDDEN_SSID_LABEL,
    isHidden: !real,
    riskLevel: hasScore ? getRiskLevel(score) : "none",
    riskLabel: hasScore ? getRiskLabel(score) : "N/A",
    bssidShort: bssidSuffix(n.bssid),
  };
}

/**
 * Group by SSID. Networks with a real SSID merge under that SSID; hidden/blank
 * SSIDs are NOT merged together (they're unrelated APs) — each becomes its own
 * single-AP group labelled "Hidden SSID". Rows are never dropped.
 *
 * @param {Array} networks raw rows: { network_id, ssid, bssid, channel, encryption_status, num_clients, risk_score }
 * @returns {Array<{ ssid: string, isHidden: boolean, aps: Array }>} groups sorted by SSID.
 */
export function groupNetworksBySsid(networks) {
  const map = new Map();
  for (const n of networks || []) {
    const ap = decorate(n);
    // Real SSIDs share a key; hidden ones stay distinct (keyed by network_id).
    const key = ap.isHidden ? `__hidden__${n.network_id}` : n.ssid;
    if (!map.has(key)) {
      map.set(key, { ssid: ap.displaySsid, isHidden: ap.isHidden, aps: [] });
    }
    map.get(key).aps.push(ap);
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    g.aps.sort((a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1));
  }
  // Real SSIDs first (alphabetical), hidden groups last.
  groups.sort((a, b) => {
    if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
    return a.ssid.localeCompare(b.ssid);
  });
  return groups;
}

/** True if any field of an AP matches the lowercased query. */
export function apMatchesQuery(ap, q) {
  if (!q) return true;
  const hay = [
    ap.ssid,
    ap.displaySsid,
    ap.bssid,
    ap.bssidShort,
    ap.encryption_status,
    ap.riskLabel,
    ap.channel != null ? `ch ${ap.channel}` : "",
    ap.channel != null ? String(ap.channel) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
