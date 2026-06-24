// utils/reportTemplates.js
// Generates self-contained HTML documents for PDF export.
// Each function returns a full HTML string with inline CSS + Plotly charts.

// ─── Shared CSS (common between both reports) ───────────────────
const sharedCSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f7fa; color: #2c3e50; line-height: 1.6; }
.report-container { max-width: 1000px; margin: 0 auto; padding: 20px; }
.cover-page { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 60px 50px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
.cover-page h1 { font-size: 2.5em; margin-bottom: 15px; font-weight: 700; }
.cover-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 30px; font-size: 0.9em; }
.cover-meta p { padding: 8px; background: rgba(255,255,255,0.15); border-radius: 6px; }
.cover-meta strong { font-weight: 600; }
.network-highlight { font-size: 1.8em; margin-top: 10px; padding: 15px; background: rgba(255,255,255,0.2); border-radius: 8px; }
.section { background: white; padding: 35px; margin-bottom: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
.section h2 { color: #667eea; font-size: 1.7em; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 3px solid #667eea; }
.section h3 { color: #4a5568; font-size: 1.2em; margin: 20px 0 12px 0; }
.info-box { background: #edf2f7; border-left: 4px solid #667eea; padding: 18px; margin: 15px 0; border-radius: 6px; }
.info-box.warning { background: #fff5f5; border-left-color: #fc8181; }
.info-box p { margin: 6px 0; font-size: 0.95em; }
.info-box ul { list-style: none; padding-left: 0; }
.info-box li { padding: 5px 0; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
thead { background: #667eea; color: white; }
th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 0.9em; }
tbody tr:hover { background: #f7fafc; }
.severity-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600; }
.severity-critical { background: #fed7d7; color: #c53030; }
.severity-high { background: #feebc8; color: #c05621; }
.severity-medium { background: #fefcbf; color: #975a16; }
.severity-low { background: #c6f6d5; color: #276749; }
.badge-none { background: #4caf50; color: white; padding: 5px 12px; border-radius: 4px; font-size: 0.85em; font-weight: 600; }
.summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
.summary-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
.summary-card .card-label { font-size: 0.85em; opacity: 0.9; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.summary-card .card-value { font-size: 1.8em; font-weight: 700; margin-top: 5px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
.risk-gauge-large { grid-column: span 3; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; }
.risk-gauge-circle { width: 140px; height: 140px; border-radius: 50%; background: white; margin: 15px auto; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.15); }
.risk-gauge-circle .score { font-size: 2.8em; font-weight: 700; color: #f5576c; }
.risk-gauge-circle .label { font-size: 0.85em; color: #666; margin-top: 3px; }
.exec-summary-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; margin-top: 20px; }
.exec-text ul { list-style: none; margin: 15px 0; }
.exec-text li { padding: 12px 0; padding-left: 25px; position: relative; }
.exec-text li:before { content: "▸"; position: absolute; left: 0; color: #667eea; font-weight: bold; }
.risk-gauge { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 12px; padding: 30px; text-align: center; color: white; }
.quick-metrics { margin-top: 20px; }
.quick-metrics p { padding: 8px 0; font-size: 0.95em; }
.risk-bands { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 20px; }
.risk-band { padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.band-range { font-size: 1.5em; font-weight: bold; margin-bottom: 5px; }
.band-label { font-size: 1.1em; font-weight: 600; }
.two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 20px 0; }
.rec-list { list-style: none; padding-left: 0; }
.rec-list li { padding: 15px; margin: 10px 0; background: #f7fafc; border-left: 4px solid #667eea; border-radius: 6px; font-size: 0.95em; }
.rec-list li strong { color: #667eea; }
.priority-immediate { border-left-color: #f56565; }
.priority-short { border-left-color: #ed8936; }
.status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
.status-critical { background: #f56565; }
.status-high { background: #ed8936; }
.status-medium { background: #ecc94b; }
.status-low { background: #48bb78; }
@media print { .report-container { max-width: 100%; } .section { page-break-inside: avoid; } }
`;

// ─── Helpers ────────────────────────────────────────────────────

function severityBadge(level) {
  const cls = (level || "").toLowerCase();
  if (cls === "none") return `<span class="badge-none">None</span>`;
  return `<span class="severity-badge severity-${cls}">${level}</span>`;
}

/**
 * Render source label(s) as clickable links when URLs are available.
 * `label` is a comma-joined string of source labels; `urls` is the matching
 * list. Falls back to plain text when no URLs exist. Anchor tags survive the
 * print-to-PDF path used by exportReport.js.
 */
function renderSourceLinks(label, urls) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (list.length === 0) return label || "N/A";
  const labels = (label || "").split(", ");
  return list
    .map(
      (u, i) =>
        `<a href="${u}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${labels[i] || label}</a>`,
    )
    .join(", ");
}

function riskBands() {
  return `
    <div class="risk-bands">
      <div class="risk-band" style="background:#e8f5e9;border-left:4px solid #4caf50;"><div class="band-range">0%</div><div class="band-label">None</div></div>
      <div class="risk-band" style="background:#fff3e0;border-left:4px solid #ff9800;"><div class="band-range">1–39%</div><div class="band-label">Low</div></div>
      <div class="risk-band" style="background:#fff9c4;border-left:4px solid #fbc02d;"><div class="band-range">40–69%</div><div class="band-label">Medium</div></div>
      <div class="risk-band" style="background:#ffe0b2;border-left:4px solid #f57c00;"><div class="band-range">70–89%</div><div class="band-label">High</div></div>
      <div class="risk-band" style="background:#ffcdd2;border-left:4px solid #d32f2f;"><div class="band-range">90–100%</div><div class="band-label">Critical</div></div>
    </div>`;
}

function scopeSection() {
  return `
    <div class="section">
      <h2>Scope and Limitations</h2>
      <div class="info-box">
        <h3 style="margin-top:0;color:#667eea;">What this report does</h3>
        <ul style="list-style:none;padding-left:0;">
          <li>✓ Listens to Wi‑Fi signals only (no logins, no attacks)</li>
          <li>✓ Shows what we observed during passive scanning</li>
          <li>✓ Gives rule-based recommendations based on CVSS</li>
        </ul>
      </div>
      <div class="info-box warning">
        <h3 style="margin-top:0;color:#c53030;">What this report does NOT do</h3>
        <ul style="list-style:none;padding-left:0;">
          <li>✗ Does not fix or change any network settings</li>
          <li>✗ Does not try to exploit any weakness</li>
          <li>✗ Does not use AI to guess future attacks</li>
        </ul>
      </div>
      <p><strong>Passive scanning methodology:</strong> This assessment used passive-only Wi‑Fi scanning. The scanner listened for IEEE 802.11 management frames (beacons, probe responses, authentication, association, and deauthentication frames) without transmitting any data or attempting to join the networks under test.</p>
      <p><strong>Recommendation scope:</strong> All recommendations are rule-based mappings from detected findings to predefined actions. They are driven by CVSS base scores and severity. No AI, no predictive modeling, no probabilistic exploit forecasting.</p>
      <p><strong>Limitations:</strong> The findings and scores show the minimum risk we could observe at that time. Because only broadcast and management traffic was observed and the scan duration per network was limited, some attack types or misconfigurations may not have been visible during the assessment window. Actual risk may be higher.</p>
    </div>`;
}

function scoringSection() {
  return `
    <div class="section">
      <h2>Scoring and Recommendation Model</h2>
      <div class="summary-cards">
        <div class="summary-card"><div class="card-label">CVSS-Based</div><div class="card-value">✓</div><p style="font-size:0.85em;margin-top:10px;">Impact from CVSS base scores</p></div>
        <div class="summary-card"><div class="card-label">Binary Presence</div><div class="card-value">✓</div><p style="font-size:0.85em;margin-top:10px;">Likelihood from detection</p></div>
        <div class="summary-card"><div class="card-label">Rule-Based</div><div class="card-value">✓</div><p style="font-size:0.85em;margin-top:10px;">Predefined mapping table</p></div>
        <div class="summary-card"><div class="card-label">No AI</div><div class="card-value">✓</div><p style="font-size:0.85em;margin-top:10px;">No predictive modeling</p></div>
      </div>
      <div class="info-box">
        <p><strong>Expert validation:</strong> The scoring model will be independently reviewed by subject-matter experts in wireless network security, cybersecurity risk assessment, and information security using a 4-point acceptability scale.</p>
      </div>
      <h3>Risk Classification Bands</h3>
      ${riskBands()}
    </div>`;
}

function nextStepsSection() {
  return `
    <div class="section">
      <h2>Next Steps</h2>
      <div class="info-box">
        <h3 style="margin-top:0;color:#667eea;">For Network Administrators</h3>
        <ol style="padding-left:20px;margin:10px 0;">
          <li>Review all immediate recommendations and schedule configuration changes within 30 days</li>
          <li>Coordinate with ITSO and security team for rogue AP detection implementation</li>
          <li>Document current AP configuration before making changes</li>
          <li>Test changes in a controlled environment if possible</li>
          <li>Plan user communication for any SSID or authentication changes</li>
        </ol>
      </div>
      <div class="info-box warning">
        <h3 style="margin-top:0;color:#c53030;">For Management / ITSO</h3>
        <ol style="padding-left:20px;margin:10px 0;">
          <li>Prioritize remediation budget for high-risk networks</li>
          <li>Consider temporary network shutdown if threat activity continues</li>
          <li>Schedule follow-up assessment after remediation (30-45 days)</li>
          <li>Review other networks with similar configurations for similar risks</li>
        </ol>
      </div>
      <p style="margin-top:20px;"><strong>Questions or assistance needed?</strong> Contact the Capstone Wi‑Fi Security Team for clarification on findings or implementation guidance.</p>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// 1. OVERALL (SUMMARY) REPORT
// ═══════════════════════════════════════════════════════════════
export function generateOverallReportHTML(d) {
  const nets = d.networks || [];
  const es = d.executiveSummary || {};
  const sev = d.severityBreakdown || [];
  const df = d.detailedFindings || {};
  const rem = d.remediation || {};
  const hist = d.historicalScans || [];
  const meta = d.meta || {};

  // Build Plotly data as JS strings
  const clientsPerSSID_X = JSON.stringify(nets.map(n => n.ssid));
  const clientsPerSSID_Y = JSON.stringify(nets.map(n => n.clients));

  const riskBySSID_X = JSON.stringify(nets.map(n => n.ssid));
  const riskBySSID_Y = JSON.stringify(nets.map(n => n.riskPercent));
  const riskBySSID_Colors = JSON.stringify(nets.map(n => {
    if (n.riskLabel === "Critical") return "#d62728";
    if (n.riskLabel === "High") return "#ff7f0e";
    if (n.riskLabel === "Medium") return "#ff7f0e";
    return "#2ca02c";
  }));

  const sevLabels = JSON.stringify(sev.map(s => s.severity));
  const sevVulns = JSON.stringify(sev.map(s => s.vulnerabilities));
  const sevThreats = JSON.stringify(sev.map(s => s.threats));
  const sevTotals = JSON.stringify(sev.map(s => s.total));

  // Risk trend traces
  const riskTrend = d.riskTrend || {};
  const trendTraces = Object.entries(riskTrend).map(([ssid, points]) => {
    return `{ x: ${JSON.stringify(points.map(p => p.date))}, y: ${JSON.stringify(points.map(p => p.score))}, mode:"lines+markers", name:${JSON.stringify(ssid)} }`;
  }).join(",");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Wi-Fi Security Assessment - Overall Networks</title>
<style>${sharedCSS}</style>
</head>
<body>
<div class="report-container">

  <!-- COVER -->
  <div class="cover-page">
    <h1>Wi‑Fi Security Assessment<br>Overall Networks</h1>
    <div class="cover-meta">
      <p><strong>Version:</strong> ${meta.version}</p>
      <p><strong>Date of issue:</strong> ${meta.dateOfIssue}</p>
      <p><strong>Prepared by:</strong> ${meta.preparedBy}</p>
      <p><strong>Reviewed by:</strong> ${meta.reviewedBy}</p>
      <p><strong>Classification:</strong> ${meta.classification}</p>
      <p><strong>Assessment window:</strong> ${meta.assessmentWindow}</p>
    </div>
  </div>

  ${scopeSection()}

  <!-- EXECUTIVE SUMMARY -->
  <div class="section">
    <h2>Executive Summary</h2>
    <div class="exec-summary-grid">
      <div class="exec-text">
        <h3>Overall Risk Posture</h3>
        <ul>
          <li><strong>Current overall risk score: ${es.overallRiskScore} / 100 (${es.riskLabel})</strong></li>
          <li>${es.criticalFindings} critical and ${es.highFindings} high-severity findings across assessed SSIDs</li>
          <li>${es.totalClientsAtRisk} total clients at risk across all monitored networks</li>
        </ul>
        <h3>Key Business Impacts</h3>
        <ul>${(es.keyBusinessImpacts || []).map(i => `<li>${i}</li>`).join("")}</ul>
        <h3>Top 5 Recommended Actions (Next 30 Days)</h3>
        <ol style="padding-left:25px;">${(es.top5Actions || []).map(a => `<li>${a}</li>`).join("")}</ol>
      </div>
      <div>
        <div class="risk-gauge">
          <h3 style="margin:0 0 10px 0;">Overall Risk</h3>
          <div class="risk-gauge-circle">
            <div class="score">${es.overallRiskScore}</div>
            <div class="label">${es.riskLabel}</div>
          </div>
          <div class="quick-metrics">
            <p>Critical findings: ${es.criticalFindings}</p>
            <p>High findings: ${es.highFindings}</p>
            <p>Clients at risk: ${es.totalClientsAtRisk}</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  ${scoringSection()}

  <!-- ENVIRONMENT OVERVIEW -->
  <div class="section">
    <h2>Environment Overview</h2>
    <div id="clients-per-ssid" style="width:100%;max-width:800px;height:300px;"></div>
    <h3>Detected Networks</h3>
    <table>
      <thead><tr><th>SSID</th><th>BSSID</th><th>Channel</th><th>Encryption</th><th>Clients</th></tr></thead>
      <tbody>${nets.map(n => `<tr><td>${n.ssid}</td><td>${n.bssid}</td><td>${n.channel}</td><td>${n.encryption}</td><td>${n.clients}</td></tr>`).join("")}</tbody>
    </table>
    <div class="info-box">
      <p><strong>Highest risk SSID:</strong> ${nets[0]?.ssid} (score ${nets[0]?.riskPercent})</p>
      <p><strong>Most clients:</strong> ${nets[0]?.ssid} (${nets[0]?.clients} clients)</p>
      <p><strong>Safest SSID:</strong> ${nets[nets.length - 1]?.ssid} (score ${nets[nets.length - 1]?.riskPercent})</p>
    </div>
  </div>

  <!-- RISK DISTRIBUTION -->
  <div class="section">
    <h2>Risk Distribution</h2>
    <div id="findings-by-severity" style="width:100%;max-width:800px;height:300px;"></div>
    <h3>Vulnerabilities vs Threats</h3>
    <table>
      <thead><tr><th>Severity</th><th>Vulnerabilities</th><th>Threats</th><th>Total</th></tr></thead>
      <tbody>${sev.map(s => `<tr><td>${severityBadge(s.severity)}</td><td>${s.vulnerabilities}</td><td>${s.threats}</td><td>${s.total}</td></tr>`).join("")}</tbody>
    </table>
  </div>

  <!-- NETWORK RISK SCORES -->
  <div class="section">
    <h2>Network Risk Scores</h2>
    <table>
      <thead><tr><th>SSID</th><th>Risk %</th><th>Risk Label</th><th># Findings</th><th>Clients</th></tr></thead>
      <tbody>${nets.map(n => `<tr><td>${n.ssid}</td><td>${n.riskPercent}%</td><td>${severityBadge(n.riskLabel)}</td><td>${n.findings}</td><td>${n.clients}</td></tr>`).join("")}</tbody>
    </table>
    <div id="risk-trend" style="width:100%;max-width:800px;height:300px;"></div>
    <div id="risk-by-ssid" style="width:100%;max-width:800px;height:300px;margin-bottom:20px;"></div>
  </div>

  <!-- DETAILED FINDINGS -->
  <div class="section">
    <h2>Detailed Findings</h2>
    <h3>4.1 Open Networks &amp; Weak Cryptography</h3>
    <p>Open networks allow any client to connect without authentication and transmit traffic in cleartext, exposing all data to interception.</p>
    <table>
      <thead><tr><th>Network</th><th>Finding</th><th>Kind</th><th>Severity</th><th>CVSS</th></tr></thead>
      <tbody>${(df.openAndWeakCrypto || []).map(f => `<tr><td>${f.network}</td><td>${f.finding}</td><td>${f.kind}</td><td>${severityBadge(f.severity)}</td><td>${f.cvss}</td></tr>`).join("")}</tbody>
    </table>
    <h3>4.2 Wireless Misconfigurations</h3>
    <p>WPS and disabled PMF expose networks to brute-force attacks and management frame spoofing.</p>
    <table>
      <thead><tr><th>Network</th><th>Finding</th><th>Kind</th><th>Severity</th><th>CVSS</th></tr></thead>
      <tbody>${(df.misconfigurations || []).map(f => `<tr><td>${f.network}</td><td>${f.finding}</td><td>${f.kind}</td><td>${severityBadge(f.severity)}</td><td>${f.cvss}</td></tr>`).join("")}</tbody>
    </table>
    <h3>4.3 Active Threat Indicators</h3>
    <p>Deauthentication, evil twin, and MAC spoofing attacks were actively detected during the assessment window.</p>
    <table>
      <thead><tr><th>Network</th><th>Finding</th><th>Kind</th><th>Severity</th><th>CVSS</th><th>Occurrences</th></tr></thead>
      <tbody>${(df.activeThreats || []).map(f => `<tr><td>${f.network}</td><td>${f.finding}</td><td>${f.kind}</td><td>${severityBadge(f.severity)}</td><td>${f.cvss}</td><td>${f.occurrences}</td></tr>`).join("")}</tbody>
    </table>
  </div>

  <!-- REMEDIATION PLAN -->
  <div class="section">
    <h2>Remediation Plan</h2>
    <h3>Quick Wins (0–30 days)</h3>
    <ul class="rec-list">${(rem.quickWins || []).map(r => `<li class="priority-immediate"><strong>Immediate:</strong> ${r}</li>`).join("")}</ul>
    <h3>Medium Term (1–3 months)</h3>
    <ul class="rec-list">${(rem.mediumTerm || []).map(r => `<li class="priority-short"><strong>Short term:</strong> ${r}</li>`).join("")}</ul>
    <h3>Detailed Recommendation Mapping</h3>
    <table>
      <thead><tr><th>Finding</th><th>Action</th><th>Source</th><th>Priority</th><th>Responsible</th></tr></thead>
      <tbody>${(rem.detailedMapping || []).map(r => `<tr><td>${r.finding}</td><td>${r.action}</td><td>${renderSourceLinks(r.source, r.sourceUrls)}</td><td>${r.priority}</td><td>${r.responsible}</td></tr>`).join("")}</tbody>
    </table>
  </div>

  <!-- APPENDIX -->
  <div class="section">
    <h2>Appendix: Historical Scan Data</h2>
    <table>
      <thead><tr><th>Scan ID</th><th>SSID</th><th>BSSID</th><th>Scan Start</th><th>Scan End</th><th>Risk Score</th></tr></thead>
      <tbody>${hist.map(h => `<tr><td>${h.scanId}</td><td>${h.ssid}</td><td>${h.bssid}</td><td>${h.start}</td><td>${h.end}</td><td>${h.risk}</td></tr>`).join("")}</tbody>
    </table>
  </div>

  ${nextStepsSection()}

</div>

<script src="https://cdn.plot.ly/plotly-2.32.0.min.js"><\/script>
<script>
// Clients per SSID
Plotly.newPlot("clients-per-ssid",[{x:${clientsPerSSID_X},y:${clientsPerSSID_Y},type:"bar",text:${clientsPerSSID_Y},textposition:"auto"}],{title:"Clients per SSID",yaxis:{title:"Number of clients"}});

// Risk % by SSID
Plotly.newPlot("risk-by-ssid",[{x:${riskBySSID_X},y:${riskBySSID_Y},type:"bar",text:${riskBySSID_Y}.map(v=>v+"%"),textposition:"auto",marker:{color:${riskBySSID_Colors}}}],{title:"Risk Percentage by SSID",yaxis:{title:"Risk score (%)"}});

// Findings by Severity
Plotly.newPlot("findings-by-severity",[{x:${sevLabels},y:${sevVulns},name:"Vulnerabilities",type:"bar"},{x:${sevLabels},y:${sevThreats},name:"Threats",type:"bar"},{x:${sevLabels},y:${sevTotals},name:"Total",type:"bar"}],{title:"Findings by Severity",barmode:"group",yaxis:{title:"Count"}});

// Risk Trend
Plotly.newPlot("risk-trend",[${trendTraces}],{title:"Risk Score Trend Over Time",xaxis:{title:"Scan date/time"},yaxis:{title:"Risk score"}});
<\/script>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// 2. PER-NETWORK REPORT
// ═══════════════════════════════════════════════════════════════
export function generatePerNetworkReportHTML(d) {
  const meta = d.meta || {};
  const net = d.network || {};
  const vulns = d.vulnerabilities || [];
  const threats = d.threats || [];
  const details = d.findingDetails || [];
  const recs = d.recommendations || {};
  const trend = d.riskTrend || [];
  const hist = d.historicalScans || [];

  const findingSevX = JSON.stringify([...new Set([...vulns, ...threats].map(f => f.severity))]);
  const findingSevY = JSON.stringify([...new Set([...vulns, ...threats].map(f => f.severity))].map(s => {
    return [...vulns, ...threats].filter(f => f.severity === s).length;
  }));

  const trendDates = JSON.stringify(trend.map(t => `${t.date} ${t.time}`));
  const trendScores = JSON.stringify(trend.map(t => t.score));

  const statusClass = (sev) => {
    const s = (sev || "").toLowerCase();
    if (s === "critical") return "status-critical";
    if (s === "high") return "status-high";
    if (s === "medium") return "status-medium";
    return "status-low";
  };

  const totalCritical = [...vulns, ...threats].filter(f => f.severity === "Critical").length;
  const totalHigh = [...vulns, ...threats].filter(f => f.severity === "High").length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Wi-Fi Security Report - ${net.ssid}</title>
<style>${sharedCSS}</style>
</head>
<body>
<div class="report-container">

  <!-- COVER -->
  <div class="cover-page">
    <h1>Wi‑Fi Security Report</h1>
    <div class="network-highlight">Network: ${net.ssid}</div>
    <div class="cover-meta">
      <p><strong>BSSID:</strong> ${net.bssid}</p>
      <p><strong>Date of issue:</strong> ${meta.dateOfIssue}</p>
      <p><strong>Prepared by:</strong> ${meta.preparedBy}</p>
      <p><strong>For:</strong> ${meta.forWhom}</p>
      <p><strong>Classification:</strong> ${meta.classification}</p>
      <p><strong>Last scan:</strong> ${meta.lastScan}</p>
    </div>
  </div>

  ${scopeSection()}
  ${scoringSection()}

  <!-- NETWORK SUMMARY -->
  <div class="section">
    <h2>Network Summary</h2>
    <div class="summary-grid">
      <div class="summary-card"><div class="card-label">SSID</div><div class="card-value">${net.ssid}</div></div>
      <div class="summary-card"><div class="card-label">BSSID</div><div class="card-value" style="font-size:1.2em;">${net.bssid}</div></div>
      <div class="summary-card"><div class="card-label">Channel</div><div class="card-value">${net.channel}</div></div>
      <div class="summary-card"><div class="card-label">Encryption</div><div class="card-value" style="font-size:1.3em;">${net.encryption}</div></div>
      <div class="summary-card"><div class="card-label">Clients (Approx.)</div><div class="card-value">${net.clients}</div></div>
      <div class="summary-card"><div class="card-label">Last Scan</div><div class="card-value" style="font-size:0.9em;">${net.lastScanDate}<br>${net.lastScanTime}</div></div>
      <div class="summary-card risk-gauge-large">
        <h3 style="margin:0 0 10px 0;font-size:1.3em;">Current Risk Score</h3>
        <div class="risk-gauge-circle">
          <div class="score">${d.riskScore}</div>
          <div class="label">${d.riskLabel}</div>
        </div>
        <p style="margin-top:15px;font-size:0.95em;">This network requires <strong>immediate attention</strong> within 0–30 days</p>
      </div>
    </div>
  </div>

  <!-- OBSERVED FINDINGS -->
  <div class="section">
    <h2>Observed Findings (Latest Scan)</h2>
    <p style="margin-bottom:20px;">During the latest scan on <strong>${net.lastScanDate}</strong>, the system detected the following vulnerabilities and threats for this network:</p>
    <h3>Vulnerabilities (Configuration Weaknesses)</h3>
    <table>
      <thead><tr><th>Finding ID</th><th>Name</th><th>Severity</th><th>CVSS</th><th>Presence</th></tr></thead>
      <tbody>${vulns.map(v => `<tr><td>${v.id}</td><td>${v.name}</td><td>${severityBadge(v.severity)}</td><td>${v.cvss}</td><td><span class="status-indicator ${statusClass(v.severity)}"></span>${v.presence}</td></tr>`).join("")}</tbody>
    </table>
    <h3>Threats (Active Attack Indicators)</h3>
    <table>
      <thead><tr><th>Finding ID</th><th>Name</th><th>Severity</th><th>CVSS</th><th>Occurrences</th></tr></thead>
      <tbody>${threats.map(t => `<tr><td>${t.id}</td><td>${t.name}</td><td>${severityBadge(t.severity)}</td><td>${t.cvss}</td><td>${t.occurrences}</td></tr>`).join("")}</tbody>
    </table>
    <div class="info-box warning">
      <p><strong>Summary:</strong> This network has <strong>${totalCritical} critical</strong> and <strong>${totalHigh} high</strong> severity findings. ${net.encryption === "Open" ? "The open encryption configuration exposes all client traffic to interception, and active attack indicators suggest ongoing threat activity." : "Active attack indicators suggest ongoing threat activity."}</p>
    </div>
    <div id="finding-severity-bar" style="width:100%;max-width:800px;height:300px;margin:20px auto 0;"></div>
  </div>

  <!-- FINDING DETAILS -->
  <div class="section">
    <h2>Finding Details and Impact</h2>
    ${details.map(fd => `
      <h3>${fd.id}: ${fd.title}</h3>
      <div class="info-box${fd.isThreat ? " warning" : ""}">
        <p><strong>Issue:</strong> ${fd.issue}</p>
        <p><strong>Impact:</strong> ${fd.impact}</p>
        <p><strong>Evidence:</strong> ${fd.evidence}</p>
      </div>
    `).join("")}
  </div>

  <!-- RECOMMENDATIONS -->
  <div class="section">
    <h2>Recommended Actions for This Network</h2>
    <p style="margin-bottom:20px;">These recommendations are generated from a predefined CVSS-based mapping table. They are rule-based and do not use AI.</p>
    <h3>Immediate Actions (0–30 days)</h3>
    <ul class="rec-list">${(recs.immediate || []).map(r => `<li class="priority-immediate"><strong>Immediate:</strong> ${r.text}<br><small style="color:#666;">Source: ${renderSourceLinks(r.ref, r.sourceUrls)} | Responsible: ${r.responsible}</small></li>`).join("")}</ul>
    <h3>Short-Term Actions (1–3 months)</h3>
    <ul class="rec-list">${(recs.shortTerm || []).map(r => `<li class="priority-short"><strong>Short term:</strong> ${r.text}<br><small style="color:#666;">Source: ${renderSourceLinks(r.ref, r.sourceUrls)} | Responsible: ${r.responsible}</small></li>`).join("")}</ul>
  </div>

  <!-- RISK TREND -->
  <div class="section">
    <h2>Risk Trend for This Network</h2>
    <p style="margin-bottom:20px;">The table and chart below show how the risk score for <strong>${net.ssid}</strong> changed over time based on past scans.</p>
    <table>
      <thead><tr><th>Scan Date</th><th>Scan Time</th><th>Risk Score</th><th>Risk Level</th></tr></thead>
      <tbody>${trend.map(t => `<tr><td>${t.date}</td><td>${t.time}</td><td>${t.score}</td><td>${severityBadge(t.level)}</td></tr>`).join("")}</tbody>
    </table>
    <div id="risk-trend-line" style="width:100%;max-width:800px;height:300px;margin:20px auto;"></div>
    <div class="info-box warning">
      <p><strong>Trend Analysis:</strong> Risk score increased from ${trend[0]?.score} to ${trend[trend.length - 1]?.score} over the assessment period, indicating security changes over time.</p>
    </div>
  </div>

  ${nextStepsSection()}

  <!-- APPENDIX -->
  <div class="section">
    <h2>Appendix: Historical Scan Data</h2>
    <table>
      <thead><tr><th>Scan ID</th><th>SSID</th><th>BSSID</th><th>Scan Start</th><th>Scan End</th><th>Risk Score</th></tr></thead>
      <tbody>${hist.map(h => `<tr><td>${h.scanId}</td><td>${h.ssid}</td><td>${h.bssid}</td><td>${h.start}</td><td>${h.end}</td><td>${h.risk}</td></tr>`).join("")}</tbody>
    </table>
  </div>

</div>

<script src="https://cdn.plot.ly/plotly-2.32.0.min.js"><\/script>
<script>
// Finding severity bar
Plotly.newPlot("finding-severity-bar",[{x:${findingSevX},y:${findingSevY},type:"bar",text:${findingSevY},textposition:"auto"}],{title:"Findings by Severity (This Network)",yaxis:{title:"Count"}});

// Risk trend line
Plotly.newPlot("risk-trend-line",[{x:${trendDates},y:${trendScores},mode:"lines+markers",name:"Risk Score"}],{title:"Risk Score Trend Over Time",xaxis:{title:"Scan date/time"},yaxis:{title:"Risk score"}});
<\/script>
</body></html>`;
}
