# Frontend Audit & Implementation Plan

Audit date: 2026-06-07. Scope: React frontend (`src/`, 73 JS/JSX files). Stack: React 19 + Vite + React Router v7 + Axios + Supabase Auth (hybrid w/ custom backend), Context API, plain CSS, Playwright E2E only (no unit tests, no TypeScript).

Hardware context: the system includes a Raspberry Pi running a FastAPI agent (Kismet-backed Wi-Fi scanning/detection, AP/uplink orchestration, captive portal), fronted by Nginx (`:9000`). The React frontend never talks to the Pi directly — it goes through `rasPiApi.js`/`detectApi.js`/`deviceApi.js` → web backend → Pi proxy. Endpoint mapping confirms the frontend's polling-based design (no websockets) is correct for this architecture, and the Pi's own docs confirm its async jobs are **in-memory and lost on process restart** — which justifies (not over-engineers) the bounded-reconciliation pattern in `useDevice.js`.

---

## Implementation Status (as of 2026-06-07)

- **Phase 1 — Critical Fixes: ✅ DONE.** All 4 items implemented and verified (`vite build`). See checklist + correction notes below.
- **Phase 2 — Production Hardening: ✅ DONE.** `useApiResource` hook + 4-hook refactor, toast/banner system, inline `UserForm` validation, `getApiErrorMessage` utility. See checklist + notes below.
- **Phase 3 — UX/UI Enhancements: ✅ DONE.** `Spinner`, `EmptyState`, route-level code splitting (bundle 1,038 KB → 452 KB), dead-code cleanup. See checklist + notes below.
- **Phase 4 — Scalability Improvements: ❌ NOT IMPLEMENTED — deferred.** File splitting (`SAM.jsx`, `AccountsAudit.jsx`, `useDevice.js`, `useSAM.js`), TypeScript migration, `react-hook-form`+`zod` adoption all remain untouched. Decision: stop after Phase 1-3 (done/verified) and treat Phase 4 as backlog for a dedicated future planning session — these are large architectural undertakings (TS migration alone rated "High effort" by this audit), not drop-in refactors.

---

## Executive Summary

**Score: ~6.5/10** — solid auth + hardware-integration foundations, but a known mock-data gap, near-zero accessibility, no code-splitting, no TypeScript, and several oversized components.

**Production Readiness: Needs Improvement** (not "Not Ready" — core flows including hardware/device orchestration work well; blockers are concrete and mostly low-effort).

**Key strengths:**
- Hybrid Supabase + backend auth: in-memory access token + HttpOnly refresh cookie (`src/api/axios.js`, `src/lib/supabaseClient.js:8` — `persistSession: false`, no localStorage leakage)
- Centralized Axios client with single-flight 401-refresh queue and prod env validation (`src/api/axios.js`)
- Feature-folder organization (`components/sam/`, `components/accounts/`, `components/device/`, etc.)
- `wf:`-prefixed sessionStorage scoping via `useSessionState`, cleared on logout
- `useDevice.js` + `AccessPointPanel.jsx`: 30+ mapped hardware/backend error codes (`useDevice.js:404-505`), bounded reconciliation on gateway timeouts (3s/10s/20s/35s/50s/60s checks), deterministic priority-ordered status banners — genuinely production-grade hardware-offline handling and the in-house exemplar for error UX

**Major concerns:**
- `useThreats`/`useVulnerabilities` (`src/hooks/useSAM.js:54-89`) still return hardcoded mock data; real fetch is commented out (`// TODO: uncomment when backend is ready`) even though the backend endpoint already exists
- Near-zero accessibility: ~130 onClick handlers on non-semantic `<div>`s, no ARIA live regions, no focus management in modals
- `/test-auth` debug route (1169-line QA harness) is registered unconditionally in the production route table (`src/App.jsx:20,105`)
- No code-splitting — single eager-loaded bundle (React 19 + Recharts + Supabase + all 7 pages)

---

## Architecture Assessment — Score: 7/10

Feature-folder structure is sound and scales reasonably. Context API + custom `useSessionState` hook is a pragmatic, low-dependency choice over Redux — appropriate for app size.

**Risks:**
- `ThreatDetectionContext` couples global polling to the component tree (single point of failure for live data)
- No API-error normalization layer — the same `err.response?.data?.error || err.message || "fallback"` block is duplicated identically across `useDashboard.js:90`, `useAuditLogs.js:57`, `useSAM.js:33-35`, `useUsers.js`
- No route-level code splitting

**Recommendations:** extract a shared `useApiResource`/`useFetch` hook to collapse the duplicated fetch/loading/error boilerplate (4+ near-identical copies); introduce `React.lazy` + `Suspense` per route.

---

## Findings

### Critical Issues

| Area | Issue | Impact | Recommendation | Effort |
|---|---|---|---|---|
| Data integrity | `useThreats`/`useVulnerabilities` (`src/hooks/useSAM.js:54-89`) ship a hardcoded mock threat array; real API call commented out (`// TODO: uncomment when backend is ready`, lines 76-78). Backend endpoint already exists — known dev placeholder, not a sign of incomplete hardware integration | Security dashboard shows fake data in production — could mislead users about actual threat status | Uncomment `getThreats()`/`getVulnerabilities()` calls, remove mock fallback array | Low |
| Secret hygiene | `.env` and `backend/.env` are git-tracked (introduced in commit `40d3be3`) and currently show as modified, despite `.gitignore` listing `.env`/`.env.*` — the gitignore rule was added after the initial commit, so the files were never untracked | Supabase URL/anon-key and backend secrets live in git history; the Supabase anon key is public-by-design but `backend/.env` may hold real secrets | `git rm --cached .env backend/.env`, confirm `.gitignore` takes effect, rotate any real backend secrets | Low |
| Accessibility | ~130 onClick handlers on `<div>`/non-interactive elements instead of `<button>` (e.g. `src/components/sam/ThreatsTable.jsx:145-149` sortable headers, `AccessPointPanel.jsx`); no `tabIndex`, no ARIA live regions for async status, no alt text found | Keyboard/screen-reader users cannot operate core tables and controls — WCAG 2.1 A failures | Convert clickable divs to `<button>`/semantic elements; add `aria-live` regions for async status; add focus trap + `aria-modal` to modals | Medium-High |
| Debug surface | `/test-auth` route (`TestAuth.jsx`, 1169 lines) registered unconditionally in `src/App.jsx:20,105` | QA harness with auth-gate testing exposed to any authenticated user in production | Gate behind `import.meta.env.DEV` or remove from the prod route table | Low |

### Recommended Improvements

| Area | Issue | Impact | Recommendation | Effort |
|---|---|---|---|---|
| Error UX | Errors surfaced inconsistently — some via `<p className="error-text">`, one via `alert()` (`UserForm.jsx:95-116`), most hooks fall back to raw `err.message`. Meanwhile `useDevice.js:404-505` already maps 30+ hardware/backend error codes to friendly, actionable copy with deterministic banners — proof the team can do this well | Confusing/inconsistent feedback; `alert()` blocks the UI thread; rest of the app doesn't match the bar `useDevice` already set | Generalize the `useDevice` error-code-mapping pattern into a shared utility; adopt a single toast/inline-banner convention app-wide; ban `alert()` for validation | Medium |
| Error leakage | Raw backend error strings shown verbatim to users: `useDashboard.js:90`, `Login.jsx:92-95`, `useAuditLogs.js:57` (`err.response?.data?.error`) | Risk of leaking internal details (DB errors, stack hints) | Map known error codes to friendly copy; log raw errors to console/server only | Low-Medium |
| Code duplication | Identical fetch/loading/error try-catch-finally block duplicated across `useDashboard`, `useSAM`, `useUsers`, `useAuditLogs` (~4 copies, ~15 lines each) | Maintenance burden — a fix in one must be repeated in all | Extract a shared `useApiResource(fetchFn)` hook | Low |
| Component size | `TestAuth.jsx` (1169 lines), `AccountsAudit.jsx` (628), `useSAM.js` (598), `SAM.jsx` (570), `useDevice.js` (554) | Hard to review/test/extend; mixed concerns (data + UI + orchestration) | Split into container + presentational components and per-concern hooks | Medium |
| Form validation | Manual regex/field checks scattered (`passwordValidation.js`, `UserForm.jsx:95-116` using `alert()`, `AuditLogsTable.jsx:262-276`); no schema library | Inconsistent validation UX, error-prone manual checks | Adopt `react-hook-form` + `zod` (or centralize and standardize the manual approach) | Medium |
| Loading UX | Every page shows plain `"Loading..."` text (`Dashboard.jsx:40`, `App.jsx:54`, `DeviceManagement.jsx:88`) — no skeletons/spinners | Feels unfinished; layout shift on data arrival | Add a lightweight skeleton/spinner component, reuse across pages/tables | Low-Medium |
| Code splitting | Zero `React.lazy`/`Suspense`/dynamic import — entire app (Recharts, Supabase, all 7+ pages) ships in one bundle | Slower initial load, especially on constrained networks | Route-level `React.lazy` + `Suspense` per page in `App.jsx` | Low-Medium |

### Optional Enhancements

| Area | Issue | Impact | Recommendation | Effort |
|---|---|---|---|---|
| Dead code | Commented imports/functions: `useSAM.js:2`, `useUsers.js:4-7,82-99` (18-line commented function), unused `PasswordChecklist` import in `ResetPassword.jsx:6` | Minor noise | Delete commented code, run an unused-import lint rule | Low |
| Empty states | Inconsistent: `AuditLogsTable` has a full empty-state UI (`:283-341`); `ThreatsTable`/`VulnerabilitiesTable` compute `hasThreats`/`hasVulns` flags but render no explicit empty message | Minor UX inconsistency | Standardize a shared `<EmptyState />` component | Low |
| ErrorBoundary | `ErrorBoundary.jsx` only logs to console and shows a generic, hardcoded "Device panel" message regardless of where it's mounted | Misleading copy if reused; no telemetry hook | Make the message prop-driven; consider wiring to error tracking | Low |
| Re-render | Inline style objects/arrow fns in `AccessPointPanel.jsx:137,168,185,195,205,216` recreated per render | Negligible at current scale | Extract to CSS classes or memoize if profiling shows impact | Low |
| TypeScript | `@types/react` present in devDeps but project is pure JS/JSX, no `tsconfig.json` | Type-safety debt grows with codebase size | Incremental migration, starting with `api/` and `hooks/` | High |

---

## File-Level Review

- **`src/hooks/useSAM.js`** — mock data + commented-out fetch (critical); 598 lines mixing 4 concerns (networks/threats/vulns/detail) — split into per-concern hook files
- **`src/pages/TestAuth/TestAuth.jsx`** — 1169-line debug harness shipped to the prod route table
- **`src/components/accounts/UserForm.jsx`** — `alert()`-based validation; should use inline error display matching the rest of the app
- **`src/api/axios.js`** — well-built (token refresh queue, env validation) — exemplar, do not change the design
- **`src/hooks/useDevice.js` + `src/components/device/AccessPointPanel.jsx`** — exemplar for hardware-aware error UX (30+ mapped error codes, bounded reconciliation, deterministic banners); generalize this pattern for reuse by `useDashboard`/`useSAM`/`useAuditLogs`
- **`src/components/common/ErrorBoundary.jsx`** — generic/hardcoded messaging, console-only logging
- **`src/components/sam/ThreatsTable.jsx` / `VulnerabilitiesTable.jsx`** — near-duplicate filter UI, non-semantic clickable headers

---

## What Should NOT Be Changed

- **`src/api/axios.js`** token-refresh design — in-memory token + HttpOnly cookie + single-flight refresh queue is genuinely solid and matches OWASP guidance for SPA token storage
- **Feature-folder structure** (`components/sam/`, `components/accounts/`, etc.) — sound, scales fine
- **`useSessionState` / `wf:`-prefix sessionStorage scoping** — clean, tab-scoped, cleared on logout
- **Centralized API service-module layer** (`api/*Api.js`) — no scattered fetch/axios calls in components
- **`useDevice.js`/`AccessPointPanel.jsx` hardware-error handling** — this is the pattern other hooks should copy, not the other way around

---

## Phased Implementation Plan

### Phase 1 — Critical Fixes (blockers before production)
*Effort: Low-Medium overall*

- [x] ~~Uncomment/wire `useThreats`/`useVulnerabilities` to the existing backend endpoints~~ — **correction:** no `/sam/threats` or `/sam/vulnerabilities` list endpoint exists on the backend (`samRoutes.js` only has detail-by-id routes); real threat data already flows via `useThreatDetectionContext`/`displayThreats` (rendered in `SAM.jsx:508`). The `threats` mock array was dead/unrendered. Removed the mock state, commented fetch effect, and unused `getThreats`/`getVulnerabilities` imports from `useSAM.js`
- [x] `git rm --cached .env backend/.env` — done, files stay on disk, `.gitignore` now matches them (verified via `git check-ignore`). **Still needs you:** rotate any real secrets in `backend/.env`
- [x] Dev-gated `/test-auth` route (`src/App.jsx`) — wrapped in `import.meta.env.DEV` + `React.lazy`; verified via prod build that `TestAuth` is fully tree-shaken out of the bundle
- [x] Accessibility: converted clickable `<div>`/`<td>`/`<th>`/`<tr>` to `<button>` in `ThreatsTable.jsx` (sort headers, expand toggle, view action) and `VulnerabilitiesTable.jsx` (sort headers, group-header row, view action) with `aria-expanded`/`aria-label`; added a shared `useFocusTrap` hook (`src/hooks/useFocusTrap.js`) wired into `BaseModal` (covers `StopDetectionModal`/`ScanConfirmModal`/`LogoutConfirmModal`/`AccountsAuditModal`), `FindingDetailModal`, and `RawEvidenceModal` — focus trap, `role="dialog"`, `aria-modal`, Escape-to-close, focus restore on close. **Note:** `AccessPointPanel.jsx` already used semantic `<button>`s throughout — no changes needed there (audit's line refs pointed to the unrelated inline-style/re-render finding)

### Phase 2 — Production Hardening (reliability/maintainability)
*Effort: Medium*

- [x] Extract a shared `useApiResource(fetchFn)` hook (`src/hooks/useApiResource.js` — wraps loading/error/`getApiErrorMessage` + an `isStale` guard for cancellable fetches); refactored `useDashboard`, `useSAM`'s `useNetworks`, `useUsers`, `useAuditLogs`'s `fetchAuditLogs` to use it. `useAuditLogs`'s `handleExport` left untouched — different shape (rate-limiting, validation, boolean return, separate `exportError` state), doesn't fit the resource-fetch pattern
- [x] Replaced `alert()`-based validation in `UserForm.jsx:95-116` with inline `validationError` state + `.form-validation-error` block (`role="alert"`)
- [x] Built `ToastProvider`/`useToast` (`src/context/ToastContext.jsx`) + `Toast` component (`src/components/common/Toast/`), mounted at app root in `App.jsx`. Converted the **result-feedback** `alert()`s to toasts: `SAM.jsx` (scan failed, network saved, save failed, stop-detection failed) and `AccountsAudit.jsx:198`. **Scope call:** left pre-action validation-gate `alert()`s as-is (`SAM.jsx` "select a network first" etc., `AccessPointPanel.jsx:96`, `exportReport.js:10`) — those block the flow until acknowledged; swapping to a non-blocking toast changes that semantic and would need its own UX pass, not a drop-in replacement
- [x] Generalize error messaging — see correction note below (built `getApiErrorMessage` instead of a literal `mapApiError` switch, since these backends return friendly strings, not machine codes like the Pi backend)

### Phase 3 — UX/UI Enhancements (usability)
*Effort: Low-Medium*

- [x] Added `Spinner` component (`src/components/common/Spinner/`, supports `fullScreen`); replaced `"Loading..."` text in `Dashboard.jsx:40`, `App.jsx` (auth bootstrap + lazy-route `Suspense` fallback), `DeviceManagement.jsx:89`
- [x] Built shared `<EmptyState />` (`src/components/common/EmptyState/`); applied to `ThreatsTable`/`VulnerabilitiesTable`, removed the now-dead `.empty-state` rule from `SAM.css`
- [x] Route-level code splitting in `App.jsx` — all 10 page imports converted to `React.lazy` + single `Suspense` boundary around `<Routes>`. Verified via `vite build`: main bundle dropped from 1,038 KB → 452 KB, pages now ship as separate on-demand chunks
- [x] Cleaned dead/commented code: `useSAM.js:2` commented import removed; `useUsers.js` dead `addUser`/commented `updateUserById`/`deleteUserById` blocks removed (folded into the `useApiResource` refactor above, same file/function). **Correction:** `PasswordChecklist` in `ResetPassword.jsx:6` is **not** dead — used at `ResetPassword.jsx:173`; audit claim was wrong (4th correction this session), left untouched

### Phase 4 — Scalability Improvements (future-proofing)
*Effort: Medium-High* — **Deferred to a dedicated future session** (decision: stop after Phase 1-3, which are done/verified). These are large architectural undertakings (TS migration alone is rated High effort and the audit recommends treating it as an ongoing background effort, not a milestone), not drop-in refactors — they warrant their own planning pass rather than tacking onto this one.

- [ ] Split oversized files: `SAM.jsx` (570L), `AccountsAudit.jsx` (628L), `useDevice.js` (554L), `useSAM.js` (598L) into container/presentational components + per-concern hooks
- [ ] Incremental TypeScript migration starting with `src/api/` and `src/hooks/` (lowest-risk, highest type-safety payoff)
- [ ] Adopt `react-hook-form` + `zod` to replace scattered manual validation (`passwordValidation.js`, `UserForm.jsx`, `AuditLogsTable.jsx`)

---

## Quick Wins (< 1 day each)

- Remove dead/commented code
- Gate or remove `/test-auth` from the prod build
- Untrack `.env` files from git
- Add `aria-label`s to icon-only buttons
- Replace `alert()` in `UserForm` with inline error display

---

## Top Priorities (ranked)

1. Untrack `.env` files + rotate secrets — irreversible exposure risk, lowest effort
2. Wire up real threat/vulnerability data — known placeholder, dashboard currently shows fake security data
3. Remove `/test-auth` from production routes — unnecessary attack/debug surface
4. Accessibility pass on tables/modals — biggest production-readiness gap, WCAG A failures
5. Generalize `useDevice` error-mapping pattern app-wide — turns the best-handled feature into the standard
6. Extract `useApiResource` hook — removes 4+ duplicated boilerplate blocks in one move
7. Route-level code splitting — straightforward perf win, single change in `App.jsx`
8. Standardize loading/empty states — consistent, low-risk UX polish
9. Split oversized components/hooks — improves long-term maintainability
10. Incremental TypeScript migration — highest long-term payoff, correctly sequenced last (depends on stable API/hooks layers from earlier phases)

---

## Final Verdict

1. **Is the architecture solid?** Yes — feature-folder organization and Context-based state management are appropriate for the app's size; the main structural debt is duplicated fetch logic and a few oversized files.
2. **Is it maintainable?** Mostly — the API layer and hardware-error-handling code are genuinely good models; the gap is that other parts of the app don't yet follow those models consistently.
3. **Is it scalable?** With caveats — no code-splitting and no TypeScript will increasingly cost as the app grows; both are addressable incrementally without a rewrite.
4. **Is the UI/UX production quality?** Functional but not polished — inconsistent loading/empty/error states are the main gaps.
5. **Is it accessible?** No — this is the single biggest production-readiness gap (WCAG 2.1 A failures on core interactive elements).
6. **Is it secure?** The runtime security model is actually a strength (token handling, HttpOnly cookies, centralized API client, no XSS vectors found). The one real security finding is that `.env` files are git-tracked.
7. **Is it production-ready?** Needs improvement, not "not ready" — the blockers (Phase 1 list above) are concrete and mostly low-effort.
8. **Top 10 improvements:** see ranked list above.
9. **What should not change:** `api/axios.js` token design, feature-folder structure, `useSessionState`/`wf:` pattern, centralized API service layer, `useDevice`/`AccessPointPanel` hardware-error handling.
10. **Lead Architect's plan before shipping:** Execute Phase 1 in full (all four items are low-to-medium effort and remove the actual blockers), then Phase 2's error-handling generalization (it compounds — every later phase benefits from a single error-mapping convention). Phases 3 and 4 can run in parallel once 1-2 are stable; treat the TypeScript migration as an ongoing background effort rather than a milestone to "complete."
