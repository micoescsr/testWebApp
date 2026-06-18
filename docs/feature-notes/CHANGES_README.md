# Consolidated File-Level Changelog

This document describes the specific and explicit changes made across chat sessions.

---

## Mandatory TOTP MFA — June 18, 2026

### Problem

Why-PII?'s own admin/superadmin accounts were the highest-value target in
the system — compromising one exposes audit logs, device controls, and
user management — yet protected only by a password. Every other part of
the stack (Helmet, CSP, JWKS verification, HttpOnly refresh cookies,
in-memory access tokens) was already hardened; password-only auth was the
weakest remaining link.

### Cause

No second factor existed for any account, admin or superadmin.

### Fix

TOTP MFA via Supabase Auth's native MFA API, mandatory for every account,
enforced server-side via the JWT `aal` claim — see
`docs/AUTHENTICATION_AND_AUTHORIZATION.md` §11 for the full architecture.

- **New:** `backend/migrations/005_add_mfa_enrolled.sql` — `profiles.mfa_enrolled boolean NOT NULL DEFAULT false`.
- **New:** `backend/middleware/mfaMiddleware.js` — `requireAAL2`, 403s `{ error, code: "MFA_REQUIRED" }` unless `req.user.aal === "aal2"`, audit-logs `AUTHORIZATION.DENIED`.
- **New:** `backend/controllers/mfaController.js` + `backend/routes/mfaRoutes.js` — `POST /api/auth/mfa/sync-status` (re-derives `mfa_enrolled` from Supabase's own factor list) and `POST /api/auth/mfa/admin-unenroll/:id` (superadmin + AAL2, removes all TOTP factors via the Admin API).
- **Updated:** `backend/middleware/authMiddleware.js` — `authJWT`/`optionalAuthJWT` now surface `payload.aal` (default `"aal1"`) onto `req.user.aal`.
- **Updated:** `backend/routes/userRoutes.js`, `auditRoutes.js`, `samRoutes.js`, `captivePortalRoutes.js`, `dashboardRoutes.js`, `detectRoutes.js`, `historyRoutes.js`, `rasPiRoutes.js`, `deviceMgmtRoutes.js`, `piProxyRoutes.js`, `webAppRoutes.js` — `requireAAL2` added after `authJWT, requireActiveProfile` on every authJWT route that mutates data or exposes sensitive info (exceptions: `GET /profiles/me`, the unauthenticated `/scan-completed` machine webhook, and the pre-MFA `/api/auth/*` steps).
- **Updated:** `backend/repositories/userRepository.js` — `mapRowToProfile` now includes `mfa_enrolled`.
- **Updated:** `backend/middleware/rateLimiter.js` — added `mfaLimiter` (20/15min) on `sync-status`.
- **New:** `src/pages/Auth/MFAChallenge.jsx` — login-time 6-digit challenge (auto-submit, auto-retry on expired challenge).
- **New:** `src/pages/Auth/MFASetup.jsx` + `src/components/auth/TotpQrDisplay.jsx` — enrollment flow (QR + manual-entry secret), `mode="forced"` (standalone `/mfa-setup` route) and `mode="self-service"` (Profile-page modal, replaces existing factor).
- **Updated:** `src/pages/Login/Login.jsx` — checks `getAuthenticatorAssuranceLevel()` after password sign-in, renders `MFAChallenge` when the account needs `aal2`.
- **Updated:** `src/App.jsx` — bootstrap fetches `mfa_enrolled`, persistent gate redirects any authenticated user without it to `/mfa-setup`.
- **Updated:** `src/hooks/useProfile.js` — maps `mfa_enrolled` → `mfaEnrolled`, exposes `refetchProfile`.
- **Updated:** `src/pages/Profile/Profile.jsx` — "Two-Factor Authentication" card (Enabled badge + re-enroll; no disable option).
- **Updated:** `src/api/userApi.js`, `src/components/accounts/AccountsTable.jsx`, `src/pages/AccountsAudit/AccountsAudit.jsx` — superadmin "Reset MFA" per-row action (confirmation required) for lost-device recovery.
- **Not done:** Playwright E2E specs (`mfa-enrollment.spec.js`, `mfa-login-challenge.spec.js`) — scoped out of this pass per explicit decision; backend Jest + the manual checklist below cover this release. Revisit if E2E coverage becomes a requirement.

### Tests

- New: `backend/__tests__/unit/mfaMiddleware.test.js` (5 cases), `backend/__tests__/integration/mfaController.test.js` (7 cases), 3 new AAL2 cases in `backend/__tests__/integration/authorization.test.js`.
- Updated 8 existing integration suites' mocked JWT payloads to include `aal: "aal2"` so they keep exercising their intended (now AAL2-gated) success paths.
- Full backend suite: 462/462 passing. Frontend: `npm run build` succeeds, `npm test` (vitest) 10/10 passing (no component test infra exists in this repo for the new pages — confirmed pre-existing gap, not introduced by this work).
- Manual QA checklist (`docs/TESTING_AND_QUALITY_ASSURANCE.md` §8) run end-to-end against a live Supabase project: fresh enroll → dashboard, re-login → challenge → dashboard, wrong code ×3 (no lockout), `aal1` token rejected on an AAL2 route (`403 MFA_REQUIRED`, verified via curl), superadmin Reset MFA, self-service re-enroll — all passing.
- Manual testing surfaced 5 real bugs, fixed in a follow-up commit: (1) enroll-cleanup only checked `listFactors().totp` (verified-only), missing unverified leftovers — now filters `.all`; (2) `friendlyName` collisions from leftover factors — now uniquified per attempt; (3) `verify()`'s response is a flat session object, not `{session: {...}}` — fixed in both `MFASetup.jsx` and `MFAChallenge.jsx`; (4) `MFAChallenge`'s auto-submit read `code` from a stale closure, sending a 5-digit code; (5) `mfa_enrolled` going stale when a factor was removed directly via the Supabase dashboard instead of `admin-unenroll` — `Login.jsx` now re-syncs it from Supabase's real factor list on every login; (6) self-service re-enroll's immediate profile refetch unmounted/remounted `MFASetup` mid-success via `Profile.jsx`'s loading guard, silently generating a new factor every time — refetch deferred to the Done button.

---

## SAM Export — Fix `undefined` Risk Trend in Per-Network Report — June 18, 2026

### Problem

`PER-NETWORK-SCAN-REPORT.md` (a generated per-network export, reviewed against the printed PDF) showed `undefined` for every cell of the "Risk Trend for This Network" table (Scan Date / Scan Time / Risk Score / Risk Level) across all historical scans, and the trend-analysis sentence read "Risk score increased from undefined to undefined." The Plotly risk-trend line chart was also empty.

### Cause

`src/utils/reportDataAdapter.js`'s `buildPerNetworkReportData()` mapped `riskTrend: data.clientsRiskTrendData`. That field is shaped `{ scan, clients, risk }` — built for the Dashboard page's clients-vs-risk chart, not the export report. `src/utils/reportTemplates.js`'s per-network template (`generatePerNetworkReportHTML`) reads `{ date, time, score, level }` per trend row. The field names never matched, so every interpolation (`t.date`, `t.time`, `t.score`, `t.level`) resolved to `undefined`.

### Fix

- `backend/utils/reportAggregations.js`: added `buildRiskTrendTable(rows)` — maps `{ finished_at, risk_score }` rows to `{ date, time, score, level }`, splitting `finished_at` into date/time and deriving `level` via the existing `riskLabelForReport`.
- `backend/services/dashboardService.js`: `shapeNetworkResponse()` now also returns `riskTrend` (built from the same `history` rows already fetched for `clientsRiskTrendData`/`historicalScans` — no new query).
- `src/utils/reportDataAdapter.js`: `buildPerNetworkReportData()` now reads `data.riskTrend` instead of `data.clientsRiskTrendData`.

### Tests

- `backend/__tests__/unit/reportAggregations.test.js`: added `describe("buildRiskTrendTable", ...)` (4 new tests, written and watched fail before implementing — TDD). Full backend suite: 451/451 passing.
- `src/utils/reportDataAdapter.test.js`: updated the per-network fixture/test to assert `riskTrend` is passed through in the corrected shape instead of asserting the old (broken) `clientsRiskTrendData` mapping. `npx vitest run src/utils/reportDataAdapter.test.js`: 10/10 passing.

---

## SAM Export — Live Data Wiring — June 17, 2026

### Problem

SAM page's Export dropdown (Summary Report / Per-Network Report) and `ThreatDetail`'s Export button rendered fully-built PDF templates (`reportTemplates.js`, browser print-to-PDF) but fed them hardcoded mock data (`src/data/mockReportData.js`) instead of real scan results.

### Cause

`buildOverallReportData()`/`buildPerNetworkReportData()` (the live-data adapter) never existed; `dashboardService.getSummaryData()`/`getNetworkDashboard()` also didn't return several fields the report templates need (full network list beyond top-5, bucketed `detailedFindings`, historical scans with risk scores, a rule-based remediation plan, network ssid/bssid/channel).

### Fix

- **New:** `backend/utils/findingCategory.js` — `categorizeFinding()`, a static `vt_code`→category map (`openAndWeakCrypto`/`misconfigurations`/`activeThreats`) since `vulnerability_threat_details` has no category column.
- **New:** `backend/utils/reportAggregations.js` — pure data-shaping functions (`riskLabelForReport`, `buildNetworkRiskTable`, `buildDetailedFindings`, `buildFindingsLists`, `buildHistoricalScansTable`, `buildRemediationPlan`) used by `dashboardService` to build export-ready report data. `buildRemediationPlan` is a static rule-based catalog keyed by `vt_code` (mirrors the report's own "rule-based, no AI" claim) — update it when new WFVT codes are catalogued.
- **Updated:** `backend/services/dashboardService.js` — `getSummaryData()` now also returns `allNetworks`, `detailedFindings`, `historicalScans`, `remediation`; `getNetworkDashboard()`/`shapeNetworkResponse()` now also return `ssid`, `bssid`, `channel`, `riskLabel`, `reportFindings` (full vulnerabilities/threats lists), `historicalScans`. Findings queries extended to select `vt_code` (needed for categorization/IDs).
- **New:** `src/utils/reportDataAdapter.js` — `buildOverallReportData()` / `buildPerNetworkReportData(networkId)`, mapping the above API responses into the shape `reportTemplates.js` expects.
- **Updated:** `src/components/sam/ExportDropdown.jsx` — accepts a `networkId` prop, handlers are now async, calls the adapter instead of mock data, shows a "Generating…" disabled state, toasts on failure or missing `networkId`.
- **Updated:** `src/components/sam/VulnerabilitiesTable.jsx`, `ThreatsTable.jsx` — pass `networkId` from `useNetworkContext()` into `ExportDropdown`.
- **Updated:** `src/components/sam/ThreatDetail.jsx` — same async/live-data/guard pattern as `ExportDropdown`, using `useNetworkContext()`.
- **New:** `package.json` — `"test": "vitest run"` script; `vite.config.js` — added `test.include: ["src/**/*.test.{js,jsx}"]` so Vitest doesn't try to run backend's Jest-syntax test files.
- **Not done yet:** `src/data/mockReportData.js` left in place (no longer imported anywhere) pending a live-DB smoke test — delete once verified against real scan data per `EXPORT_README.md` Step 6.

### Tests

- `backend/__tests__/unit/findingCategory.test.js`, `backend/__tests__/unit/reportAggregations.test.js` — full TDD coverage (95% branch on the new utils, backend suite at 447 passing).
- `src/utils/reportDataAdapter.test.js` (new Vitest suite, 10 tests) — TDD coverage of both adapter functions.

---

## SAM Export — Fix `vt_code does not exist` on `latest_scan_findings` — June 17, 2026

### Problem

After the live-data wiring above, Summary Report and Per-Network Report exports both failed with a generic "Failed to generate report" toast. Backend log: `column latest_scan_findings.vt_code does not exist`.

### Cause

The `latest_scan_findings` Postgres view (not version-controlled, lives only in Supabase) exposes `vt_name` but not `vt_code`. The June 17 export work added `vt_code` to that view's `.select()` calls without verifying the view's actual columns — Postgrest threw `42703` on every request.

### Fix

`backend/services/dashboardService.js` — `getSummaryData()` and `getNetworkDashboardLatest()`: removed `vt_code` from the `latest_scan_findings` select; instead, after fetching findings, collect distinct `vt_detail_id`s and look up `vt_code` via a follow-up query against `vulnerability_threat_details` (which does have the column), then merge it back onto each finding. Mirrors the enrichment pattern `getNetworkDashboardByScan()` already used for its legacy scan path.

### Tests

Full backend suite re-run after fix: 447/447 passing (existing mocked tests already covered the new query shape since they mock at the `supabaseClient` boundary).

---

## WiFi Risk Score — Noisy-OR Implementation — June 13, 2026

### Updated: `docs/scoring-refactor/WIFI_RISK_SCORE_SPEC.md`

- Status changed from **Design proposal** to **Implemented**.
- Section 9 rewritten from "Implementation Note (Follow-up Task)" to
  "Implementation Notes", pointing at the new migration file.

### New file: `backend/migrations/004_noisy_or_risk_score.sql`

- `CREATE OR REPLACE FUNCTION public.compute_scan_risk(p_scan_id bigint)` —
  replaces the `Σ Pi×CVSSi / 60.7 × 100` body with the noisy-OR formula
  `Score% = (1 - Π(1-CVSSi/10)) × 100`.
- Scope/presence rules unchanged: fixed WFVT-001..007 dataset, vulnerability
  rows present-if-row-exists, threat rows present-if-latest `vt_status='ACTIVE'`.
- Product computed as `EXP(SUM(LN(1 - cvss/10)))`; a CVSS of exactly 10 is
  short-circuited to `product = 0` to avoid `ln(0)`.
- Output still clamped `[0,100]`, rounded to integer, written to
  `scans.risk_score` — signature, return type, and all callers unchanged, so
  `bucketize()`, `getRiskLabel()`, `riskPipeline.js` need no JS changes.
- **Applied to Supabase** via SQL Editor — confirmed success.

### Updated: `docs/current_sql_schema.sql`

- Replaced with the 2026-06-12 schema dump (previously a root-level file,
  `DB AS OF 6-12-26.txt`, now removed). Reflects current `networks`, `scans`,
  `vulnerabilities_threat`, `vulnerability_threat_details`, etc. table
  definitions.

---

## PROJECT_CONTEXT_AND_PRD.md Update — June 17, 2026

### File: `docs/PROJECT_CONTEXT_AND_PRD.md`

- **Problem:** Doc dated 2026-06-02 was stale vs codebase changes made June 9–13.
- **Cause:** New components and security hardening not reflected in doc.
- **Fix:**
  - Updated `Last Updated` date to 2026-06-17.
  - Added `EmptyState`, `Spinner`, `Toast` to common components list (added in commit `a467cde`).
  - Updated Security Overview: active-profile enforcement now noted as applying to all authenticated routes; rate limit values corrected (login 10, refresh 30, global 300); frontend security headers row added noting `vite.config.js` + `backend/server.js` sync requirement.

---

## Security Headers Remediation — ZAP Findings — June 13, 2026

### Problem

ZAP scan (`ZAP-Security-Report.md`) against `http://localhost:5173/` (Vite dev server) flagged 3 missing-header alerts: CSP not set (10038), missing anti-clickjacking header (10020), and X-Content-Type-Options missing (10021, systemic). Backend (`backend/server.js`) already had helmet + CSP configured (Phase 1-C) — the gap was the Vite dev/preview/prod-serve paths, which had zero header config of their own.

### `vite.config.js` — Updated

Added `server.headers` (dev, port 5173) and `preview.headers` (`vite preview`), both setting:

- `Content-Security-Policy` — `default-src 'self'`. Dev additionally allows `'unsafe-inline'`/`'unsafe-eval'` in `script-src` (required for Vite HMR / React Fast Refresh) and `ws://localhost:*` / `wss://localhost:*` in `connect-src`; preview drops eval (`script-src 'self'`).
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`

### New file: `public/serve.json`

- Header rules (same set as `preview.headers`) for the `npm start` → `serve -s dist` production path. `serve` auto-reads `serve.json` from the directory it serves; Vite copies `public/*` into `dist/` on build, so `dist/serve.json` is produced with no `start` script change.
- `connect-src` includes a `https://*.up.railway.app` wildcard for the Railway backend. Railway is currently paused, so this is unverified against the real `VITE_API_BASE_URL` — adjust on resume if the actual domain differs.

### Rescan follow-up (port 5174)

Re-scan confirmed the original 3 alerts were resolved, but surfaced 4 new Medium CSP-quality alerts (Plugin 10055) on the CSP just added — these couldn't fire while no CSP existed:

- **Failure to Define Directive with No Fallback** (`form-action` / `base-uri`) — fixed: added `base-uri 'self'; form-action 'self'; object-src 'none'` to `server.headers`, `preview.headers`, and `public/serve.json`. Verified via curl.
- **CSP: script-src unsafe-eval** — left as-is, dev-only, required for Vite HMR / React Fast Refresh. Not present in preview/prod `script-src` (`'self'` only).
- **CSP: script-src unsafe-inline** — left as-is, same dev-only reasoning.
- **CSP: style-src unsafe-inline** — left as-is, dev + prod, required for React inline `style={{}}` attributes (recharts etc.). Removing would need a nonce/hash-based CSP rewrite — out of scope.

### New file: `docs/feature-notes/SECURITY_HEADERS_FRONTEND.md`

Full mitigation record: per-alert breakdown, exact CSP/header values for all 3 serving paths (dev/preview/prod-serve), rescan results, accepted-risk rationale, and re-verification steps (curl + ZAP rescan).

---

## Risk Scoring Design Proposal — June 10, 2026

### New file: `docs/scoring-refactor/WIFI_RISK_SCORE_SPEC.md`

- **Problem**: Current `compute_scan_risk` formula (`Σ Pi×CVSSi / 60.7 × 100`)
  understates single-finding networks — e.g. "Open Auth only" (CVSS 9.4)
  scores 15.49% / LOW despite being a Critical vuln (see
  `wifi_risk_scoring_review.md`).
- **Cause**: fixed `Rmax=60.7` denominator dilutes any single severe finding;
  a "max-CVSS-only" alternative was also considered but collapses
  single-finding and multi-finding networks to the same score.
- **Proposal (no code changed yet)**: replace the formula with a noisy-OR /
  probabilistic combination — `Score% = (1 - Π(1-CVSSi/10)) × 100` over all
  ACTIVE findings. Bounded 0-100, drops the `60.7` constant, single
  Open-Auth finding now scores 94%/Critical, and multi-finding networks score
  higher than single-finding ones. Bucket thresholds, `bucketize()`,
  `getRiskLabel()`, and the continuous-detection recompute lifecycle are
  unaffected — only the SQL body of `compute_scan_risk` would change.
  Justification (CVSS v4.0, NIST SP 800-30 Rev.1, OWASP Risk Rating
  Methodology, FTA OR-gate) documented in the new spec file.

---

## Local Dev Fix — June 9, 2026

### Frontend white screen — Missing `.env`

**File:** `.env` (created at repo root, gitignored)

- **Symptom**: Frontend loaded to a blank white screen; `[pageerror] supabaseUrl is required` thrown from `src/lib/supabaseClient.js:6` during module init, before React could mount.
- **Root cause**: Repo root had no `.env` (only `.env.example`), so `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` were `undefined` and `createClient()` threw synchronously.
- **Fix**: Created `.env` from `.env.example`, populated `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same Supabase project values already present in `backend/.env`. Left `VITE_API_BASE_URL` blank so the Vite dev proxy forwards `/api` → `localhost:3000`.
- **Note**: Vite only reads `.env` at server startup — dev server restart required to pick up the new file.

---

## UI/UX Fixes — March 7, 2026

### 1. Login Page — Removed "Welcome back" text

**File:** `src/pages/Login/Login.jsx`

- Removed the `<p className="login-welcome">Welcome back</p>` element from the login card.
- The login page now shows only the logo icon and "Login to your account" heading for a cleaner appearance.

### 2. Dashboard — Fixed corrupted Unicode characters (mojibake)

**Files:**
- `src/components/dashboard/SummarySection.jsx`
- `src/components/dashboard/NetworkSection.jsx`
- `src/components/dashboard/DashboardHeader.jsx`

Several text elements had garbled characters due to UTF-8 encoding corruption:
- `ΓÇö` → `—` (em dash) — used as fallback for missing dates and encryption status
- `ΓåÉ` / `ΓåÆ` → `▼` / `▶` — legend toggle button icons
- `ΓùÅ` → `✓` — device online status checkmark

### 3. SAM Page — Fixed layout with fixed-height table and aligned sidebar

**File:** `src/pages/SAM/SAM.css`

- Set `.sam-layout` grid to `align-items: stretch` so both columns (table + sidebar) stretch to the same height.
- Added `min-height: calc(100vh - 140px)` to `.sam-layout` so the layout fills the viewport with no wasted empty space.
- Made `.sam-main` a flex column (`display: flex; flex-direction: column`) so the card can grow to fill it.
- Made `.sam-card` a flex column with `flex: 1` so the table container stretches to fill the remaining height.
- Changed `.sam-card-inner` from a fixed `max-height: 480px` to `flex: 1` so the scrollable area fills whatever space the card has.
- Made `.empty-state` flex-centered (`flex: 1; display: flex; align-items: center; justify-content: center`) so the "Nothing to analyze" message centers vertically.
- Added `margin-top: auto` to `.sam-actions` so the Export/Clear buttons stay pinned at the bottom of the card.
- Removed `position: sticky` and `max-height` from `.sam-sidebar` — the sidebar now stretches to match the table height naturally via `align-items: stretch`.
- Consolidated duplicate `@media (max-width: 1200px)` blocks into one and added `min-height: auto` override for tablet/phone stacked layouts.

### 4. Accounts & Audit — Export CSV modal + tab retention

**Files:**
- `src/pages/AccountsAudit/AccountsAudit.jsx`
- `src/components/accounts/AuditLogsTable.jsx`
- `src/hooks/useAuditLogs.js`
- `src/pages/AccountsAudit/AccountsAudit.css`

**Export CSV changes:**
- The "Export CSV" button no longer requires pre-selecting dates in the top bar filters.
- Clicking "Export CSV" now opens a **modal dialog** with From/To date pickers.
- The modal includes inline validation (both dates required, start ≤ end) and a note that the action is audited.
- `handleExport` in `useAuditLogs.js` now accepts optional `(exportFromDate, exportToDate)` parameters so the modal can pass dates directly.
- Added `.export-date-fields` and `.export-date-label` CSS classes for the modal date picker layout.

**Tab retention changes:**
- Changed `useState("accounts")` to `useSessionState("wf:accountsAuditTab", "accounts")` for the active tab.
- When a user is on the Audit Logs tab and refreshes the page, they remain on the Audit Logs tab.

### 5. Profile Page — Centered layout

**File:** `src/pages/Profile/Profile.css`

- Added `display: flex; flex-direction: column; align-items: center; max-width: 560px; margin: 0 auto` to `.profile-page`.
- Set `.profile-header` and `.profile-card` to `width: 100%` for full-width alignment within the centered container.
- Replaced `max-width: 480px` on `.profile-card` and `.profile-form` with `width: 100%` to fill the centered parent.

---

## 1. `backend/server.js`

### History Endpoints — Added

Two inline endpoints were added to serve the History page:

#### `GET /api/history/vulnerabilities`

- Queries the `scans` table joined with `networks` to retrieve `ssid`, `bssid`, `channel`, and `num_clients` per scan.
- Queries `vulnerabilities_threat` filtered by `vt_kind = 'vulnerability'`, joined with `vulnerability_threat_details` for `vt_code`, `vt_severity_rating`, and `vt_cvss_base_score`.
- Groups findings by `scan_id` and maps each scan to a frontend-ready object containing:
  - `id`, `datetime`, `ssid`, `bssid`, `channel`, `scan_start`, `scan_end`, `num_clients`, `summary` (finding count), and `details[]` array.
- Each `details[]` entry includes: `id` (vt_code), `severity`, `name`, `score`, `status`, and `value`.
- Uses fallbacks to `scan_data` JSON (e.g., `scan.scan_data?.bssid`) when the `networks` join returns null.

#### `GET /api/history/threats`

- Same join and grouping logic as the vulnerabilities endpoint, but filters `vt_kind = 'threat'`.
- Returns `threats[]` array per scan with: `code`, `severity`, `name`, `score`, `status`, `occurrences`, and `window`.

**Why**: These fields (BSSID, channel, scan_start, scan_end, num_clients) were previously missing from the API response, causing the Scan Details drawer to display "—" for all KPI values.

### Threat Detection Poll Proxy — Added

#### `GET /api/detect/poll`

- Proxies requests to the FastAPI detector at `${FASTAPI_BASE}/detect/poll`.
- On receiving threat results, calls `loadThreatDefinitions()` to fetch all `vulnerability_threat_details` rows and builds a lookup map by `vt_code`.
- Calls `mapPollResultsToThreatRows()` to group raw detection results by threat type (`evil_twin`, `mac_spoofing`, `deauthentication`), resolving each against the DB definitions for `vt_name`, `vt_severity_rating`, and `vt_cvss_base_score`.
- Each mapped threat includes: `id`, `name`, `severity`, `score`, `status`, `occurrences`, `detectedTime`, `sessions[]`, and `raw[]`.
- Calls `persistThreatRows()` to write detected threats into `vulnerabilities_threat` with `vt_kind = 'threat'`.
- Returns `{ ...fastApiData, threatRows }` to the frontend.

### Threat Persistence Helpers — Added

- **`loadThreatDefinitions(supabaseClient)`** — Fetches `vt_code`, `vt_name`, `vt_cvss_base_score`, `vt_severity_rating`, `vt_kind` from `vulnerability_threat_details` and returns a `Map<vt_code, detail>`.
- **`mapPollResultsToThreatRows(results, defsByCode)`** — Groups poll results by finding key, aggregates occurrences and sessions (firstSeen/lastSeen/state), resolves names and scores from the definitions map.
- **`findLatestScanIdForBssid(targetBssid, supabaseClient)`** — Looks up the most recent scan for a given BSSID by resolving `networks.network_id` → `scans.scan_id`.
- **`persistThreatRows(threatRows, targetBssid, supabaseClient)`** — For each threat row, looks up `vt_detail_id` by `vt_code`, determines `vt_status` from the latest session state, and inserts into `vulnerabilities_threat`.

### Device Status Proxy — Added

#### `GET /api/device/status`

- Proxies to `${FASTAPI_BASE}/device/status` and forwards the FastAPI response status code and JSON body.
- Returns `502` with diagnostic info if FastAPI is unreachable.

### Captive Portal Endpoints — Updated

All announcement and terms endpoints were changed from using a hardcoded `NETWORK_ID` constant to accepting a dynamic `network_id` parameter:

| Endpoint                        | Change                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| `GET /api/announcement`         | Now requires `?network_id=` query param; filters by that network |
| `GET /api/announcement/history` | Same — requires `?network_id=` query param                       |
| `POST /api/announcement`        | Reads `network_id` from request body instead of constant         |
| `GET /api/terms`                | Now requires `?network_id=` query param                          |
| `GET /api/terms/history`        | Same — requires `?network_id=` query param                       |
| `POST /api/terms`               | Reads `network_id` from request body instead of constant         |

### User Activation Endpoint — Added

#### `POST /api/webApp/users/profiles/:id/activate-with-temp`

- Protected by `authJWT` middleware; restricted to `superadmin` role.
- Updates the profile to `status: 'active'`, sets `must_change_password: true` and `temp_expires_at` (24h from now).
- Generates a cryptographically random temporary password using `crypto.randomBytes(32)`.
- Updates the Supabase auth user's email and password via `supabaseClient.auth.admin.updateUserById()`.
- Returns `{ profile, tempPassword }`.

### Route Mounting — Updated

```
app.use("/api/webapp", webAppRoutes);
app.use("/api/rasPi", rasPiRoutes);
app.use('/api/rasPi_scan', scanRoutes);
app.use('/api/device', deviceMgmtRoutes);
app.use('/api/sam', samRoutes);            // ← NEW mount
app.use("/api/auth", authRoutes);          // ← NEW mount (public, no JWT)
```

---

## 2. `backend/controllers/metadataController.js`

### `getVulnerabilitiesLatest(req, res)` — Rewritten

**Previously**: Used aliased Supabase joins (`scan:scans(...)`) and did not filter by `vt_kind`, meaning threat rows could leak into the vulnerability response. The `network_id` filter was applied using the wrong join path.

**After changes**:

1. **BSSID normalization** — Incoming `bssid` query param is uppercased (`String(bssid).toUpperCase()`) before lookup to match the storage format.

2. **Network resolution** — Explicitly queries `networks` table for `network_id` by normalized BSSID using `.single()`, and returns a clear error if not found.

3. **Supabase join fix** — Removed the alias `scan:scans(...)` and uses the unaliased form `scans!inner(...)` so the filter `.eq("scans.network_id", networkId)` works correctly. Nested join `networks(bssid, ssid)` retrieves network info through the scan.

4. **`vt_kind` filter** — Added `.ilike("vt_kind", "vulnerability")` to exclude threat rows from the response. This prevents runtime threat detections (e.g., Evil Twin, Deauthentication) from appearing in the SAM vulnerabilities table.

5. **Row mapping fix** — The mapping code now correctly handles the unaliased `scans` property (which may be an object or single-item array from Supabase) and extracts `networks` from within it:

   ```js
   const scanObj = Array.isArray(item.scans) ? item.scans[0] : item.scans;
   const netObj = scanObj?.networks;
   ```

6. **Sort order** — Results are sorted by `detectedTime` descending (newest first) before returning.

7. **Debug logging** — Added `console.log` statements at each step (BSSID lookup, network resolution, raw row count, first row sample) for troubleshooting.

### `getNetworkMetadata(req, res)` — Unchanged

Still queries `networks` for `city, province, notes` by BSSID. No modifications.

---

## 3. `backend/controllers/rasPiController.js`

### `triggerScan(req, res)` — Minimal Changes

- Validates `ssid`, `bssid`, and `channel` from request body.
- Proxies `POST` to `${FASTAPI_BASE}/scan` with the payload.
- Returns the FastAPI response status and JSON directly.

### `getNetworksList(req, res)` — Added

- Proxies `GET` to `${FASTAPI_BASE}/networks` and returns the list of available networks from the scanning device.
- Returns `502` with diagnostic info if FastAPI is unreachable.

### `saveNetworkMetadataScan(req, res)` — Rewritten

This is the core persistence function called after a scan completes. Changes:

1. **BSSID normalization** — `String(bssid).toUpperCase()` ensures consistent storage/lookup across all tables.

2. **Network upsert** — Looks up existing network by normalized BSSID. If not found, inserts a new row with `ssid`, `bssid`, `channel`, `city`, `province`, `notes`, `encryption_status`, and `num_clients`. If found, updates those fields.

3. **Scan insertion** — Creates a `scans` row linked to `network_id` with `scan_data` (full JSON), `scan_start`, and `scan_end` from the scan payload.

4. **Findings persistence** — Iterates `scan.findings` (an object like `{ encryption: {...}, wps: {...}, mfp: {...} }`):
   - For each finding, looks up `vulnerability_threat_details` by `finding.id` (the `vt_code`, e.g., `WFVT-005`).
   - Builds a `vulnerabilities_threat` row with:
     - `scan_id` — links to the scan just inserted
     - `vt_name` — canonical name from DB detail or the finding key as fallback
     - `vt_status` — from `finding.status` (e.g., `"DETECTED"`)
     - `vt_value` — from `finding.value` (e.g., `"Disabled"`)
     - `vt_detail_id` — foreign key to `vulnerability_threat_details`
     - `vt_kind` — normalized to lowercase from DB detail or defaults to `'vulnerability'`
     - `severity_score` — CVSS base score from DB detail
   - Bulk inserts all finding rows.

5. **Debug logging** — Logs `scan.findings` type and keys, the number of vuln rows being inserted, and insert success/failure.

### `getNetworkById(req, res)` — Added

- `GET /api/rasPi/networks/:networkId` — Returns `ssid`, `bssid`, `channel`, and `encryption_status` for a specific `network_id`.
- Used by the frontend to load saved network config when the user selects a network.

### Exports — Updated

```js
module.exports = {
  triggerScan,
  getNetworksList,
  saveNetworkMetadataScan,
  getAccessPointDetails,
  getNetworkById,
};
```

---

## 4. `backend/controllers/samController.js`

### `getVulnDetail(req, res)` — Added

Mirrors `getThreatDetail` but for vulnerabilities. Key differences:

- **No kind enforcement** — Unlike `getThreatDetail` which returns 404 if `vt_kind !== 'threat'`, `getVulnDetail` does **not** reject non-vulnerability codes. This allows the modal to still display useful info for edge cases.
- **Graceful fallback on not found** — If the vulnerability is not found in the DB, returns a generic detail object using the lookup key as the name (does not 404). This ensures the modal always renders something.
- **Lookup logic** — Same as `getThreatDetail`: checks if the key looks like a `vt_code` (regex `/^[A-Z0-9]+-\d+$/i`) and uses `.eq("vt_code", key)` if so, otherwise falls back to `.ilike("vt_name", key)` for case-insensitive name match.

**Response shape**:

```json
{
  "severity": "CRITICAL",
  "name": "Open Network",
  "cvss": 9.4,
  "cvssVector": "AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
  "description": "Open Network (WFVT-001) was detected during analysis...",
  "recommendations": { "nist": [...], "owasp": [...] }
}
```

### `getThreatDetail(req, res)` — Updated

- **Added `vt_cvss_vector_string`** to the `.select()` query. Previously this field was never fetched from the DB, and the response always returned `cvssVector: "N/A"`.
- Now returns `cvssVector: detail.vt_cvss_vector_string ?? "N/A"` — real CVSS vector strings from the database.

### Helper Functions — Added

| Function                             | Purpose                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `looksLikeVtCode(s)`                 | Heuristic regex test to distinguish vt_codes (`WFVT-006`) from names |
| `defaultRecommendations()`           | Returns generic NIST and OWASP recommendation arrays                 |
| `defaultDescription(vtName, vtCode)` | Generates a default description string from the name and code        |

### Exports — Updated

```js
module.exports = { getThreatDetail, getVulnDetail };
```

---

## 5. `backend/routes/samRoutes.js`

### Route Added

```js
router.get("/vulnerabilities/:idOrName", getVulnDetail);
```

**Previously**: Only `GET /api/sam/threats/:idOrName` existed. The frontend's `samApi.js` already had a `getVulnerabilityDetail(idOrName)` function that called `GET /api/sam/vulnerabilities/:idOrName`, but there was no backend endpoint to handle it — requests would 404.

### Import Updated

```js
const {
  getThreatDetail,
  getVulnDetail,
} = require("../controllers/samController");
```

### Route Table (After Changes)

| Method | Path                                 | Handler           |
| ------ | ------------------------------------ | ----------------- |
| GET    | `/api/sam/threats/:idOrName`         | `getThreatDetail` |
| GET    | `/api/sam/vulnerabilities/:idOrName` | `getVulnDetail`   |

---

## 6. `src/hooks/useSAM.js`

### `useVulnerabilities` Hook

#### `fetchVulnDetail(vulnRow)` — Fixed

**Bug**: The function parameter was named `vulnIdOrName`, but the body referenced `vulnRow` — causing `ReferenceError: vulnRow is not defined` and the modal staying stuck on "Loading...".

**Changes**:

1. **Parameter renamed** — From `vulnIdOrName` to `vulnRow`. The caller (`SAM.jsx`) passes the entire vulnerability row object, not just a string.

2. **Lookup key order fixed** — Uses `vulnRow.name` first (matches `vt_name` in DB), falls back to `vulnRow.id` only if name is missing. Previously `id` was preferred, but `id` is a numeric Supabase row ID (e.g., `306`) that matches nothing in `vulnerability_threat_details`.

3. **API-first with local fallback**:
   - Calls `getVulnerabilityDetail(lookupKey)` from `samApi.js`.
   - On success, merges API data with local row data (`observedConfig`, `detectedTime`) and sets `vulnDetail`.
   - On failure (network error, 404), builds the detail entirely from the local row so the modal still shows something useful.

4. **`defaultVulnDescription(row)` helper added** — Generates a description string from the row's `name` and `observedConfig` when no DB description is available.

#### `clearVulnerabilities(targetBssid)` — Added

- Saves `new Date().toISOString()` to `localStorage` under key `sam_cleared_<BSSID>`.
- Sets `vulnerabilities` state to `[]`, immediately clearing the UI.
- Data is **not** deleted from the database.

#### `loadVulnerabilities(targetBssid)` — Updated

- Returns early with empty array if no `targetBssid` is provided (prevents stale data showing when no network is selected).
- Reads `sam_cleared_<BSSID>` from `localStorage` after fetching.
- Filters out vulnerabilities whose `detectedTime` is on or before the cleared timestamp.
- Added `deriveSeverity(score)` inline helper to compute severity labels from CVSS scores when the backend doesn't provide one.
- Maps backend response using both new field names (`vt_id`, `vt_name`, `vt_value`, `severity_score`, `scan_start`) and legacy field names (`id`, `name`, `observedConfig`, `score`, `detectedTime`) for robustness.
- Auto-reloads when the `bssid` dependency changes via `useEffect`.

#### Exports Added

```js
return {
  vulnerabilities,
  vulnsLoading,
  vulnError,
  vulnDetail,
  vulnDetailLoading,
  fetchVulnDetail,
  reloadVulnerabilities: loadVulnerabilities, // ← NEW
  clearVulnerabilities, // ← NEW
};
```

### `useThreatDetection` Hook — Added

Implements smart polling for live threat detection:

- **State**: `status` (`IDLE` | `SCANNING` | `DETECTING`), `detectionResults`, `liveThreats` (current poll snapshot), `displayThreats` (sticky — last non-empty result for UI).
- **Mock data support**: Automatically uses `mappedThreats` from `mockThreats.js` during Vite dev mode, toggleable via `VITE_USE_MOCK_THREATS` env variable.
- **`runPoll()`** — Fetches `GET /api/detect/poll`, maps `threatRows` through `mapThreatRowsToParentSessions()`, updates `liveThreats` and `displayThreats`. Reschedules itself every 2 seconds while `isPollingRef` is true.
- **`mapThreatRowsToParentSessions(rows)`** — Normalizes session timestamps to epoch seconds, builds session objects with `firstSeen`, `lastSeen`, `durationSeconds`, and `state`. Computes `occurrencesCompleted`, `activeSession`, and `detectedTime` for each parent threat.
- **`startPolling()` / `stopPolling()`** — Controlled by `useEffect` watching `status`. Cleanup on unmount stops polling.
- **`resetDetection()`** — Stops polling, resets status to `IDLE`, clears all threat state.

### `useNetworks` Hook — Added

- Fetches `GET /api/rasPi/networks_list` on mount.
- Returns `{ networks, loading, error, cached }`.
- Used by the SAM page to populate the network selector dropdown.

---

## Data Flow Summary

### Vulnerability Detail Modal (After Fix)

```
VulnerabilitiesTable → onView(vuln)           // full row object
    │
    ▼
SAM.jsx → openVulnDetail(vuln)
    │  setIsModalOpen(true)
    │  fetchVulnDetail(vuln)
    │
    ▼
useSAM.js → fetchVulnDetail(vulnRow)
    │  lookupKey = vulnRow.name               // e.g. "Open Network"
    │
    ▼
samApi.js → GET /api/sam/vulnerabilities/Open%20Network
    │
    ▼
samRoutes.js → getVulnDetail(req, res)
    │
    ▼
samController.js → queries vulnerability_threat_details
    │                WHERE vt_name ILIKE 'Open Network'
    │
    ▼
Returns: { severity, name, cvss, cvssVector, description, recommendations }
    │
    ▼
useSAM.js → merges API data + row data → setVulnDetail({...})
    │
    ▼
FindingDetailModal renders with full detail data
```

### Threat Detection Polling

```
SAM.jsx sets detectionStatus → "DETECTING"
    │
    ▼
useThreatDetection() → startPolling()
    │
    ▼
runPoll() → GET /api/detect/poll (Express)
    │             │
    │             ▼
    │         Express → GET ${FASTAPI_BASE}/detect/poll
    │             │
    │             ▼
    │         loadThreatDefinitions() + mapPollResultsToThreatRows()
    │         persistThreatRows() → INSERT into vulnerabilities_threat
    │             │
    │             ▼
    │         Returns { ...fastApiData, threatRows }
    │
    ▼
mapThreatRowsToParentSessions(threatRows)
    │
    ▼
setDisplayThreats(mapped) → ThreatsTable renders
    │
    ▼
setTimeout(runPoll, 2000)  // repeat
```

---

## 7. Scan Confirmation Modal — `alert()` → `ScanConfirmModal`

### Problem

After a successful scan, `SAM.jsx` called `alert()` to confirm the scan was saved. This showed a plain browser dialog that broke the app's design language.

### New Component: `src/components/modals/ScanConfirmModal/ScanConfirmModal.jsx`

A styled modal built on `BaseModal` that displays:

- **Header**: "Scan Saved"
- **Body**: Success icon, confirmation message, detail box (Network SSID + Network ID), redirect note
- **Footer**: OK button

Props: `isOpen`, `onClose`, `networkId`, `ssid`.

Accompanied by `ScanConfirmModal.css` (`.scm-*` class prefix).

### Changes in `src/pages/SAM/SAM.jsx`

1. Imported `ScanConfirmModal`.
2. Added `scanConfirm` state (`{ open, networkId, ssid }`).
3. Replaced `alert(...)` in `handleScan()` with `setScanConfirm({ open: true, networkId, ssid })`.
4. Rendered `<ScanConfirmModal>` alongside existing modals.
