// utils/scanStatus.js
//
// Derives the "Status as of previous scan" card state from the current scan
// vs. the previous scan. Keeps the product thresholds in one place so the card
// styling stays purely conditional (no hardcoded warning state).

// A scan older than this many days is considered stale/outdated.
const STALE_DAYS = 14;
// Risk-score deltas (0–100 scale) that mark a meaningful degradation.
const RISK_WARNING_DELTA = 10;
const RISK_CRITICAL_DELTA = 25;
// Absolute current risk that is critical on its own when paired with an increase.
const RISK_CRITICAL_ABSOLUTE = 90;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * @param {number} currentRiskScore  Risk score of the current/selected scan.
 * @param {{ riskScore?: number, finishedAt?: string } | null} previousScan
 * @param {string|null} currentScanDate  ISO date of the current scan (for staleness).
 * @returns {{
 *   level: "normal" | "warning" | "critical",
 *   prevRiskScore: number | null,
 *   daysAgo: number | null,
 *   reasons: string[]
 * }}
 */
export function getPreviousScanStatus(
  currentRiskScore,
  previousScan,
  currentScanDate
) {
  // No previous scan to compare against → neutral. Missing data is NOT treated
  // as a warning (intentional: a first-ever scan is not a degraded state).
  if (!previousScan || previousScan.finishedAt == null) {
    return { level: "normal", prevRiskScore: null, daysAgo: null, reasons: [] };
  }

  const prevRiskScore = previousScan.riskScore ?? 0;
  const current = Number(currentRiskScore) || 0;
  const reasons = [];

  // Days since the previous scan finished.
  let daysAgo = null;
  if (previousScan.finishedAt) {
    const ms = Date.now() - new Date(previousScan.finishedAt).getTime();
    daysAgo = Math.max(0, Math.round(ms / MS_PER_DAY));
  }

  const riskDelta = current - prevRiskScore;

  let level = "normal";

  // Risk increased since the previous scan → security posture degraded.
  if (riskDelta >= RISK_CRITICAL_DELTA) {
    level = "critical";
    reasons.push(`Risk score rose ${riskDelta} pts since the previous scan`);
  } else if (riskDelta >= RISK_WARNING_DELTA) {
    level = "warning";
    reasons.push(`Risk score rose ${riskDelta} pts since the previous scan`);
  }

  // Current scan is critically high and still trending up.
  if (current >= RISK_CRITICAL_ABSOLUTE && riskDelta > 0) {
    level = "critical";
    reasons.push(`Current risk is critical (${current}%)`);
  }

  // Stale: the latest scan data is older than the accepted threshold.
  const staleAnchor = currentScanDate || previousScan.finishedAt;
  if (staleAnchor) {
    const staleDays = Math.round(
      (Date.now() - new Date(staleAnchor).getTime()) / MS_PER_DAY
    );
    if (staleDays > STALE_DAYS) {
      if (level === "normal") level = "warning";
      reasons.push(`Latest scan is ${staleDays}d old (stale)`);
    }
  }

  return { level, prevRiskScore, daysAgo, reasons };
}
