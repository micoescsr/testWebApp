# PDF Export Feature — SAM Page

> **Status:** Mock-data implementation ✅ — Live-data integration pending  
> **Branch:** `security`  
> **Date implemented:** March 6, 2026  
> **Last updated:** March 6, 2026

---

## Table of Contents

1. [Overview](#overview)  
2. [Report Types](#report-types)  
3. [Architecture](#architecture)  
4. [Files Created](#files-created)  
5. [Files Modified](#files-modified)  
6. [Mock Data Structure](#mock-data-structure)  
7. [How It Works](#how-it-works)  
8. [How to Test](#how-to-test)  
9. [Known Limitations](#known-limitations)  
10. [TODO — Live Data Integration](#todo--live-data-integration)  
11. [Change Log](#change-log)

---

## Overview

The PDF Export feature allows users to generate professional PDF reports directly from the **SAM (Security Assessment Management)** page. Users can export two types of reports — an **Overall Summary Report** across all scanned networks, or a **Per-Network Report** for a specific network's findings.

Reports are generated as **self-contained HTML documents** (with inline CSS and Plotly charts loaded via CDN), opened in a new browser tab, and the browser's **Print → Save as PDF** dialog is triggered automatically.

Currently the reports use **hardcoded mock data**. The next phase will wire them to real API endpoints.

---

## Report Types

### 1. Summary Report (Overall Network Assessment)

A high-level overview of **all networks** scanned during the assessment window.

**Sections included:**
- Cover page with metadata (version, date, prepared by, classification)
- Executive Summary (overall risk score, critical/high findings count, clients at risk, key business impacts, top 5 actions)
- Scope — table of all networks (SSID, BSSID, channel, encryption, clients, risk %, risk label, findings count)
- Severity Breakdown table (Critical / High / Medium / Low × Vulnerabilities / Threats)
- Detailed Findings grouped by category:
  - Open & Weak Crypto
  - Misconfigurations
  - Active Threats
- Risk Trend over time (line chart per network)
- Remediation Roadmap (quick wins, medium-term, detailed mapping table)
- Historical Scans table
- Scoring Methodology
- Next Steps

**Charts (Plotly):**
1. Clients per SSID (horizontal bar)
2. Risk % by SSID (horizontal bar)
3. Findings by Severity (donut)
4. Risk Trend (multi-line)

### 2. Per-Network Report (Single Network Assessment)

A deep dive into a **single network's** vulnerabilities and threats.

**Sections included:**
- Cover page with network-specific metadata
- Network Summary card (SSID, BSSID, channel, encryption, clients, risk score gauge)
- Vulnerabilities table (ID, name, severity, CVSS, presence)
- Threats table (ID, name, severity, CVSS, occurrences)
- Detailed Findings (one card per finding with issue, impact, evidence)
- Recommendations (immediate actions + short-term actions, each with NIST reference & responsible party)
- Risk Trend line chart
- Historical Scans table
- Scoring Methodology
- Next Steps

**Charts (Plotly):**
1. Findings by Severity (bar chart)
2. Risk Trend (line chart)

---

## Architecture

```
User clicks "📎 Export"
        │
        ▼
  ExportDropdown.jsx
  ┌─────────────────────┐
  │  Summary Report     │──▶ generateOverallReportHTML(overallMockData)
  │  Per-Network Report │──▶ generatePerNetworkReportHTML(perNetworkMockData)
  └─────────────────────┘
        │
        ▼
  exportReport(htmlString)
  ┌──────────────────────────────────┐
  │  window.open("", "_blank")       │
  │  document.write(html)            │
  │  setTimeout(1500ms)              │
  │  window.print()  → Save as PDF  │
  └──────────────────────────────────┘
```

### Key design decisions
- **No server-side PDF generation** — keeps the implementation simple and dependency-free.
- **Plotly CDN** (`https://cdn.plot.ly/plotly-2.32.0.min.js`) — loaded in the HTML for charts. A 1.5-second timeout before `print()` allows Plotly to fetch the library and render.
- **Self-contained HTML** — each report is a complete `<!DOCTYPE html>` document with inline `<style>` and `<script>`. No external CSS files needed.
- **Print-optimized CSS** — `@media print` rules hide headers/footers and force page breaks.

---

## Files Created

### 1. `src/data/mockReportData.js`

| Export | Description |
|---|---|
| `overallMockData` | Data object for the Summary Report |
| `perNetworkMockData` | Data object for the Per-Network Report |

**Mock networks:** Nacho_WiFi, Kerbs_FreeWiFi, StarboxFreeWiFi, JubileeFreeWiFi, ManamFreeWiFi  
**Mock findings:** WFVT-002 through WFVT-007  
**Lines:** ~192

### 2. `src/utils/reportTemplates.js`

| Export | Description |
|---|---|
| `generateOverallReportHTML(data)` | Returns a complete HTML string for the Summary Report |
| `generatePerNetworkReportHTML(data)` | Returns a complete HTML string for the Per-Network Report |

Also contains:
- `sharedCSS` — common print-ready styles used by both templates
- Helper functions: `severityBadge()`, `riskBands()`, `scopeSection()`, `scoringSection()`, `nextStepsSection()`
- Inline `<script>` blocks that call `Plotly.newPlot()` for each chart

**Lines:** ~500+

### 3. `src/utils/exportReport.js`

| Export | Description |
|---|---|
| `exportReport(htmlString)` | Opens a new tab, writes the HTML, waits 1.5s for Plotly, then triggers `window.print()` |

Handles pop-up blocker detection with an `alert()` fallback.  
**Lines:** ~27

### 4. `src/components/sam/ExportDropdown.jsx`

Dropdown button component with two options:
- **📊 Summary Report** — calls `generateOverallReportHTML(overallMockData)` → `exportReport()`
- **📡 Per-Network Report** — calls `generatePerNetworkReportHTML(perNetworkMockData)` → `exportReport()`

Features:
- Click-outside-to-close (via `useRef` + `useEffect` mousedown listener)
- Dropdown menu appears **above** the button
- Animated open/close transition

**Lines:** ~85

### 5. `src/components/sam/ExportDropdown.css`

Styling for the dropdown wrapper, menu, and items. Uses `bottom: calc(100% + 6px)` to position the menu above the trigger button. Includes a subtle slide-down animation.

**Lines:** ~75

---

## Files Modified

### 1. `src/components/sam/VulnerabilitiesTable.jsx`

| Change | Detail |
|---|---|
| Added import | `import ExportDropdown from "./ExportDropdown"` |
| Replaced element | Static `<button className="export-btn">📎 Export</button>` → `<ExportDropdown />` |

### 2. `src/components/sam/ThreatsTable.jsx`

| Change | Detail |
|---|---|
| Added import | `import ExportDropdown from "./ExportDropdown"` |
| Added section | New `<div className="sam-actions"><ExportDropdown /></div>` after the `<Pagination>` component |

### 3. `src/components/sam/ThreatDetail.jsx`

| Change | Detail |
|---|---|
| Added imports | `perNetworkMockData` from `mockReportData.js`, `generatePerNetworkReportHTML` from `reportTemplates.js`, `exportReport` from `exportReport.js` |
| Added handler | `handleExport()` function that generates a Per-Network report for the current threat's network |
| Wired button | Existing Export button now has `onClick={handleExport}` |

---

## Mock Data Structure

### `overallMockData` shape

```
{
  meta: { version, dateOfIssue, preparedBy, reviewedBy, classification, assessmentWindow }
  executiveSummary: { overallRiskScore, riskLabel, criticalFindings, highFindings, totalClientsAtRisk, keyBusinessImpacts[], top5Actions[] }
  networks: [ { ssid, bssid, channel, encryption, clients, riskPercent, riskLabel, findings } ]
  severityBreakdown: [ { severity, vulnerabilities, threats, total } ]
  detailedFindings: {
    openAndWeakCrypto: [ { network, finding, kind, severity, cvss } ]
    misconfigurations: [ { network, finding, kind, severity, cvss } ]
    activeThreats: [ { network, finding, kind, severity, cvss, occurrences } ]
  }
  riskTrend: { "SSID": [ { date, score } ] }
  remediation: {
    quickWins: [ string ]
    mediumTerm: [ string ]
    detailedMapping: [ { finding, action, priority, responsible } ]
  }
  historicalScans: [ { scanId, ssid, bssid, start, end, risk } ]
}
```

### `perNetworkMockData` shape

```
{
  meta: { dateOfIssue, preparedBy, forWhom, classification, lastScan }
  network: { ssid, bssid, channel, encryption, clients, lastScanDate, lastScanTime }
  riskScore: number
  riskLabel: string
  vulnerabilities: [ { id, name, severity, cvss, presence } ]
  threats: [ { id, name, severity, cvss, occurrences } ]
  findingDetails: [ { id, title, issue, impact, evidence, isThreat? } ]
  recommendations: {
    immediate: [ { text, ref, responsible } ]
    shortTerm: [ { text, ref, responsible } ]
  }
  riskTrend: [ { date, time, score, level } ]
  historicalScans: [ { scanId, ssid, bssid, start, end, risk } ]
}
```

---

## How It Works

1. User navigates to the **SAM** page (Vulnerabilities tab, Threats tab, or Threat Detail view).
2. Clicks the **📎 Export** button.
3. A dropdown appears with two choices: **Summary Report** or **Per-Network Report**.
4. On selection:
   - The corresponding mock data object is passed to the template generator function.
   - A full HTML string is returned (with inline CSS + Plotly chart scripts).
   - `exportReport()` opens a new browser tab, writes the HTML, and waits 1.5 seconds.
   - After the timeout (allowing Plotly to load from CDN and render charts), `window.print()` is called.
5. The browser's print dialog opens — user selects **Save as PDF** as the destination.

---

## How to Test

1. Start the dev server (`npm run dev`).
2. Navigate to the **SAM** page.
3. On the **Vulnerabilities** tab or **Threats** tab, click the **📎 Export** button.
4. Select either **Summary Report** or **Per-Network Report**.
5. A new tab should open with the rendered HTML report.
6. The print dialog should appear automatically after ~1.5 seconds.
7. Choose **Save as PDF** and verify the output.

**For ThreatDetail:** Click into any threat's detail view and use the Export button there — it will generate a Per-Network report.

> ⚠️ **Pop-ups must be allowed** for the export site. If blocked, an alert will notify the user.

---

## Known Limitations

| # | Limitation | Notes |
|---|---|---|
| 1 | **Mock data only** | All data is hardcoded. No real API calls yet. |
| 2 | **Pop-up dependent** | Requires browser to allow pop-ups for `window.open()`. |
| 3 | **Plotly CDN dependency** | Charts require internet access to load Plotly from CDN. |
| 4 | **1.5s timeout** | The delay before `print()` is a heuristic; slow connections may need more time. |
| 5 | **Per-Network always shows Nacho_WiFi** | The mock data defaults to one network. Live version should use the currently selected/viewed network. |
| 6 | **No landscape option** | Print CSS is set for portrait. Some wide tables may truncate on very narrow paper. |

---

## TODO — Live Data Integration

When ready to switch from mock data to real data, follow these steps:

### Step 1: Identify existing API endpoints

The dashboard already has endpoints that return most of the data needed:

| Data needed | Existing endpoint / service function | Notes |
|---|---|---|
| Overall summary (risk score, findings count) | `GET /api/dashboard/summary` → `dashboardService.getDashboardSummary()` | May need additional fields |
| Network list with risk scores | `GET /api/dashboard/summary` → `networks` array | Already returns per-network risk |
| Per-network detail | `GET /api/dashboard/network/:networkId` → `dashboardService.getDashboardForNetwork()` | Returns vuln + threat breakdown |
| Severity breakdown | Derivable from summary data | Compute from findings arrays |
| Risk trend | May need new endpoint or extend dashboard | Historical risk scores per network over time |
| Remediation mapping | Static or from a new table | Currently hardcoded recommendations |

### Step 2: Create a report data adapter

Create `src/utils/reportDataAdapter.js` with two functions:

```js
// Transform real API responses into the shape expected by report templates

export async function buildOverallReportData() {
  // 1. Call getDashboardSummary()
  // 2. Map response to overallMockData shape
  // 3. Return the data object
}

export async function buildPerNetworkReportData(networkId) {
  // 1. Call getDashboardForNetwork(networkId)
  // 2. Map response to perNetworkMockData shape
  // 3. Return the data object
}
```

### Step 3: Update ExportDropdown.jsx

Replace mock data imports with async adapter calls:

```jsx
// Before (mock):
import { overallMockData, perNetworkMockData } from "../../data/mockReportData";

// After (live):
import { buildOverallReportData, buildPerNetworkReportData } from "../../utils/reportDataAdapter";

const handleExportSummary = async () => {
  setOpen(false);
  const data = await buildOverallReportData();
  const html = generateOverallReportHTML(data);
  exportReport(html);
};
```

### Step 4: Update ThreatDetail.jsx

Pass the actual `networkId` from the current threat:

```jsx
const handleExport = async () => {
  const data = await buildPerNetworkReportData(threat.network_id);
  const html = generatePerNetworkReportHTML(data);
  exportReport(html);
};
```

### Step 5: Handle new data fields

If the API doesn't return all fields (e.g., `historicalScans`, `riskTrend`), either:
- **Extend the API** with new endpoints/queries.
- **Omit those sections** from the report template with conditional rendering.
- **Use sensible defaults** (e.g., show "No historical data available").

### Step 6: Remove mock data

Once live data is confirmed working, delete `src/data/mockReportData.js`.

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-06 | Capstone Team | Initial mock-data implementation — 5 new files, 3 modified files |
| | | _Next: Live data integration_ |
