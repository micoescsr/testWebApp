# Dashboard Module — Phase 1 Changes

> **Branch:** `securityV2`  
> **Date:** March 5, 2026  
> **Status:** Phase 1 complete (live data, no mocks)

---

## Summary

Phase 1 replaces **all hard-coded / mock data** in the Dashboard with **real Supabase queries** routed through the Express backend. The NETWORK dropdown is now dynamic, a DATE dropdown allows viewing historical scans, and every stat card & chart is populated from live data.

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/services/dashboardService.js` | Core data layer — all Supabase queries for the dashboard. Summary path uses 7 parallel queries via `Promise.all`. Per-network path uses 6 parallel queries. Scan-scoped path supports date-filtered views. |
| `backend/controllers/dashboardController.js` | Express route handlers: `getSummary`, `getNetworks`, `getNetwork` (with optional `?scanId=`), `getScans`. |
| `backend/routes/dashboardRoutes.js` | Route definitions — all JWT-protected via `authJWT`. UUID params validated via `validateUUID`. Mounted at `/api/dashboard` in `server.js`. |

## Files Modified

| File | Changes |
|------|---------|
| `backend/server.js` | Added `require('./routes/dashboardRoutes')` import and `app.use('/api/dashboard', dashboardRoutes)` mount (2-line change). |
| `src/api/dashboardApi.js` | **Rewritten.** Changed `getDashboardForNetwork(ssid, params)` → `getDashboardForNetwork(networkId, scanId)`. Added `getNetworks()` and `getScansForNetwork(networkId)`. All use the shared `api` instance from `./axios` (auth interceptor). |
| `src/hooks/useDashboard.js` | **Rewritten.** Removed all 10 mock-data imports from `dashboardData.js`. State initialized as `null` (not mock objects). Added `networks`, `scanList`, `selectedScanId` state. Fetches network list on mount. Fetches summary or per-network data on `viewMode`/`selectedScanId` change. Uses `useCallback` for `handleSetViewMode` to reset scan state on network switch. Cancellation tokens prevent stale setState. |
| `src/components/dashboard/DashboardHeader.jsx` | NETWORK dropdown now renders dynamically from `networks` prop. DATE dropdown renders from `scanList` with "Latest" as default. Added `formatDate` helper. Accepts 4 new props: `networks`, `scanList`, `selectedScanId`, `onScanChange`. |
| `src/components/dashboard/SummarySection.jsx` | Removed inline `topRisks` (5 fake SSIDs) and `networkEncryptionData` arrays. Destructures 9 fields from `data` prop with safe defaults. Stat cards show live values. Empty-state guards on Top Risks table and Networks by Encryption pie chart. |
| `src/components/dashboard/NetworkSection.jsx` | Removed inline `kindSplitData` and `clientsRiskTrendData` arrays. Destructures 10 fields from `data` prop with safe defaults. Stat cards show live values. Empty-state guards on Threat vs Vulnerability donut, Clients vs Risk line chart, and Issues list. |
| `src/pages/Dashboard/Dashboard.jsx` | Destructures 4 new values from `useDashboard()` (`networks`, `scanList`, `selectedScanId`, `setSelectedScanId`) and passes them to `DashboardHeader`. |

---

## New API Endpoints

All routes are mounted under `/api/dashboard` and require a valid JWT (`Authorization: Bearer <token>`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dashboard/summary` | Aggregated data across all networks (risk gauge, severity chart, top-5 networks, encryption pie, stat cards). |
| `GET` | `/api/dashboard/networks` | List of all networks (`network_id`, `ssid`) for the NETWORK dropdown. |
| `GET` | `/api/dashboard/network/:networkId` | Per-network dashboard data (latest scan). Optional `?scanId=<uuid>` query param for date-filtered view. |
| `GET` | `/api/dashboard/network/:networkId/scans` | All COMPLETED scans for a network (for the DATE dropdown). |

### Response Shapes

**`GET /summary`**
```json
{
  "lastScan": "2026-03-05T12:00:00Z",
  "openNetworks": 3,
  "encryptedNetworks": 7,
  "totalFindings": 42,
  "totalClients": 120,
  "riskScoreData": [{ "name": "Wi-Fi Risk", "value": 65 }],
  "severityData": [
    { "severity": "Critical", "vulnerabilities": 2, "threats": 1 },
    { "severity": "High", "vulnerabilities": 5, "threats": 3 },
    { "severity": "Medium", "vulnerabilities": 8, "threats": 4 },
    { "severity": "Low", "vulnerabilities": 12, "threats": 7 }
  ],
  "topRisks": [
    { "ssid": "NetName", "risk": 80, "severityCount": 10, "clients": 22 }
  ],
  "networkEncryptionData": [
    { "name": "Open", "value": 3 },
    { "name": "Encrypted", "value": 7 }
  ]
}
```

**`GET /network/:networkId`**
```json
{
  "lastScan": "2026-03-05T12:00:00Z",
  "riskScoreData": [{ "name": "Wi-Fi Risk", "value": 78 }],
  "encryptionStatus": "Open",
  "numClients": 15,
  "totalVulns": 5,
  "totalThreats": 2,
  "kindSplitData": [
    { "name": "THREAT", "value": 2 },
    { "name": "VULNERABILITY", "value": 5 }
  ],
  "severityData": [
    { "severity": "Critical", "vulnerabilities": 1, "threats": 0 },
    { "severity": "High", "vulnerabilities": 2, "threats": 1 },
    { "severity": "Medium", "vulnerabilities": 1, "threats": 1 },
    { "severity": "Low", "vulnerabilities": 1, "threats": 0 }
  ],
  "commonVulnsData": [
    { "name": "Evil Twin AP", "severity": "High", "vt_cvss_base_score": 8.1 }
  ],
  "clientsRiskTrendData": [
    { "scan": "Mar 1", "clients": 15, "risk": 70 },
    { "scan": "Mar 5", "clients": 15, "risk": 78 }
  ],
  "scanList": [
    { "scan_id": "uuid", "finished_at": "2026-03-05T12:00:00Z" }
  ]
}
```

---

## Database Dependencies

The backend service layer queries the following **Postgres views** (must exist in Supabase):

| View | Purpose |
|------|---------|
| `latest_scan_per_network` | One row per network: the latest COMPLETED `vulnerability_scan` with its `risk_score` and `finished_at`. Used for summary risk gauge and per-network latest-scan info. |
| `latest_scan_findings` | Findings (from `vulnerabilities_threat` + `vulnerability_threat_details`) joined through both scan tables. Used for severity charts, kind splits, and top-5 issues. |

### Tables Queried Directly

- `networks` — dropdown list, encryption counts, client counts, risk scores
- `vulnerability_scans` — scan history, date dropdown, scan-scoped filtering
- `scans` — legacy scan table (bridged via views for `vulnerabilities_threat` join)
- `vulnerabilities_threat` — finding rows (scan-scoped path)
- `vulnerability_threat_details` — severity ratings, CVSS scores, kind classification

---

## Bug Fix: 404 on All Dashboard Endpoints

### Symptom
Navigating to the Dashboard page showed "Request failed with status code 404" for all API calls.

### Root Cause
In `backend/routes/dashboardRoutes.js`, the `validateUUID` middleware was imported **without destructuring**:

```js
// ❌ BUG: imports the module object { validateUUID: fn }, not the function
const validateUUID = require("../middleware/validateUUID");
```

The middleware file exports a named property:
```js
module.exports = { validateUUID };
```

When Express tried to register routes calling `validateUUID("networkId")`, it called the plain object as a function, throwing `TypeError: validateUUID is not a function`. This crashed the module load, preventing **all** dashboard routes from being registered — resulting in 404 for every `/api/dashboard/*` request.

### Fix
```js
// ✅ FIX: destructure the named export
const { validateUUID } = require("../middleware/validateUUID");
```

This matches the pattern used by all other route files (`rasPiRoutes.js`, `userRoutes.js`).

### Action Required
**Restart the backend server** after this fix:
```bash
cd backend
node server.js
```

---

## What Changed Per Component

### DashboardHeader
- **NETWORK dropdown**: Was hardcoded `<option>Nacho_WiFi</option>`. Now renders from `networks` array prop.
- **DATE dropdown**: Was hardcoded `<option>Nov 14, 2025</option>`. Now renders from `scanList` array prop with "Latest" as the default. Selecting a date triggers a re-fetch scoped to that scan.
- **Device Status**: Still hardcoded "Online ●" (scheduled for Phase 4).

### SummarySection (stat cards)
| Card | Before | After |
|------|--------|-------|
| Last Scan | `11/14/2025` | `formatDate(lastScan)` from API |
| Open Networks | `14` | `openNetworks` from API |
| Encrypted Networks | `12` | `encryptedNetworks` from API |
| Total Vulns/Threats | `52` | `totalFindings` from API |
| Total Clients | `120` | `totalClients` from API |

### SummarySection (charts)
| Chart | Before | After |
|-------|--------|-------|
| Risk Gauge | Mock `riskScoreData` from `dashboardData.js` | Avg `risk_score` from `latest_scan_per_network` view |
| Severity by Kind | Mock `severityData` from `dashboardData.js` | Grouped from `latest_scan_findings` (all 4 severity levels always present) |
| Top 5 Networks | 5 hardcoded fake SSIDs | Top 5 by `networks.risk_score` with real severity count and client count |
| Encryption Pie | Hardcoded `[{Open: 14}, {Encrypted: 12}]` | Count from `networks.encryption_status` |

### NetworkSection (stat cards)
| Card | Before | After |
|------|--------|-------|
| Last Scan | `11/14/2025` | `formatDate(lastScan)` from API |
| Network Encryption | `OPEN` | `encryptionStatus` from API |
| Scanned Vulnerabilities | `5` | `totalVulns` from API |
| Detected Threats | `2` | `totalThreats` from API |
| Connected Clients | `12` | `numClients` from API |

### NetworkSection (charts)
| Chart | Before | After |
|-------|--------|-------|
| Threat vs Vulnerability | Hardcoded `[{THREAT: 2}, {VULN: 3}]` | From `vt_kind` grouping of findings |
| Clients vs Risk Trend | Hardcoded 4-point array | All COMPLETED `vulnerability_scans` for the network |
| Issues List | Mock `commonVulnsData` from `dashboardData.js` | Top 5 by `vt_cvss_base_score` from findings |

---

## Post-Phase 1 Fixes

### Fix 1: Top 5 High-Risk Networks Table — Column Alignment

**Symptom:** The header row (SSID, RISK %, SEVERITIES, CLIENTS) and data rows were misaligned because columns had no fixed widths.

**Root Cause:** `.top-row` used `display: flex; justify-content: space-between` — each `<span>` took only its content width, so columns shifted depending on text length.

**Fix (Dashboard.css):**
- Changed `.top-row` from `display: flex` to `display: grid` with `grid-template-columns: 2fr 1fr 1fr 1fr`
- Added `text-align: right` for all numeric columns (2nd, 3rd, 4th)
- Increased row padding from `4px 0` to `6px 0` for better readability

### Fix 2: Total Clients Mismatch Clarification

**Symptom:** The "Total Clients" stat card showed a number that didn't match the sum of the CLIENTS column in the Top 5 table.

**Explanation:** This is **expected behavior** — the stat card sums `num_clients` across **all** networks in the database, while the table only shows the 5 highest-risk networks. If there are more than 5 networks, the table sum will always be less than the stat card total.

**Fix (SummarySection.jsx):**
- Renamed stat card label from `"Total Clients"` to `"Total Clients (All Networks)"` to make the scope explicit
- Added an **"All Networks" footer row** to the Top 5 table showing total severities and total clients across all networks, so users can see the full picture without confusion

**Files changed:**
| File | Change |
|------|--------|
| `src/pages/Dashboard/Dashboard.css` | `.top-row`: flex → CSS grid; added `.top-foot` class; right-aligned numeric columns |
| `src/components/dashboard/SummarySection.jsx` | Renamed stat card label; added "All Networks" total footer row to Top 5 table |

---

## Remaining Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Live data, dropdowns, no mocks | ✅ Complete |
| 2 | Parallelize remaining sequential queries + error handling | Not started |
| 3 | Session guard (`ProtectedRoute` component) | Not started |
| 4 | Device status integration (replace hardcoded "Online ●") | Not started |
| 5 | Architecture cleanup (delete legacy `Dashboard.jsx`, extract `getRiskLabel`, remove dead exports) | Not started |
| 6 | Resilience & failure simulation (null/empty/edge cases) | Not started |
| 7 | Test generation (unit, hook, route guard, edge case) | Not started |
