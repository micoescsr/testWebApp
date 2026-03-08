# Dashboard Module — Phase 1 Changes

> **Branch:** `securityV2`  
> **Date:** March 5, 2026  
> **Last Updated:** March 8, 2026  
> **Status:** Phase 1 complete (live data, no mocks)

---

## Recent Updates (March 7, 2026)

### Fixed: Corrupted Unicode Characters (Mojibake)

Several UI elements displayed garbled text due to UTF-8 encoding corruption:

| Component | Before | After | Element |
|-----------|--------|-------|---------|
| `SummarySection.jsx` | `ΓÇö` | `—` (em dash) | Date fallback text |
| `SummarySection.jsx` | `ΓåÉ` / `ΓåÆ` | `▼` / `▶` | Legend toggle button |
| `NetworkSection.jsx` | `ΓÇö` | `—` (em dash) | Date + encryption fallback |
| `NetworkSection.jsx` | `ΓåÉ` / `ΓåÆ` | `▼` / `▶` | Legend toggle button |
| `DashboardHeader.jsx` | `ΓùÅ` | `✓` | Device online status icon |

**Files changed:**
- `src/components/dashboard/SummarySection.jsx`
- `src/components/dashboard/NetworkSection.jsx`
- `src/components/dashboard/DashboardHeader.jsx`

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

The backend service layer queries the following **Postgres views** (defined in `docs/metrics_views.sql` — must exist in Supabase):

| View | Purpose |
|------|---------|
| `latest_scan_per_network` | One row per network: the **most recent legacy `scans` row** (by `scan_end`) with its `risk_score` and `finished_at`. Used for the summary risk gauge, per-network last-scan date, and per-network risk score. |
| `latest_scan_findings` | Findings joined from `vulnerabilities_threat` (deduplicated to latest per `scan_id`/`vt_detail_id`) through the legacy `scans` table, enriched with `vulnerability_threat_details` metadata and `networks` info. Used for severity charts, kind-split donut, top-issues list, and encryption counts. |

> **Important:** Both views are built on the **legacy `scans` table** (bigint PK, `scan_end` timestamp, `risk_score`) as the canonical source — **not** `vulnerability_scans`. The `scans` table is the authoritative scan record; `vulnerability_scans` is no longer used by these views.

### Views — Definition Summary

#### `latest_scan_per_network`
```sql
-- Uses DISTINCT ON (network_id) ordered by scans.scan_end DESC
-- Columns: network_id, scan_id, finished_at (= scan_end), risk_score (COALESCE 0)
CREATE OR REPLACE VIEW public.latest_scan_per_network AS
WITH latest_scans AS (
  SELECT DISTINCT ON (network_id)
    scan_id, network_id,
    scan_end AS finished_at, risk_score
  FROM public.scans
  WHERE scan_end IS NOT NULL
  ORDER BY network_id, scan_end DESC
)
SELECT ls.network_id, ls.scan_id, ls.finished_at,
       COALESCE(ls.risk_score, 0) AS risk_score
FROM latest_scans ls;
```

#### `latest_scan_findings`
```sql
-- 1. latest_legacy_scan CTE: DISTINCT ON (network_id) from scans ordered by scan_end DESC
-- 2. deduplicated CTE: DISTINCT ON (scan_id, vt_detail_id) from vulnerabilities_threat ordered by created_at DESC
-- 3. Joins: latest_legacy_scan → deduplicated → vulnerability_threat_details → networks → scans (LEFT)
-- Columns: network_id, risk_score, ssid, encryption_status, num_clients,
--          vt_detail_id, vt_name, vt_kind, vt_severity_rating, vt_cvss_base_score, occurrence_count
```

### Tables Queried Directly

| Table | Used for |
|-------|----------|
| `scans` | Scan history (legacy PK: bigint), `scan_end` timestamps, `risk_score`, clients-vs-risk trend |
| `networks` | Dropdown list, encryption status counts, client counts, risk scores |
| `vulnerabilities_threat` | Finding rows (deduplicated via `latest_scan_findings` view) |
| `vulnerability_threat_details` | Severity ratings, CVSS scores, kind classification (`THREAT` / `VULNERABILITY`) |

> `vulnerability_scans` is **no longer queried** by the dashboard service layer. All scan-scoped lookups go through the `scans` table.

### Per-Network Queries (parameterised by `network_id`)

| # | Purpose | Query source |
|---|---------|-------------|
| 1 | Last scan date | `SELECT finished_at FROM latest_scan_per_network WHERE network_id = $1` |
| 2 | Current risk score | `SELECT risk_score FROM latest_scan_per_network WHERE network_id = $1` |
| 3 | Network encryption | `SELECT encryption_status FROM networks WHERE network_id = $1` |
| 4 | Connected clients | `SELECT num_clients FROM networks WHERE network_id = $1` |
| 5 | Total vulnerabilities | `COUNT(DISTINCT vt_detail_id) FROM latest_scan_findings WHERE network_id = $1 AND vt_kind = 'VULNERABILITY'` |
| 6 | Total threats | `COUNT(DISTINCT vt_detail_id) FROM latest_scan_findings WHERE network_id = $1 AND vt_kind = 'THREAT'` |
| 7 | Threat vs Vuln donut | `GROUP BY vt_kind` on `latest_scan_findings` |
| 8 | Severity distribution | `GROUP BY vt_severity_rating, vt_kind` on `latest_scan_findings` |
| 9 | Top high-risk issues | `ORDER BY vt_cvss_base_score DESC LIMIT 5` on `latest_scan_findings` |
| 10 | Clients vs risk trend | `scans JOIN networks` ordered by `scan_end` (all completed scans for the network) |

### Summary Queries (no network filter)

| # | Purpose | Query source |
|---|---------|-------------|
| 11 | Global last scan | `SELECT MAX(scan_end) FROM scans` |
| 12 | Open networks | `COUNT(*) FROM networks WHERE encryption_status = 'Open'` |
| 13 | Encrypted networks | `COUNT(*) FROM networks WHERE encryption_status != 'Open'` |
| 14 | Total findings | `COUNT(DISTINCT vt_detail_id) FROM latest_scan_findings` |
| 15 | Total clients | `SUM(num_clients) FROM networks` |
| 16 | Global avg risk score | `ROUND(AVG(risk_score)) FROM latest_scan_per_network` |
| 17 | Severity by kind (global) | `GROUP BY vt_severity_rating, vt_kind` on `latest_scan_findings` |
| 18 | Top 5 high-risk networks | `latest_scan_per_network JOIN networks LEFT JOIN latest_scan_findings GROUP BY … ORDER BY risk_score DESC LIMIT 5` |

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

**Root Cause:** `.top-row` used `display: flex` — each `<span>` took only its content width, so columns shifted depending on text length. The `col-ssid`, `col-risk`, `col-sev`, and `col-clients` classes were defined in `Dashboard.css` but never applied to the `<span>` elements in `SummarySection.jsx`.

**Fix:**

*`src/pages/Dashboard/Dashboard.css`:*
- Changed `.top-row` from `display: flex` to `display: grid` with `grid-template-columns: 2fr 1fr 1fr 1fr`
- Removed `flex` properties from `.col-ssid`, `.col-risk`, `.col-sev`, `.col-clients` (no longer needed with grid)
- Increased row padding from `4px 0` to `6px 0` for better readability
- Added `.top-foot` class (border-top, padding-top, margin-top) for the "All Networks" footer row

*`src/components/dashboard/SummarySection.jsx`:*
- Added `className="col-ssid"` to the SSID `<span>` in the header, data rows, and footer row
- Added `className="col-risk"` (+ `score-link` on data rows) to the RISK % column
- Added `className="col-sev"` to the SEVERITIES column
- Added `className="col-clients"` to the CLIENTS column

**Result:** All four columns — header, data rows, and footer — are now perfectly aligned using CSS grid. Numeric columns (RISK %, SEVERITIES, CLIENTS) are right-aligned; SSID is left-aligned and takes twice the width.

### Fix 2: Total Clients Mismatch Clarification

**Symptom:** The "Total Clients" stat card showed a number that didn't match the sum of the CLIENTS column in the Top 5 table.

**Explanation:** This is **expected behavior** — the stat card sums `num_clients` across **all** networks in the database, while the table only shows the 5 highest-risk networks. If there are more than 5 networks, the table sum will always be less than the stat card total.

**Fix (SummarySection.jsx):**
- Renamed stat card label from `"Total Clients"` to `"Total Clients (All Networks)"` to make the scope explicit
- Added an **"All Networks" footer row** to the Top 5 table showing total severities and total clients across all networks, so users can see the full picture without confusion

**Files changed:**
| File | Change |
|------|--------|
| `src/pages/Dashboard/Dashboard.css` | `.top-row`: `display: flex` → `display: grid` (`grid-template-columns: 2fr 1fr 1fr 1fr`); padding `4px 0` → `6px 0`; removed `flex` from column classes; added `.top-foot` class |
| `src/components/dashboard/SummarySection.jsx` | Added `col-ssid`, `col-risk`, `col-sev`, `col-clients` classes to all `<span>` elements in header, data rows, and footer; renamed stat card label; added "All Networks" total footer row |

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
