# CLAUDE.md

This file = project context + immutable repo facts + entry point. For engineering philosophy, workflow, coding conventions, and decision-making rules, see **[`.claude/rules.md`](rules.md)**.

## Engineering Rules

Before implementing features, fixing bugs, refactoring, or making architectural changes, consult `.claude/rules.md` first.

- `CLAUDE.md` (this file): project context and non-negotiable repository facts — what the system is, how it's structured, and constraints that must never be violated.
- `rules.md`: engineering philosophy and coding conventions — how to make decisions, what pattern to follow when several exist, and the pre-completion checklist to run before calling work done.

The two files don't duplicate each other. If a fact and a convention seem related, the fact lives here and the convention lives in `rules.md`, cross-referenced.

---

## Project Overview

**Why-PII?** — Wi-Fi security assessment tool. React/Vite frontend + Express/Node backend + Supabase (Postgres) + Raspberry Pi running FastAPI as a field probe. Browser never talks to Pi directly — Express relays all Pi commands, HMAC-signing every request.

**Monorepo with two independent npm projects**: root (frontend) and `backend/` (Express API). Run `npm install` in each separately.

---

## Architecture

### Backend

Layering: `routes/` → `controllers/` → `services/` + `repositories/` → `config/supabaseClient.js`. (See `rules.md` → Architecture Awareness for the behavioral rules around this layering.)

New pure-function logic goes in `backend/utils/` — it's fully unit-tested and has enforced coverage thresholds. Most scoring/formatting bugs belong there, not in controllers.

- `scoring.js` / `riskPipeline.js`: `bucketize(score)` maps 0–100 (from Supabase RPC `compute_scan_risk`) → `LOW/MEDIUM/HIGH/CRITICAL`. Also handles version bumping and auto-portal-patching with cooldown (`PORTAL_PATCH_COOLDOWN_MS`).
- `signing.js` + `piFetch.js`: HMAC-SHA256. Canonical string: `METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nBODY_SHA256`, sent as `X-Control-*` headers. Secret = `CONTROL_SIGNING_SECRET` (must match Pi-side verifier — see `docs/feature-notes/PI_SIGNING_README.md`).

`requireSuperadmin` (roleMiddleware) writes `AUTHORIZATION.DENIED` audit events on denial — don't remove this side effect.

`/health` is intentionally mounted before all middleware (uptime probes must not require auth).

`detectStateService.startServerHeartbeatLoop()` runs server-side, independent of browser tabs — threat detection must not depend on a tab being open.

In-memory rate limiter resets on restart and is not multi-instance safe — known limitation, don't make it worse.

### Frontend

JWT is in-memory only — never persisted to localStorage/sessionStorage. Refresh via `HttpOnly` cookie (`sb_refresh`). Set `CROSS_ORIGIN_COOKIES=true` server-side when frontend/backend are on different domains (switches to `SameSite=None; Secure`).

`/test-auth` is a dev-only QA harness — excluded from production builds via `import.meta.env.DEV`. Keep it that way.

`ThreatDetectionProvider` wraps the entire authenticated route tree — a single global polling loop, not per-page.

### Pi / FastAPI

Pi controllers: `rasPiController.js`, `detectController.js`, `captivePortalController.js`, `piProxyController.js`. All use `piFetch`/`signing.js`.

`FASTAPI_BASE_URL`: Tailscale Funnel URL in prod, `127.0.0.1:8000` in dev. Pi-side nginx only forwards via Funnel ports 443/8443/10000 — port 9000 is internal-only.

---

## Non-Negotiables

**Never leak error details to clients.** The global error handler in `server.js` returns only `{error, message}` — never forward `err.message` or stack traces. Preserve this on every new error path.

**Zero raw SQL.** All DB access via Supabase JS SDK. Migrations in `backend/migrations/*.sql`.

**CSP is defined in two places that must stay in sync:** `backend/server.js` (Helmet) and `vite.config.js` (dev/preview headers). Changing one without the other breaks parity.

**Auth middleware checks `profiles.status === 'active'` on every authenticated request** — deactivated/on_hold users are rejected even with a valid JWT. Don't short-circuit this in new routes.

**The axios 401 refresh is in `src/api/axios.js` only.** It queues a single `auth/refresh` call (via HttpOnly cookie) then retries. Do not duplicate this logic in individual API modules.

---

## Testing — Repo Facts

Backend: Jest + supertest, mocked at the `supabaseClient` boundary. Coverage thresholds are enforced for `utils/` and `middleware/` only (not `controllers/`/`services/`/`routes/`) in `backend/jest.config.js`.

For testing strategy and what's expected when adding new code, see `rules.md` → Testing & Verification.

---

## Known Pitfalls / Watchlist

- `src/api/deviceApi.js` has a hardcoded `localhost:3000` URL — it should use the shared axios instance. Don't copy this pattern; fix it if you touch this file.
- In-memory rate limiter is not multi-instance safe.
- Full security posture: `docs/SECURITY_AND_RISKS.md` and `docs/feature-notes/SECURITY_HARDENING_PLAN.md`.
- Feature-specific notes: `docs/feature-notes/*.md`.

---

See `.claude/rules.md` for engineering philosophy, workflow, coding conventions, and the pre-completion checklist.

---

## Documentation Navigation

`docs/` holds detailed docs; this file stays repo-facts-only. Full categorized index with status/last-verified: **[`docs/DOCUMENTATION_INDEX.md`](../docs/DOCUMENTATION_INDEX.md)** — check it first when unsure which doc is canonical.

Load docs by task, not exhaustively:

- **Core project understanding** — `docs/PROJECT_CONTEXT_AND_PRD.md` (tech stack, repo map, reading order).
- **Frontend dev / UI-UX redesign** — `docs/FRONTEND_ARCHITECTURE.md`, `docs/COMPONENT_REFERENCE.md`, `docs/PAGES_ROUTES_AND_USER_FLOWS.md`, `docs/STATE_MANAGEMENT.md`, `docs/UI_UX_SYSTEM_REFERENCE.md`. Read all five before touching frontend structure — they cover folder layout, component inventory, routing/nav flows, state/contexts, and the implemented design system respectively. **Before any redesign work**, review these to preserve existing routing, component hierarchy, state contracts, and backend contracts (`docs/API_INTEGRATION_CONTEXT.md`); redesign should change presentation, not business logic.
- **Backend dev** — relevant `docs/feature-notes/*_README.md` for the feature being touched (e.g. `DASHBOARD_README.md`, `DEVICE_MANAGEMENT_README.md`, `AP_ENABLE_PORTAL_README.md` + `ASYNC_AP_README.md` for AP/captive-portal work).
- **API dev** — `docs/API_INTEGRATION_CONTEXT.md` (frontend API modules, backend endpoints, refresh/MFA flows).
- **Authentication & Authorization** — `docs/AUTHENTICATION_AND_AUTHORIZATION.md` (canonical, §11 = mandatory TOTP MFA/AAL2). `docs/MFA_AUTHENTICATION_PLAN.md` is superseded by §11 — historical only.
- **Security** — `docs/SECURITY_AND_RISKS.md` (canonical posture) + `docs/feature-notes/SECURITY_HARDENING_PLAN.md` for in-progress hardening work.
- **Raspberry Pi / FastAPI / hardware comms** — `docs/feature-notes/PI_SIGNING_README.md` (HMAC scheme) and `docs/feature-notes/API_PY_AND_PUBLIC_PROXY_CONTEXT.md` (Pi-side FastAPI + proxy).
- **Deployment** — `docs/BUILD_DEPLOYMENT_RUNTIME.md` + `docs/feature-notes/RAILWAY_DEPLOY_GUIDE.md`.
- **Feature implementation** — check `docs/feature-notes/CHANGES_README.md` first for recent cross-file history, then the feature's own `*_README.md` if one exists.
- **Large features / architecture / security changes / major frontend redesign** — don't stop at one doc; pull every doc listed under the relevant category above plus `docs/DOCUMENTATION_INDEX.md`'s "Related" column for that doc.

Documentation maintenance:

- Docs are part of the codebase — update them when implementation changes, in the same change, not as separate cleanup.
- Source code is the ultimate source of truth; if a doc and the code disagree, trust the code and fix the doc.
- Mark superseded planning/implementation docs as **superseded** (banner + pointer to the replacement) rather than deleting them — see `MFA_AUTHENTICATION_PLAN.md` for the pattern.
- Cross-reference related docs instead of duplicating their content.
- New docs get added to `docs/DOCUMENTATION_INDEX.md`'s table, not just dropped in `docs/`.
