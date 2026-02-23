// backend/utils/scoring.js
// Pure scoring & severity functions — deterministic, no I/O.

/**
 * CVSS v3.1 severity thresholds.
 * @see https://www.first.org/cvss/specification-document (Section 5)
 *
 * | Score       | Severity |
 * |-------------|----------|
 * | 0.0         | None     |
 * | 0.1 – 3.9   | Low      |
 * | 4.0 – 6.9   | Medium   |
 * | 7.0 – 8.9   | High     |
 * | 9.0 – 10.0  | Critical |
 */
function computeSeverityFromScore(score) {
  if (score == null || score === "" || Number.isNaN(Number(score))) return "N/A";
  const n = Number(score);
  if (n < 0 || n > 10) return "N/A";
  if (n === 0) return "None";
  if (n < 4.0) return "Low";
  if (n < 7.0) return "Medium";
  if (n < 9.0) return "High";
  return "Critical";
}

/**
 * Compute an aggregate Wi-Fi risk score (0-100) from an array of findings.
 * Each finding is expected to have a numeric `score` (0-10 CVSS).
 *
 * Algorithm:
 *  1. If no findings → 0
 *  2. Weighted sum: critical ×10, high ×7, medium ×4, low ×1
 *  3. Clamp to [0, 100]
 */
function computeRiskScore(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return 0;

  const weights = { critical: 10, high: 7, medium: 4, low: 1, none: 0 };

  let total = 0;
  for (const f of findings) {
    const severity = computeSeverityFromScore(f.score).toLowerCase();
    total += weights[severity] ?? 0;
  }

  return Math.min(100, total);
}

/**
 * Map raw poll results from the detection pipeline into canonical threat rows.
 * Extracted from server.js for testability.
 *
 * @param {Array} results  – raw detection cycle results
 * @param {Map}   defsByCode – Map<vt_code, { vt_name, vt_cvss_base_score, vt_severity_rating }>
 * @returns {Array} aggregated threat rows
 */
function mapPollResultsToThreatRows(results, defsByCode) {
  const grouped = new Map();
  const findingKeys = ["evil_twin", "mac_spoofing", "deauthentication"];

  for (const r of results || []) {
    for (const key of findingKeys) {
      const f = r?.findings?.[key];
      if (!f) continue;

      const vtCode = f.id;
      const detail = defsByCode.get(vtCode);
      if (!detail) continue;

      const firstSeen = f.details?.first_seen_epoch;
      const lastSeen = f.details?.last_seen_epoch;
      const mapKey = vtCode;

      if (!grouped.has(mapKey)) {
        grouped.set(mapKey, {
          id: vtCode,
          name: detail.vt_name,
          severity: detail.vt_severity_rating,
          score: detail.vt_cvss_base_score,
          status: f.status,
          occurrences: 1,
          detectedTime: firstSeen
            ? new Date(firstSeen * 1000).toISOString()
            : r.detection_cycle_start,
          sessions: [
            {
              firstSeen,
              lastSeen,
              state: f.status,
            },
          ],
          raw: [r],
        });
      } else {
        const agg = grouped.get(mapKey);
        agg.occurrences += 1;
        agg.status = f.status;
        if (lastSeen) {
          agg.detectedTime = new Date(lastSeen * 1000).toISOString();
        }
        agg.sessions.push({
          firstSeen,
          lastSeen,
          state: f.status,
        });
        agg.raw.push(r);
      }
    }
  }

  return Array.from(grouped.values());
}

module.exports = {
  computeSeverityFromScore,
  computeRiskScore,
  mapPollResultsToThreatRows,
};
