// utils/historyRows.js
//
// Shared derivation for History scan rows so filtering/sorting (History.jsx) and
// display (history tables) agree on a single risk score, level, label, and the
// vulnerability/threat counts. Risk level/label come from the centralized
// riskColors helper (single source of truth).
import { getRiskLevel, getRiskLabel } from "./riskColors";

/** Numeric risk score for a row: explicit riskScore, else max finding score. */
export function deriveRiskScore(item) {
  if (item?.riskScore != null) return Number(item.riskScore) || 0;
  const vulns = item?.details || item?.vulnerabilities || [];
  const threats = item?.threats || [];
  const scores = [...vulns, ...threats].map((x) => Number(x.score || x.cvss) || 0);
  return scores.length ? Math.max(...scores) : 0;
}

/** Vulnerability / threat counts for a row (explicit counts, else array length). */
export function deriveCounts(item) {
  const vulns = item?.details || item?.vulnerabilities || [];
  const threats = item?.threats || [];
  return {
    vulnCount: item?.vulnCount ?? vulns.length,
    threatCount: item?.threatCount ?? threats.length,
  };
}

/** Attach derived risk + counts to a row (non-destructive). */
export function enrichHistoryRow(item) {
  const riskScore = deriveRiskScore(item);
  const { vulnCount, threatCount } = deriveCounts(item);
  return {
    ...item,
    riskScore,
    riskLevel: getRiskLevel(riskScore), // "none" | "low" | ... (class + filter key)
    riskLabel: getRiskLabel(riskScore).toUpperCase(), // "NONE" | "LOW" | ...
    vulnCount,
    threatCount,
  };
}
