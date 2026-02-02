// data/dashboardData.js
export const riskScoreData = [{ name: "Wi-Fi Risk", value: 89 }];
export const riskScoreDataPerNetwork = [{ name: "Wi-Fi Risk", value: 78 }];

export const severityData = [
  { name: "Critical", value: 8 },
  { name: "High", value: 6 },
  { name: "Medium", value: 4 },
  { name: "Low", value: 1 },
];

export const severityDataPerNetwork = [
  { name: "Critical", value: 1 },
  { name: "High", value: 3 },
  { name: "Medium", value: 2 },
  { name: "Low", value: 0 },
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

export const COLORS = ["#2563eb", "#818cf8", "#22c55e", "#f97316"];
