// data/mockReportData.js
// Mock data for PDF report exports — mirrors the two attached HTML report templates.
// Replace with real API data when ready.

export const overallMockData = {
  meta: {
    version: "1.0",
    dateOfIssue: "February 25, 2026",
    preparedBy: "Capstone Wi‑Fi Security Team",
    reviewedBy: "ITSO Representative",
    classification: "Confidential – For internal use only",
    assessmentWindow: "Jan 10 – Feb 25, 2026",
  },

  executiveSummary: {
    overallRiskScore: 72,
    riskLabel: "High",
    criticalFindings: 5,
    highFindings: 8,
    totalClientsAtRisk: 75,
    keyBusinessImpacts: [
      "Exposure of student and staff traffic to interception on open networks",
      "Potential account takeover via evil twin hotspots",
      "Disruption of connectivity through deauthentication attacks",
      "Risk of data theft and unauthorized network access",
    ],
    top5Actions: [
      "Migrate open SSIDs to WPA3/WPA2-AES with captive portal where needed",
      "Disable WPS on all access points",
      "Enable Protected Management Frames (PMF) on all SSIDs",
      "Configure rogue AP / evil twin detection on controller",
      "Deploy WIDS alerts for deauth and MAC spoofing",
    ],
  },

  networks: [
    { ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", channel: 6, encryption: "Open", clients: 22, riskPercent: 100, riskLabel: "Critical", findings: 6 },
    { ssid: "Kerbs_FreeWiFi", bssid: "AA:BB:CC:DD:EE:02", channel: 6, encryption: "Open", clients: 18, riskPercent: 50, riskLabel: "Medium", findings: 3 },
    { ssid: "StarboxFreeWiFi", bssid: "AA:BB:CC:DD:EE:03", channel: 11, encryption: "WPA2-PSK AES-CCMP", clients: 15, riskPercent: 32, riskLabel: "Medium", findings: 2 },
    { ssid: "JubileeFreeWiFi", bssid: "AA:BB:CC:DD:EE:04", channel: 1, encryption: "WPA2-PSK AES-CCMP", clients: 11, riskPercent: 17, riskLabel: "Low", findings: 1 },
    { ssid: "ManamFreeWiFi", bssid: "AA:BB:CC:DD:EE:05", channel: 1, encryption: "WPA3-SAE AES-CCMP", clients: 9, riskPercent: 0, riskLabel: "None", findings: 0 },
  ],

  severityBreakdown: [
    { severity: "Critical", vulnerabilities: 2, threats: 3, total: 5 },
    { severity: "High", vulnerabilities: 4, threats: 4, total: 8 },
    { severity: "Medium", vulnerabilities: 0, threats: 0, total: 0 },
    { severity: "Low", vulnerabilities: 0, threats: 0, total: 0 },
  ],

  detailedFindings: {
    openAndWeakCrypto: [
      { network: "Nacho_WiFi", finding: "Weak or Deprecated Cryptographic Algorithms (WFVT-002)", kind: "Vulnerability", severity: "Critical", cvss: 9.4 },
      { network: "Kerbs_FreeWiFi", finding: "Weak or Deprecated Cryptographic Algorithms (WFVT-002)", kind: "Vulnerability", severity: "Critical", cvss: 9.4 },
    ],
    misconfigurations: [
      { network: "Nacho_WiFi", finding: "WPS Enabled (WFVT-003)", kind: "Vulnerability", severity: "High", cvss: 7.6 },
      { network: "Nacho_WiFi", finding: "PMF Disabled (WFVT-004)", kind: "Vulnerability", severity: "High", cvss: 7.1 },
      { network: "Kerbs_FreeWiFi", finding: "PMF Disabled (WFVT-004)", kind: "Vulnerability", severity: "High", cvss: 7.1 },
      { network: "StarboxFreeWiFi", finding: "PMF Disabled (WFVT-004)", kind: "Vulnerability", severity: "High", cvss: 7.1 },
    ],
    activeThreats: [
      { network: "Nacho_WiFi", finding: "Deauthentication Attack (WFVT-005)", kind: "Threat", severity: "High", cvss: 8.5, occurrences: 5 },
      { network: "Nacho_WiFi", finding: "Evil Twin Attack (WFVT-006)", kind: "Threat", severity: "Critical", cvss: 9.3, occurrences: 2 },
      { network: "Nacho_WiFi", finding: "MAC Address Spoofing (WFVT-007)", kind: "Threat", severity: "Critical", cvss: 9.4, occurrences: 1 },
      { network: "Kerbs_FreeWiFi", finding: "Deauthentication Attack (WFVT-005)", kind: "Threat", severity: "High", cvss: 8.5, occurrences: 3 },
      { network: "StarboxFreeWiFi", finding: "Deauthentication Attack (WFVT-005)", kind: "Threat", severity: "High", cvss: 8.5, occurrences: 1 },
      { network: "JubileeFreeWiFi", finding: "Deauthentication Attack (WFVT-005)", kind: "Threat", severity: "High", cvss: 8.5, occurrences: 1 },
    ],
  },

  riskTrend: {
    "Nacho_WiFi": [
      { date: "2026-01-10 08:59:55", score: 14 },
      { date: "2026-01-20 08:59:55", score: 32 },
      { date: "2026-02-01 08:59:55", score: 64 },
      { date: "2026-02-25 08:59:55", score: 100 },
    ],
    "Kerbs_FreeWiFi": [
      { date: "2026-01-15 09:59:55", score: 15 },
      { date: "2026-02-05 09:59:55", score: 33 },
      { date: "2026-02-25 09:59:55", score: 50 },
    ],
  },

  remediation: {
    quickWins: [
      "Migrate open SSIDs to WPA3-SAE or WPA2-AES only",
      "Disable WPS on all access points",
      "Enable Protected Management Frames (PMF) in required mode",
      "Configure rogue AP / evil twin detection on WLAN controller",
      "Deploy WIDS alerts for deauthentication frame bursts and MAC spoofing events",
    ],
    mediumTerm: [
      "Implement 802.1X port-based authentication with RADIUS",
      "Use dynamic ARP inspection and DHCP snooping",
    ],
    detailedMapping: [
      { finding: "WFVT-002", action: "Migrate to WPA3-SAE / WPA2-AES", priority: "Immediate", responsible: "Network Admin" },
      { finding: "WFVT-003", action: "Disable WPS", priority: "Immediate", responsible: "Network Admin" },
      { finding: "WFVT-004", action: "Enable PMF (required mode)", priority: "Immediate", responsible: "Network Admin" },
      { finding: "WFVT-005", action: "Deploy WIDS deauth alerts", priority: "Immediate", responsible: "Network Admin / SOC" },
      { finding: "WFVT-006", action: "Enable rogue AP detection", priority: "Immediate", responsible: "Network Admin / ITSO" },
      { finding: "WFVT-007", action: "Deploy DAI + DHCP snooping", priority: "Short term", responsible: "Network Admin" },
      { finding: "General", action: "Implement 802.1X with RADIUS", priority: "Short term", responsible: "Network Admin" },
    ],
  },

  historicalScans: [
    { scanId: "nacho-s1", ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", start: "2026-01-10 08:59:55", end: "2026-01-10 09:00:00", risk: 14 },
    { scanId: "nacho-s4", ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", start: "2026-02-25 08:59:55", end: "2026-02-25 09:00:00", risk: 100 },
    { scanId: "kerbs-s1", ssid: "Kerbs_FreeWiFi", bssid: "AA:BB:CC:DD:EE:02", start: "2026-01-15 09:59:55", end: "2026-01-15 10:00:00", risk: 15 },
    { scanId: "kerbs-s3", ssid: "Kerbs_FreeWiFi", bssid: "AA:BB:CC:DD:EE:02", start: "2026-02-25 09:59:55", end: "2026-02-25 10:00:00", risk: 50 },
    { scanId: "star-s1", ssid: "StarboxFreeWiFi", bssid: "AA:BB:CC:DD:EE:03", start: "2026-02-10 10:30:00", end: "2026-02-10 10:30:05", risk: 32 },
    { scanId: "jub-s1", ssid: "JubileeFreeWiFi", bssid: "AA:BB:CC:DD:EE:04", start: "2026-02-15 11:00:00", end: "2026-02-15 11:00:05", risk: 17 },
    { scanId: "manam-s1", ssid: "ManamFreeWiFi", bssid: "AA:BB:CC:DD:EE:05", start: "2026-02-20 12:00:00", end: "2026-02-20 12:00:05", risk: 0 },
  ],
};

// Per-network mock data — uses Nacho_WiFi as the default example
export const perNetworkMockData = {
  meta: {
    dateOfIssue: "February 25, 2026",
    preparedBy: "Capstone Wi‑Fi Security Team",
    forWhom: "Network Owner / Administrator",
    classification: "Confidential",
    lastScan: "Feb 25, 2026 09:00:00",
  },

  network: {
    ssid: "Nacho_WiFi",
    bssid: "AA:BB:CC:DD:EE:01",
    channel: 6,
    encryption: "Open",
    clients: 22,
    lastScanDate: "2026-02-25",
    lastScanTime: "09:00:00",
  },

  riskScore: 100,
  riskLabel: "Critical",

  vulnerabilities: [
    { id: "WFVT-002", name: "Weak or Deprecated Cryptographic Algorithms", severity: "Critical", cvss: 9.4, presence: "Detected" },
    { id: "WFVT-003", name: "Wi‑Fi Protected Setup (WPS) Enabled", severity: "High", cvss: 7.6, presence: "Detected" },
    { id: "WFVT-004", name: "Protected Management Frames (PMF) Disabled", severity: "High", cvss: 7.1, presence: "Detected" },
  ],

  threats: [
    { id: "WFVT-005", name: "Deauthentication Attack", severity: "High", cvss: 8.5, occurrences: 5 },
    { id: "WFVT-006", name: "Evil Twin Attack", severity: "Critical", cvss: 9.3, occurrences: 2 },
    { id: "WFVT-007", name: "MAC Address Spoofing Attack", severity: "Critical", cvss: 9.4, occurrences: 1 },
  ],

  findingDetails: [
    { id: "WFVT-002", title: "Weak or Deprecated Cryptographic Algorithms", issue: "Beacon frames advertise open authentication and no encryption, exposing all client traffic to interception.", impact: "Any nearby attacker can capture usernames, passwords, session tokens, and sensitive data transmitted over this network.", evidence: "Network advertises \"Open\" encryption in beacon frames." },
    { id: "WFVT-003", title: "WPS Enabled", issue: "Wi-Fi Protected Setup (WPS) is enabled, allowing PIN brute-force attacks.", impact: "Attackers can recover the network password by exploiting WPS PIN vulnerabilities, typically within hours.", evidence: "AP capability information indicates WPS is enabled." },
    { id: "WFVT-004", title: "PMF Disabled", issue: "Protected Management Frames (802.11w) are not required, leaving management traffic unprotected.", impact: "Attackers can spoof deauthentication frames, disconnect clients, and perform man-in-the-middle attacks.", evidence: "Beacon frames do not advertise PMF as required." },
    { id: "WFVT-005", title: "Deauthentication Attack", issue: "Multiple deauthentication frames targeting active client MACs were observed within short intervals.", impact: "Clients experience connectivity drops and may reconnect to attacker-controlled access points.", evidence: "5 deauth burst events detected during the assessment window.", isThreat: true },
    { id: "WFVT-006", title: "Evil Twin Attack", issue: "An additional AP broadcasting the same SSID with a different BSSID was detected nearby.", impact: "Clients may connect to the rogue AP, exposing credentials and traffic to the attacker.", evidence: "2 instances of duplicate SSID from unauthorized BSSID with comparable signal strength.", isThreat: true },
    { id: "WFVT-007", title: "MAC Address Spoofing", issue: "Conflicting frame sources using the same client MAC address were observed from different signal profiles.", impact: "Attacker may impersonate legitimate clients to bypass MAC-based access controls or launch further attacks.", evidence: "1 instance of MAC spoofing detected based on signal analysis.", isThreat: true },
  ],

  recommendations: {
    immediate: [
      { text: "Disable the open SSID and migrate to WPA3-SAE. If WPA3 is not supported, enforce WPA2-AES only and disable TKIP.", ref: "NIST PR.DS-2, PR.DS-5", responsible: "Network Administrator" },
      { text: "Disable WPS on this access point to prevent brute-force PIN attacks.", ref: "NIST PR.AC-1, PR.AC-7", responsible: "Network Administrator" },
      { text: "Enable Protected Management Frames (IEEE 802.11w) in \"required\" mode to protect against deauthentication and spoofing attacks.", ref: "NIST PR.AC-5, PR.DS-2", responsible: "Network Administrator" },
      { text: "Enable rogue AP / evil twin detection and alerting on the WLAN controller. Maintain an authorized AP inventory (BSSID whitelist).", ref: "NIST DE.CM-1, DE.CM-7", responsible: "Network Administrator / ITSO" },
      { text: "Configure wireless intrusion detection (WIDS) alerts for deauthentication frame bursts and MAC spoofing events.", ref: "NIST DE.CM-1, DE.AE-2", responsible: "Network Administrator / SOC" },
    ],
    shortTerm: [
      { text: "Implement 802.1X port-based authentication with RADIUS to replace pre-shared keys and improve access control.", ref: "NIST PR.AC-1", responsible: "Network Administrator" },
      { text: "Deploy dynamic ARP inspection (DAI) and DHCP snooping to detect and prevent MAC address spoofing on the wired infrastructure.", ref: "NIST DE.CM-1", responsible: "Network Administrator" },
    ],
  },

  riskTrend: [
    { date: "2026-01-10", time: "08:59:55", score: 14, level: "Low" },
    { date: "2026-01-20", time: "08:59:55", score: 32, level: "Medium" },
    { date: "2026-02-01", time: "08:59:55", score: 64, level: "High" },
    { date: "2026-02-25", time: "08:59:55", score: 100, level: "Critical" },
  ],

  historicalScans: [
    { scanId: "nacho-s1", ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", start: "2026-01-10 08:59:55", end: "2026-01-10 09:00:00", risk: 14 },
    { scanId: "nacho-s2", ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", start: "2026-01-20 08:59:55", end: "2026-01-20 09:00:00", risk: 32 },
    { scanId: "nacho-s3", ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", start: "2026-02-01 08:59:55", end: "2026-02-01 09:00:00", risk: 64 },
    { scanId: "nacho-s4", ssid: "Nacho_WiFi", bssid: "AA:BB:CC:DD:EE:01", start: "2026-02-25 08:59:55", end: "2026-02-25 09:00:00", risk: 100 },
  ],
};
