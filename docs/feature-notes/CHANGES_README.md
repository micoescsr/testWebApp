# Consolidated File-Level Changelog

This document describes the specific and explicit changes made across chat sessions.

> See also: [`../PROJECT_CONTEXT_AND_PRD.md`](../PROJECT_CONTEXT_AND_PRD.md) for the
> current-state overview, [`../AUTHENTICATION_AND_AUTHORIZATION.md` §11](../AUTHENTICATION_AND_AUTHORIZATION.md#11-multi-factor-authentication-totp)
> for the as-built MFA architecture (the entry below is a changelog record, not
> the canonical reference), and [`ACCOUNTS_FLOW_README.md`](./ACCOUNTS_FLOW_README.md)
> for the accounts/audit deep-dive (includes the Reset MFA action).

---

## Device Management backend fixes — risk source + portal freshness (BUG-3B, BUG-2A, BUG-2B) — June 29, 2026

Backend-only. No API contract, AP enable/disable control, or auto-patch cooldown
changes (except the manual-update stamping required by BUG-2B). Frontend risk
source unchanged — Device Management still reads `networks.risk_bucket`.

- BUG-3B (risk stuck LOW): `backend/utils/riskPipeline.js` `onScanCompleted` now
  uses the authoritative `compute_scan_risk(p_scan_id bigint)` RPC → `bucketize`
  as the scan risk source and persists the real score/bucket via
  `updateNetworkRisk`. The RPC keys on the legacy `public.scans` BIGINT id, so
  `backend/controllers/rasPiController.js` passes `scanRow.scan_id` as
  `opts.legacyScanId`; the webhook path resolves the latest `scans` row for the
  network. `deriveBucketFromScanData` is kept only as a defensive fallback (it
  can't read severity, which lives in `vulnerability_threat_details`). Thresholds
  (existing `bucketize`): ≤0/1–39 LOW, 40–69 MEDIUM, 70–89 HIGH, 90–100 CRITICAL.
- BUG-2A (portal falsely "out of date"): every `portal_tipset_hash` stamp now
  uses `resolveFinalPortalTipsForNetwork(...).tipsetHash` — the exact value the
  state endpoint compares against — instead of
  `computePortalTipsetHash(payload…tips.items)` (string array with re-indexed
  sort_order, which never matched). Fixed in the enable INIT path, post-enable
  fire-and-forget, `finalizeJob`, `recoverOrphanedJob`
  (`backend/routes/deviceMgmtRoutes.js`, new `resolverTipsetHash` helper) and
  `autoPortalAdvisoryPatch` (`riskPipeline.js`).
- BUG-2B (Update Portal didn't clear staleness): manual `POST /device/portal/update`
  now, on a successful Pi patch, stamps both `portal_last_patched_version`
  (current `risk_score_version`) and the resolver `portal_tipset_hash` regardless
  of `update_type`. The risk debounce skips only when BOTH version and tipset are
  already current. Pi patch failure still returns 502 and stamps nothing (never
  falsely marks fresh).
- Tests: `__tests__/unit/riskPipeline.onScanCompleted.test.js` (new — RPC bucket
  persisted, HIGH/CRITICAL not LOW, fallback on RPC error);
  `__tests__/integration/deviceMgmt.test.js` (new — manual update stamps
  version+resolver hash; 502 leaves no stamp; AP-not-enabled 409);
  `riskPipeline.portalTipset.test.js` advisory assertion updated to the resolver
  hash. Full backend suite: 485 passing.

---

## Device Management AP/risk follow-up — live override + always-on poll — June 29, 2026

Follow-up to the BUG-1/BUG-3 fix below; first pass didn't fully hold in testing.
All changes in `src/hooks/useDevice.js`; no backend/AP-control/portal changes.

- BUG-1 (toggle still showed enabled): the post-`await` guard in
  `reconcileLiveAp` relied on `mountedRef`, which dev/StrictMode double-mount
  left `false` (cleanup ran, never re-armed) → reconciliation silently no-oped.
  Now re-arm `mountedRef.current = true` on mount.
- BUG-1 (clobber): live-"off" is now a separate `liveApConfirmedOff` override
  instead of mutating `apEnabled`, so the periodic DB poll can refresh
  `apEnabled` without re-showing a stale ON. Effective toggle =
  `apEnabled && !liveApConfirmedOff`; reconciler sets the override from live
  `DISABLED`/`ENABLED` (downgrade-only; UNKNOWN/transitioning leave it as-is).
  Toggle/`effectiveAccessPoint`/`handleUpdatePortal` use the effective value;
  user-initiated toggle clears the override.
- BUG-3 (risk lag): the low-frequency admin-state poll now runs whenever the
  page is open (was AP-enabled-only), so a risk change landing *after* mount
  (detection auto-start / threat elevation) is reflected without a refocus.
  DB-only `fetchAdminState` at the existing 12s interval; live AP still
  reconciled separately on mount/focus.

Verified: `src/hooks/useDevice.js` eslint clean.

---

## Device Management AP-state reconciliation + risk refresh (BUG-1, BUG-3) — June 29, 2026

Fixed two Device Management bugs where the page trusted stale DB state instead of
live device/scan truth. Scope-limited to AP-state display and admin-state refresh;
no AP control behavior, DB writes, or portal cooldown/auto-patch logic changed.
(BUG-2 "portal out of date" intentionally deferred — observe after these land.)

- `backend/routes/deviceMgmtRoutes.js` (`GET /api/device/ap-live`): the normalizer
  ignored the real Pi `/ap/poll` envelope shape `{ ap_up, ap: { ap_mode, ... } }`
  and read only non-existent `ap_status`/`ap_enabled`, so it always returned
  `UNKNOWN`. Now derives `ap_status` from `ap_up` (coarse, primary) then
  `ap.ap_mode` (detailed), with the prior string/bool fields kept as fallbacks.
  Response contract unchanged (`ap_status` enum). Also makes the async job-confirm
  live poll actually confirm instead of timing out.
- `src/hooks/useDevice.js` (BUG-1): added `reconcileLiveAp()` — on mount, after
  `fetchAdminState`, calls existing `pollApLive()`; if live clearly reports
  `DISABLED` (not transitioning), downgrades the local toggle so the UI and
  AP-dependent banners stop trusting a stale `ap_enabled=true`. Downgrade-only:
  no DB write, no enable/disable control call, no physical AP change; ambiguous
  results (UNKNOWN/transitioning/unreachable) leave the DB value untouched.
- `src/hooks/useDevice.js` (BUG-3): added a `focus` / `visibilitychange` listener
  that re-runs `fetchAdminState` (then `reconcileLiveAp`) even when the AP is off,
  so Risk Level refreshes after a scan when the page is already open or the user
  returns to the tab. Reuses existing fetch; no new polling loop.

Verified: `backend` jest `deviceMgmt` suite 27/27 pass (incl. ap-live
ENABLED/DISABLED/UNKNOWN); `src/hooks/useDevice.js` eslint clean.

---

## Dashboard metric-drawer filter/sort controls — June 29, 2026

Added compact, local filter + sort controls inside the four list-type dashboard
metric drawers. No layout, routing, or backend changes; filtering is local to the
open drawer and does not affect summary totals. Aggregate drawers
(`encryptionDist`, `severityKind`) are unchanged (distributions, not record lists).

- `src/utils/drawerFilters.js` (new): pure config-driven engine — `filterAndSort`,
  `activeFilterCount`, `distinctOptions`, `riskLevelOptions`, plus `severityRank`
  and `encryptionRank` (keyword-based "weakest security first" ordering).
- `src/components/dashboard/DrawerFilterBar.jsx` + `.css` (new): reusable,
  token-styled toolbar (search box, filter dropdowns, sort dropdown, active-count
  + clear button). Sized for the 440px drawer; all controls labelled.
- `src/components/dashboard/SummaryDetailContent.jsx`: wired the toolbar into the
  `open` / `encrypted` / `clients` / `findings` drawers via per-type configs.
  Findings buckets are flattened into one filterable list (category preserved as
  a filter + row sub-line). Filters reset on metric switch (render-time reset,
  not an effect). Filtered-empty state added.
  - Defaults: open = risk desc; encrypted = weakest security first → risk desc;
    clients = clients desc; findings = severity desc → CVSS desc.
  - Skipped (fields absent from summary payload): WPS/PMF status, finding
    timestamps. No backend change required.

## Bug-hunt pass: 404 route, updateUser self-protection, effect deps — June 28, 2026

### BUG-01 — blank screen on unknown authenticated path

- `src/App.jsx`: added trailing `<Route path="*" element={<Navigate to="/dashboard" replace />} />`
  inside the authenticated inner `<Routes>`. Previously an unmatched path (typo,
  stale link, or prod `/test-auth` which is dev-only) rendered an empty
  `.main-content`. No new page created.

### BUG-02 — `updateUser` allowed self role/status change

- `backend/controllers/userController.js` (`updateUser`): block changing your own
  `role` or `status` via the generic update endpoint (`403`), mirroring the
  existing self-targeting guards in `deleteUser`/`deactivateUser`. Prevents the
  only superadmin from self-demoting or self-locking-out.

### BUG-04 — ThreatDetectionContext effect deps

- `src/context/ThreatDetectionContext.jsx`: added `activeNetworkOverride` and
  `setActiveNetworkOverride` to the sync effect's dep array (behavior-neutral;
  setter is a stable `useCallback` from `useSessionState`, effect stays guarded by
  the `ssid !== activeNetworkOverride` check). No lint suppression.

Held: BUG-03 (refresh-persistent dashboard subviews) — dashboard stays
intentionally state-based. Drawer breadcrumb behavior untouched.

## Dashboard breadcrumb + Back button — June 28, 2026

### Problem

Dashboard switches between the Summary view and a per-network drill-down view via
React state (`useDashboard` → `viewMode`), with no routing. When a user opened a
network there was no visible "where am I / how do I get back" affordance — only the
network combobox could return them to Summary.

### Fix

- New `src/components/dashboard/DashboardBreadcrumb.jsx` (+ `.css`): state-derived
  path nav, rendered only on a network drill-down view. Shows
  `Dashboard / Summary / <NetworkName>`. "Dashboard" and "Summary" are buttons that
  return to Summary; the trailing crumb is the current location (`aria-current="page"`,
  brighter/heavier). A `← Back to Summary` button sits alongside.
  `<nav aria-label="Breadcrumb">` + `<ol>`, keyboard/focus-visible.
- `src/pages/Dashboard/Dashboard.jsx`: mounts the breadcrumb directly below
  `DashboardHeader`, gated on `!isSummary` — the Summary view (the dashboard's
  starting point) renders no breadcrumb/back button so cards sit directly under the
  header. Derives `networkName` via the existing `groupNetworksBySsid` util (matches
  the combobox label) and wires `onGoSummary` to `setViewMode("Summary")`.

### Scope notes

- Stat-card / panel drill-downs (Open Networks, Encrypted, Vulns/Threats, Clients,
  Severity by Kind, Networks by Encryption) open `DashboardDetailDrawer` overlays
  (own title + close) — Summary stays mounted, so they are intentionally NOT in the
  breadcrumb. Only the real `viewMode` switch (network view) is reflected.
- Presentation-only change; no business logic, data, or backend contract touched.

## HSTS header on both services — fix ZAP "Strict-Transport-Security Header Not Set" — June 28, 2026

### Problem

OWASP ZAP flagged missing `Strict-Transport-Security` header. Backend already had
Helmet HSTS but only via the default (which adds `includeSubDomains`); the frontend
`serve` static server emitted no HSTS at all.

### Fix

- `backend/server.js`: HSTS explicit/conservative — `{ maxAge: 31536000,
  includeSubDomains: false, preload: false }`. Gated by a new `enableHsts` flag
  (`ENABLE_HSTS=true` || `RAILWAY_ENVIRONMENT_NAME` || `RAILWAY_PROJECT_ID` ||
  `NODE_ENV==='production'`) — decoupled from `APP_ENV` so it works on Railway while
  `APP_ENV=staging` (production branch-safety blocker). Off in local dev unless `ENABLE_HSTS=true`.
- `public/serve.json`: added `Strict-Transport-Security: max-age=31536000` header
  (copied to `dist/` at build, applied by `serve -s dist` in prod). No subdomains, no preload.

No auth/route/DB/Supabase/secret changes. `trust proxy` already set (line 42).

---

## Backend-local copy of recommendationMap — fix Railway MODULE_NOT_FOUND — June 28, 2026

### Problem

Railway backend crashed on startup: `Cannot find module '../../src/data/recommendationMap.cjs'`
from `backend/controllers/samController.js` (require stack → `samRoutes.js` → `server.js`).
`backend/controllers/samController.js` and `backend/utils/reportAggregations.js` both required
`../../src/data/recommendationMap.cjs`, which resolves to the **frontend** `src/data/` directory
outside `backend/`. Works locally (monorepo has both dirs) but Railway deploys only `backend/`
as `/app`, so the frontend `src/` is absent. Not a casing issue.

### Fix

- Added backend-local copies `backend/src/data/recommendationMap.cjs` + `recommendationData.json`
  (copied from `src/data/`) so the Railway backend service has no dependency on frontend-only
  source files. Frontend keeps its own ESM mirror (`src/data/recommendationMap.js`) + JSON.
- Updated both requires from `../../src/data/...` → `../src/data/recommendationMap.cjs`.
- Header comment in the backend copy flags the keep-in-sync requirement with the frontend mirror.

Data is now duplicated frontend/backend — intentional, to decouple the deployed backend.

---

## CSP style-src split — unsafe-inline confined to style attributes — June 25, 2026

### Problem

ZAP scan of `http://localhost:5173` (Vite **dev** server) reported 3 Medium CSP alerts:
`script-src unsafe-eval`, `script-src unsafe-inline`, `style-src unsafe-inline`. The two
`script-src` ones are dev-only (Vite HMR / React Fast Refresh) and already absent from the
production policy. `style-src unsafe-inline` was present in dev **and** prod because the app
uses ~103 inline `style={{}}` attributes (13 prod files) + recharts SVG `style=` attributes.

### Fix

Split `style-src` in the three **production** policies so `unsafe-inline` is confined to
**style attributes** only, never element-level styles or scripts:

- `vite.config.js` → `preview.headers` (`vite preview`, :4173)
- `public/serve.json` (→ `dist/serve.json`, Railway `serve -s dist`)
- `backend/server.js` Helmet (`styleSrc`/`styleSrcElem`/`styleSrcAttr`)

New prod directives: `style-src 'self'; style-src-elem 'self'; style-src-attr 'unsafe-inline'`.
Safe because the live app injects **no** `<style>` elements (CSS ships as same-origin `<link>`;
recharts sets styles via the CSSOM `.style` API, which CSP does not govern — see
`node_modules/recharts/es6/util/DOMUtils.js`). Dev policy (`server.headers`) left unchanged —
HMR injects `<style>` blocks and genuinely needs `style-src 'unsafe-inline'`; dev is not the
prod scan target.

### Added: focused safe security tests (XSS / SQLi / brute-force)

New `backend/scripts/sec-xss-sqli-bruteforce.ps1` — controlled, non-destructive probes
against local `:3000` login route, documenting field/route, payload, expected, actual,
verdict + mitigation status. Output: `reports/security_xss_sqli_bruteforce.md`. First run
(2026-06-25): 6/6 PASS — SQLi rejected at validation (400, no leak), XSS not reflected
(JSON 400), brute-force 429 at attempt 6 (`loginLimiter` max 10/15min). Complements the
broad `run-security-tests.ps1`; all three mitigations confirmed already implemented.

### Verification

`npm run build && npm run preview`; header on :4173 confirmed
`script-src 'self'` (no unsafe-eval/inline) and `unsafe-inline` only in `style-src-attr`.
Headless Playwright load of :4173 → React mounted, **0 CSP violations**. Auth-gated Dashboard
(recharts) not runtime-verified through login — low risk (style attributes + CSSOM only).

> **ZAP retest:** scan the **prod build (:4173)**, not the dev server. Both `script-src`
> alerts will be gone. Whether ZAP still raises a `style-src-attr unsafe-inline` alert is
> ZAP-version-dependent; if it does, the only true fix is the inline-style refactor (Option 2).

---

## Auth UI Redesign + Recovery-Link Hardening — June 25, 2026

### Problem

The setup/recovery auth pages (`/force-reset-password`, `/mfa-setup`, `/forgot-password`, `/reset-password`) still used the old light card on a plain blue radial gradient (`Auth.css`) — visually inconsistent with the redesigned dark Login/2FA pages. Separately, a password-reset link for an MFA-enrolled user failed with `401: AAL2 session is required to update email or password when MFA is enabled`, and expired/consumed recovery links showed a slow/vague error.

### Cause

- Setup pages duplicated their own light styling instead of reusing the Login/2FA shell.
- A recovery link establishes an **aal1** session; with a verified TOTP factor, Supabase rejects `updateUser({password})` until the session is elevated to **aal2** — the reset page never ran an MFA step.
- Recovery one-time tokens are single-use; email-provider link scanners (e.g. Gmail prefetch) consume them before the user clicks (`GET /verify → 403 "One-time token not found"`). The page waited on a 2s timeout and surfaced raw/vague text.

### Fix (Frontend only — auth model unchanged: in-memory tokens, `persistSession:false`, no PKCE)

- **Shared auth shell reuse:** all four pages now reuse the Login/2FA design — `AuthBackdrop` + `.login-*` classes from `src/pages/Login/Login.css`. Dropped `./Auth.css` imports from `ForceResetPassword.jsx`, `MFASetup.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`. (`Auth.css` now unimported by any page — left in place, pending deletion approval.)
- **New shared styles appended to `src/pages/Login/Login.css`** (token-based, clearly sectioned): `.auth-heading` (parent-independent heading), `.login-success` alert, `.login-field-error`, `.login-actions` button stack, dark `.auth-button-secondary`, `.code-input`, `.login-loading-text`, and the dark password checklist (`.password-checklist*`). `PasswordChecklist.jsx` / `passwordValidation.js` / `TotpQrDisplay.*` reused unchanged (single source for rules + QR).
- **`src/pages/Auth/ForceResetPassword.jsx`** — reskinned (icon inputs, Eye/EyeSlash toggles, dark checklist); copy: "Set a new password" / "Saving…". Logic untouched.
- **`src/pages/Auth/MFASetup.jsx`** — forced mode = full dark shell (backdrop/brand/footer); self-service mode = inner-only for the Profile modal (contract preserved). `Verify and enable` / `Verifying…`, secondary `Start over` / `Cancel and log out` / `Retry`. Enrollment/verify logic untouched.
- **`src/pages/Auth/ForgotPassword.jsx`** — reskinned; copy per spec. Security: always shows neutral `If an account exists for that email, reset instructions have been sent.` (no account-enumeration); raw backend errors suppressed (generic fallback). API flow unchanged.
- **`src/pages/Auth/ResetPassword.jsx`** —
  - **AAL2/MFA gate:** after the recovery session is established, probes `mfa.getAuthenticatorAssuranceLevel()`; if `aal1→aal2` with a TOTP factor, renders the existing `TwoFactorForm` (login's 6-digit step) to elevate the in-memory session to aal2 before showing the password form. Defensive fallback routes to the MFA step if `updateUser` still returns an `aal2` error.
  - **Consumed/expired/invalid link hardening:** `readLinkError()` reads the URL-hash error params Supabase appends (`error`/`error_code`, e.g. `otp_expired`, `access_denied`) and opens straight into the error state (computed as initial `useState`, no setState-in-effect); the hash is scrubbed via `history.replaceState` so no raw error/token lingers. Single neutral `LINK_INVALID_MESSAGE` + "Request a new reset link" CTA. Never retries a consumed one-time token.
  - No `console`/logging of tokens, links, access/refresh tokens, MFA secrets, or raw auth errors.

### Config follow-up (owner: user, not code)

Supabase dashboard changes still required to stop link-prefetch consumption: switch the Reset Password email template to a `{{ .TokenHash }}`/OTP-style verification, and ensure the redirect URL allowlist covers both prod (`…up.railway.app`) and `localhost:5173` `…/reset-password` origins. PKCE migration deliberately deferred (would require a storage/session-design change to the in-memory model).

### Tests

- ESLint clean on all changed files; `vite build` passes.
- Not browser-verified — manual checklist: `/forgot-password` (neutral message), `/force-reset-password` + `/mfa-setup` (dark shell, toggles, checklist), `/reset-password` with valid link + MFA user (TOTP → password update succeeds) and with expired/consumed link (immediate "Reset link unavailable" + CTA).

### Separately — SAM Available Networks auto-refresh — June 25, 2026

- **`src/hooks/useSAM.js`** `useNetworks` now background-polls `GET /rasPi/networks_list/` (default 15s) so newly detected APs appear without manual reload. Race-guarded via a monotonic request seq, dedupes concurrent requests, pauses on tab hide (`visibilitychange`), keeps the last known list on background-refresh failure, and exposes `refreshing` + `lastUpdated`. No WebSocket/SSE exists; polling chosen per the backend's pull-only `/networks` contract.
- **`src/pages/SAM/SAM.jsx`** passes `networksRefreshing` / `networksUpdatedAt`. **`src/components/sam/SAMSidebar.jsx`** only blanks on initial load (not background refresh), shows a subtle "Updated Xs ago" / "Updating…" / soft-error indicator, preserves search/filter/selection. **`src/pages/SAM/SAM.css`** — `.network-refresh-status` styles.

---

## API Endpoint Audit & Fixes — June 23, 2026

### Problem

Full-stack API endpoint audit (following `backend-agent.md` workflow) revealed 5 issues across the backend and frontend: a security gap, a performance regression, dead code, and stale documentation.

### Findings & Fixes

#### Fix 1 — Missing middleware on `/api/device/status` (security)

**File:** `backend/server.js`

- The legacy `GET /api/device/status` route (line 170) only had `authJWT` in its middleware chain — missing `requireActiveProfile` and `requireAAL2`. A deactivated user or AAL1-only session could call this endpoint. The frontend uses `GET /api/pi/device/status` (which has the full chain), so this was a legacy route with weaker enforcement.
- **Fix:** Added `requireActiveProfile` and `requireAAL2` to the route, plus the corresponding `require()` imports at the top of `server.js`.

#### Fix 2 — Dead frontend API exports (cleanup)

**File:** `src/api/samApi.js`

- `getThreats()` and `getVulnerabilities()` called non-existent backend list endpoints (`GET /sam/threats`, `GET /sam/vulnerabilities`). The backend only has `GET /sam/threats/:idOrName` and `GET /sam/vulnerabilities/:idOrName`. These functions were never imported by any component — pure dead code.
- **Fix:** Removed both dead exports.

#### Fix 3 — Stale comment in `deviceApi.js` (accuracy)

**File:** `src/api/deviceApi.js`

- Line 60 JSDoc listed `'terms'` as a valid `update_type`, but the backend validator (`routeValidators.js`) doesn't accept it and no frontend code sends it.
- **Fix:** Removed `'terms'` from the comment.

#### Fix 4 — Stale endpoint docs in `server.js` (accuracy)

**File:** `backend/server.js`

- Comment block (lines 200–205) documented `GET/POST /api/captivePortal/terms` and `GET /api/captivePortal/terms/history` endpoints that were never implemented in `captivePortalRoutes.js`. No frontend code calls them.
- **Fix:** Removed the three stale `terms` endpoint lines from the comment block.

#### Fix 5 — Redundant profile DB query per request (performance)

**Files:** `backend/middleware/statusMiddleware.js`, `backend/__tests__/integration/userController.test.js`

- `authMiddleware.js` (line 50–67) already queries `profiles.status`, rejects non-active users, and stamps `req.user.profileStatus = profile.status`. Then `requireActiveProfile` — next in every authenticated middleware chain — made the identical Supabase query, doubling DB calls on every request.
- **Fix:** `requireActiveProfile` now checks `req.user.profileStatus` (set by `authJWT`) first. If it's `"active"`, it skips the DB query entirely. Falls back to its own query when `authJWT` didn't run (defense-in-depth preserved).
- **Test update:** `userController.test.js` — the non-superadmin test previously chained 3 `mockImplementationOnce` calls (authJWT + requireActiveProfile + getCurrentUserRole). With the fast path, `requireActiveProfile` no longer hits the mock, so reduced to 2 calls. Also removed a `mockReset()` that was poisoning subsequent tests' mock state.

### Audit Scope

Validated all 55 API endpoints across 13 route files:

| Route File | Endpoints | Auth Chain | Validators | Frontend Match |
|---|---|---|---|---|
| `authRoutes.js` | 5 | Public + limiter | login validated | `authApi.js` |
| `mfaRoutes.js` | 2 | AAL1 for sync, AAL2+superadmin for unenroll | UUID validated | `userApi.js` |
| `webAppRoutes.js` | 2 | Full chain | — | direct |
| `userRoutes.js` | 7 | Full chain + UUID + validators | All validated | `userApi.js` |
| `rasPiRoutes.js` | 5 | Full chain + validators | Scan/network validated | `rasPiApi.js` |
| `samRoutes.js` | 2 | Full chain | — | `samApi.js` |
| `captivePortalRoutes.js` | 8 | Full chain + validators | Announcement/tips/sync | `deviceApi.js` |
| `dashboardRoutes.js` | 4 | Full chain + UUID | UUID validated | `dashboardApi.js` |
| `detectRoutes.js` | 5 | Full chain + validators | Start/stop validated | `detectApi.js` |
| `historyRoutes.js` | 2 | Full chain | — | `samHistoryApi.js` |
| `piProxyRoutes.js` | 6 | Full chain | — | direct |
| `deviceMgmtRoutes.js` | 8 | Full chain + UUID + validators | enable-ap/job-poll/portal-update | `deviceApi.js` |
| `auditRoutes.js` | 3 | Full chain + superadmin | — | `auditApi.js` |

### Tests

- Full backend suite: 32 suites, 471 tests passing.
- Frontend eslint clean.
- No schema, auth contract, or API surface changes.

---

## AP Enable Latency Fix + Async Bug Fixes — June 23, 2026

### Problem

Enabling the access point on the Device Management page was slow (~30–45s worst case on first enable). Separately, 4 bugs were identified in the async AP orchestration flow.

### Cause (Latency)

The enable-AP sync path had 3 sequential Pi network calls blocking the response on first-time enable:

| Step | What | Time cost |
|---|---|---|
| Step 7 | `piFetch('/portal/patch')` — portal init (first enable only) | up to 15s |
| Step 8 | `piFetch('/orchestrate/apply')` — actual AP enable | up to 15s |
| Step 10 | `piFetch('/portal/patch')` — post-enable content push | up to 10s (no timeout!) |

Step 10 was redundant on first-time enable (Step 7 already pushed the same content) and blocked the response even though it's non-fatal. On subsequent enables, Step 10 still blocked with its own `buildPortalPayloadFromDB` (5–8 DB queries) + Pi call.

### Fix (Latency)

**File:** `backend/routes/deviceMgmtRoutes.js`

1. **Step 10 skipped when Step 7 just ran** — eliminates the duplicate `portal/patch` + duplicate `buildPortalPayloadFromDB` on first-time enable. Saves ~10–15s + 5–8 DB queries.
2. **Step 10 is fire-and-forget via `setImmediate`** for subsequent enables — the response is sent immediately after `orchestrate/apply` succeeds; the portal patch runs asynchronously.
3. **All `piFetch('/portal/patch')` calls now have explicit `timeoutMs: 15_000`** — prevents the old 10s default from causing inconsistent behavior.

| Scenario | Before | After |
|---|---|---|
| First-time enable — sequential Pi calls | 3 (portal init + orchestrate + portal again) | 2 (portal init + orchestrate) |
| First-time enable — `buildPortalPayloadFromDB` calls | 2 (5–8 queries each) | 1 |
| First-time enable — response latency | ~30–45s worst case | ~15–30s worst case |
| Subsequent enable — Pi calls blocking response | 2 (orchestrate + portal) | 1 (orchestrate only) |
| Subsequent enable — portal patch | Blocks response, up to 10s | Fire-and-forget after response sent |

### Bugs Fixed

#### Bug A — Orphaned job recovery (critical)

**File:** `backend/routes/deviceMgmtRoutes.js`

If the server restarted mid-job, the in-memory `apJobStore` lost the job record. Subsequent client polls to `GET /jobs/:jobId` found no stored job and returned `UNKNOWN` indefinitely. The DB lock (`ap_apply_in_progress`) was never released.

- **Fix:** Added `recoverOrphanedJob()` function. When `GET /jobs/:jobId` reaches a terminal Pi state (DONE or FAILED) but has no stored job, it queries Pi `/device/status` for authoritative AP state, reconciles the DB (`ap_enabled`, `ap_last_applied_at`), runs post-enable portal patch if AP is on, and releases the lock.

#### Bug B — Portal seed timeout misclassification (moderate)

**File:** `backend/routes/deviceMgmtRoutes.js`

Portal init timeout (504 from `piFetch`) in Step 7 propagated to the outer catch which checked for 502/503/504 and entered AP-toggle reconciliation — misleading because `orchestrate/apply` was never called.

- **Fix:** Wrapped Step 7 `piFetch('/portal/patch')` in its own try/catch. The catch returns `PORTAL_PATCH_FAILED` directly instead of falling through to the outer reconciliation branch.

#### Bug C — Concurrent finalization (minor)

**Files:** `backend/services/apJobStore.js`, `backend/routes/deviceMgmtRoutes.js`

Two concurrent poll requests hitting a terminal job state could both run `finalizeJob()`, triggering duplicate DB writes and duplicate Pi portal/patch calls.

- **Fix:** Added `tryAcquireFinalizing(jobId)` / `releaseFinalizingLock(jobId)` / `isFinalizing(jobId)` to `apJobStore.js`. `finalizeJob()` acquires the lock at the top; concurrent callers get a "finalizing" response instead of re-running the same DB writes.

#### Bug D — Frontend UNKNOWN polling (minor)

**File:** `src/hooks/useDevice.js`

A single `UNKNOWN` from `GET /jobs/:jobId` shouldn't fail immediately (Pi might be briefly unreachable), but the frontend would silently poll for up to 5 minutes without surfacing an error.

- **Fix:** Added `MAX_UNKNOWN_STREAK = 6` counter. After 6 consecutive `UNKNOWN` responses (~15s at 2.5s interval), the frontend synthesizes a `FAILED` response with `PI_UNREACHABLE` error code and surfaces "Lost contact with device" to the user.

### Tests

**File:** `backend/__tests__/integration/deviceMgmt.test.js`

- First enable test: Updated expectations from 2 → 1 `buildPortalPayloadFromDB` calls, 3 → 2 fetch calls (no redundant second portal/patch).
- Second enable test: Renamed, added `await new Promise((r) => setImmediate(r))` to drain deferred callback, updated to expect 2 fetch calls (orchestrate/apply + deferred portal/patch).
- Full backend suite: 32 suites, 471 tests passing.

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
| `buildRecommendations(vtCode, kind)` | Returns finding-specific recommendation objects (text, resolved source label/URL, related threat/vuln, evidence, priority) from `src/data/recommendationMap.cjs`. Replaced the former `defaultRecommendations()` generic `{ nist, owasp }` arrays. |
| `defaultDescription(vtName, vtCode)` | Generates a default description string from the name and code        |

> **Note:** The legacy `defaultRecommendations()` (generic `{ nist, owasp }` arrays) and the backend report `REMEDIATION_CATALOG` have both been replaced by the conditional mapping in `src/data/recommendationMap.cjs` (single source of truth). Modal detail responses and report remediation/recommendations now carry per-finding standards sources (NIST SP 800-97/153, ITL Bulletin) with clickable URLs.

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
