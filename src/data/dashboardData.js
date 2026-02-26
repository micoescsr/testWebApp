// data/dashboardData.js

export const riskScoreData = [{ name: "Wi-Fi Risk", value: 89 }];
export const riskScoreDataPerNetwork = [{ name: "Wi-Fi Risk", value: 78 }];

/**
 * Summary view: combined severity (all kinds) for now
 */
export const severityData = [
  { severity: "Critical", vulnerabilities: 5, threats: 3 },
  { severity: "High",     vulnerabilities: 6, threats: 2 },
  { severity: "Medium",   vulnerabilities: 4, threats: 1 },
  { severity: "Low",      vulnerabilities: 1, threats: 0 },
];

/**
 * Per-network view: example split for one network
 */
export const severityDataPerNetwork = [
  { severity: "Critical", vulnerabilities: 1, threats: 1 },
  { severity: "High",     vulnerabilities: 3, threats: 0 },
  { severity: "Medium",   vulnerabilities: 2, threats: 1 },
  { severity: "Low",      vulnerabilities: 0, threats: 0 },
];

export const threatsData = [
  { name: "MITM", value: 39.11 },
  { name: "Deauth", value: 28.02 },
  { name: "Evil Twins", value: 23.13 },
  { name: "MAC Spoofing", value: 5.03 },
];

export const threatsDataPerNetwork = [
  { name: "Evil Twins", value: 39.11 },
  { name: "Deauth", value: 28.02 },
];

export const commonVulnsData = [
  { name: "Lack of Encryption", count: 12 },
  { name: "WPS Enabled", count: 8 },
  { name: "Weak Encryption (WEP/TKIP)", count: 7 },
  { name: "PMF Not Enforced", count: 3 },
];

export const commonVulnsPerNetwork = [
  { name: "Lack of Encryption", count: 1, severity: "Critical" },
  { name: "WPS Enabled", count: 1, severity: "High" },
  { name: "Weak Encryption (WEP/TKIP)", count: 1, severity: "High" },
  { name: "PMF Not Enforced", count: 1, severity: "Medium" },
];

export const detectedThreatsData = [
  { name: "Evil Twin", count: 1 },
  { name: "Deauthentication", count: 5 },
];

export const COLORS = ["#2563eb", "#f97316", "#22c55e", "#818cf8"];
// Here: 0 = Vulnerabilities (blue), 1 = Threats (orange)
