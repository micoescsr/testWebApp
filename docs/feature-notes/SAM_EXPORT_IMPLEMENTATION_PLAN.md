# SAM Export — Wire Mock PDF Export to Live Data

## Context

SAM page (`src/pages/SAM/SAM.jsx`) has an `ExportDropdown` (rendered in `VulnerabilitiesTable.jsx` and `ThreatsTable.jsx`) with two options: "Summary Report" and "Per-Network Report". Both are fully built — HTML+Plotly templates (`src/utils/reportTemplates.js`), a working PDF mechanism (`exportReport.js` opens a tab, writes HTML, calls `window.print()` → user saves as PDF) — but both currently render **hardcoded mock data** (`src/data/mockReportData.js`). No backend export endpoint exists; this is a frontend-only feature. `docs/feature-notes/EXPORT_README.md` already documents this gap and proposes the exact integration path below (confirmed correct against current code).

Goal: replace mock data with live data pulled from existing dashboard endpoints, so clicking Export produces a real PDF of actual scan results.

## What already exists and will be reused

- `GET /api/dashboard/summary` → `dashboardService.getSummaryData()` — avg risk, severity breakdown, top-5 networks by risk, encryption pie, totals.
- `GET /api/dashboard/network/:networkId` → `dashboardService.getNetworkDashboard()` — per-network risk, vuln/threat counts, severity breakdown, top findings by CVSS, **clientsRiskTrendData** (already has risk-trend history per network), `scanList`.
- `useNetworkContext()` (`src/context/NetworkContext.jsx`) already tracks the in-memory `networkId`/`scanId` of whatever network was last scanned/selected on the SAM page (`SAM.jsx:282` calls `setNetworkScan`) — this is the natural source for "which network" the Per-Network report should target, no new UI needed.
- `generateOverallReportHTML(data)` / `generatePerNetworkReportHTML(data)` in `reportTemplates.js` — keep these, just feed real data shaped to match.
- `exportReport(html)` — keep as-is, it's a working print-to-PDF mechanism, not a mock.

## Report content (mockup-verified — do not change shape)

### Summary Report (`generateOverallReportHTML`)
1. Cover page — version, date, prepared by, reviewed by, classification, assessment window
2. Scope and Limitations (static text — passive scan disclaimer)
3. Executive Summary — overall risk score/label, critical+high counts, clients at risk, key business impacts list, top-5 actions list, risk gauge
4. Scoring and Recommendation Model (static text — CVSS-based, rule-based, no AI)
5. Environment Overview — clients-per-SSID chart, detected networks table (ssid/bssid/channel/encryption/clients), highest-risk/most-clients/safest callouts
6. Risk Distribution — findings-by-severity chart, vuln-vs-threat table per severity
7. Network Risk Scores — per-SSID risk%/label/findings/clients table, risk-trend chart, risk-by-SSID chart
8. Detailed Findings — 3 fixed subsections: 4.1 Open Networks & Weak Crypto, 4.2 Wireless Misconfigurations, 4.3 Active Threat Indicators
9. Remediation Plan — quick wins list, medium-term list, detailed finding→action→priority→responsible mapping table
10. Appendix: Historical Scan Data — scanId/ssid/bssid/start/end/risk table
11. Next Steps (static text — admin steps, ITSO steps)

### Per-Network Report (`generatePerNetworkReportHTML`)
1. Cover page — network name, bssid, date, prepared by, for whom, classification, last scan
2. Scope and Limitations (same static text)
3. Scoring and Recommendation Model (same static text)
4. Network Summary — ssid/bssid/channel/encryption/clients/last-scan cards + risk gauge
5. Observed Findings — vulnerabilities table, threats table, severity-bar chart, critical/high summary callout
6. Finding Details and Impact — per finding: issue/impact/evidence narrative block
7. Recommended Actions — immediate list + short-term list (text/NIST ref/responsible)
8. Risk Trend — table + line chart + trend-analysis callout
9. Next Steps (static, same as summary report)
10. Appendix: Historical Scan Data — same shape as summary report's

## Gaps to fill

1. **Full network list for the summary report.** `getSummaryData()`'s `topRisks` is sliced to top 5; the summary report's `networks[]` table needs *all* networks (ssid, bssid, channel, encryption, clients, riskPercent, riskLabel). `networks` table already has `bssid`/`channel` columns (confirmed via `historyController.js` usage). Add this as a new field on the existing summary response rather than a new endpoint — extend `getSummaryData()` to also return `allNetworks` (same join logic as `topRisks`, minus the `.slice(0, 5)`).
2. **Detailed findings categorization.** Report template (professor-verified mockup) has 3 **fixed** subsections — do not collapse these. `vulnerability_threat_details` (catalog table, keyed by `vt_code`, see `backend/THREATS.md`) has no `category` column, but the code catalog is small and stable (WFVT-001 Lack of Encryption, WFVT-002 WPS Enabled, WFVT-003 Weak Encryption WEP/TKIP, WFVT-005 PMF Disabled = vulnerabilities; WFVT-006 Evil Twin, WFVT-007 MAC Spoofing, WFVT-008 Deauthentication = threats). Add a static `CODE_CATEGORY` map in the adapter: `{ "WFVT-001": "openAndWeakCrypto", "WFVT-003": "openAndWeakCrypto", "WFVT-002": "misconfigurations", "WFVT-005": "misconfigurations" }`; anything with `vt_kind === "THREAT"` always goes to `activeThreats` regardless of code. Bucket findings from `latest_scan_findings` (need `vt_code` added to that view/query — currently dashboardService only selects `vt_detail_id`, not the code; confirm `vt_code` is selectable or join through `vulnerability_threat_details`).
3. **Narrative/admin metadata** (`preparedBy`, `reviewedBy`, `classification`, `keyBusinessImpacts`, `top5Actions`, `remediation.detailedMapping`) — not stored anywhere. Use sensible computed/static defaults: `preparedBy` = logged-in user's name (from auth context), `dateOfIssue` = now, `classification` = static "Confidential", `top5Actions` = top 5 findings by CVSS across all networks (already computable), `keyBusinessImpacts` = omit section / render only if non-empty. No new schema for this — out of scope for "make export work," would need product input on copy.
4. **Historical scans table (summary report).** No cross-network scan history endpoint exists today. Build it client-side in the adapter from `allNetworks` + one `getScansForNetwork`-shaped call, OR simplest: add `historicalScans` to `getSummaryData()` backend response (one extra query: all COMPLETED `vulnerability_scans` joined to `networks.ssid`, ordered by `finished_at desc`, capped e.g. 20 rows). Prefer the backend addition — keeps adapter pure-transform, no N+1 frontend calls.
5. **Per-network report's riskTrend / historicalScans** — already available (`clientsRiskTrendData`, `scanList`) from `getNetworkDashboard`. No backend change needed here.

## Implementation

### Backend (`backend/services/dashboardService.js`, `backend/controllers/dashboardController.js`)
- Extend `getSummaryData()`: add `allNetworks` (full sorted list, same shape as `topRisks` plus `bssid`, `channel`, `encryption_status`) and `historicalScans` (global recent completed scans with `ssid`/`bssid` joined in). Return both alongside existing fields — additive, no breaking changes to `/api/dashboard/summary` consumers.
- No new routes needed; same `GET /api/dashboard/summary` endpoint, just richer payload.

### Frontend
- **`src/utils/reportDataAdapter.js`** (new file, matches the TODO already in `EXPORT_README.md`):
  - `buildOverallReportData()` — calls the dashboard summary API, maps response → `overallMockData` shape (using `allNetworks`, `historicalScans`, computed `top5Actions`/severity sections, and `detailedFindings` split via the `CODE_CATEGORY` map into the 3 fixed buckets).
  - `buildPerNetworkReportData(networkId)` — calls `GET /api/dashboard/network/:networkId`, maps response → `perNetworkMockData` shape (`riskTrend` ← `clientsRiskTrendData`, `historicalScans` ← `scanList`).
- **`src/components/sam/ExportDropdown.jsx`**: accept a `networkId` prop (from `useNetworkContext()` in the parent), make both handlers `async`:
  - `handleExportSummary` → `await buildOverallReportData()` → `generateOverallReportHTML` → `exportReport`.
  - `handleExportPerNetwork` → guard: if no `networkId` in context, toast "Scan a network first" instead of exporting; else `await buildPerNetworkReportData(networkId)` → `generatePerNetworkReportHTML` → `exportReport`.
  - Add a lightweight loading state (disable dropdown items while fetch in flight) since this is now async over the network.
- **`VulnerabilitiesTable.jsx` / `ThreatsTable.jsx`**: pull `networkId` from `useNetworkContext()` and pass to `<ExportDropdown networkId={networkId} />`.
- **`reportTemplates.js`**: no changes needed for `detailedFindings` — keep all 3 subsections as-is; adapter supplies the same 3-bucket shape the template already expects.
- Delete `src/data/mockReportData.js` and its imports once live path is verified (per EXPORT_README.md Step 6).

### Docs
- Update `docs/feature-notes/EXPORT_README.md`: mark mock→live integration complete, document the `CODE_CATEGORY` map (and that it must be updated if new WFVT codes are added), and the deferred narrative-metadata fields.
- Per project convention, log the change in `docs/feature-notes/CHANGES_README.md` (dated, file/problem/cause/fix).

## Verification
- Run backend + frontend dev servers.
- On SAM page: scan a network (or pick one with existing scan data) so `NetworkContext.networkId` is populated.
- Click Export → Summary Report: confirm the opened tab/PDF shows real network names, real risk scores/severity counts matching what's on the dashboard page, not "Nacho_WiFi" placeholders.
- Click Export → Per-Network Report: confirm it reflects the currently selected network's real vulnerabilities/threats/risk trend.
- Test with zero scan data (fresh DB) to confirm adapter/template don't crash on empty arrays — sections should show "No data" rather than throwing.
- Confirm pop-up-blocked path still shows the existing alert.
