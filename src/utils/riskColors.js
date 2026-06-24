// utils/riskColors.js
//
// Single source of truth for risk-score thresholds, labels, and chart colors.
// Colors are CSS custom properties defined in src/styles/tokens.css (the
// product severity scale) — do NOT hardcode hex here. Charts (Recharts) consume
// these `var(--token)` strings directly so they stay theme-aware (dark/light).
//
// Score → level bands (must match the backend riskLabelForReport bands):
//   None 0 · Low 1–39 · Medium 40–69 · High 70–89 · Critical 90–100

export const RISK_THRESHOLDS = [
  { key: "none", label: "None", min: 0, max: 0 },
  { key: "low", label: "Low", min: 1, max: 39 },
  { key: "medium", label: "Medium", min: 40, max: 69 },
  { key: "high", label: "High", min: 70, max: 89 },
  { key: "critical", label: "Critical", min: 90, max: 100 },
];

/** Map a 0–100 risk score to its level key. */
export function getRiskLevel(score) {
  const n = Number(score) || 0;
  if (n <= 0) return "none";
  if (n <= 39) return "low";
  if (n <= 69) return "medium";
  if (n <= 89) return "high";
  return "critical";
}

/** Human label ("None" | "Low" | "Medium" | "High" | "Critical") for a score. */
export function getRiskLabel(score) {
  const level = getRiskLevel(score);
  return RISK_THRESHOLDS.find((t) => t.key === level)?.label ?? "None";
}

// Level/severity key → token. The severity scale in tokens.css is the single
// source of truth for these colors (Critical red, High orange, Medium yellow,
// Low green, None grey).
const SEVERITY_VAR = {
  critical: "--sev-critical-fg",
  high: "--sev-high-fg",
  medium: "--sev-medium-fg",
  low: "--sev-low-fg",
  none: "--sev-none-fg",
  unknown: "--sev-none-fg",
};

/** Color (as a CSS var string) for a severity/level key, case-insensitive. */
export function severityColor(severity) {
  const key = String(severity || "").toLowerCase();
  return `var(${SEVERITY_VAR[key] || "--sev-none-fg"})`;
}

/** Color (as a CSS var string) for a numeric risk score, via its level. */
export function riskColorForScore(score) {
  return severityColor(getRiskLevel(score));
}

// Finding-KIND series colors (vulnerability vs threat). These intentionally use
// NON-severity hues so the kind dimension never visually clashes with the
// severity scale on the same chart.
export const KIND_COLORS = {
  vulnerability: "var(--sev-info-fg)", // blue
  threat: "var(--accent)", // teal/cyan
};
