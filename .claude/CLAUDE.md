# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Why-PII?** is a full-stack Wi-Fi security assessment tool: a React (Vite) frontend, an Express/Node backend, Supabase (Postgres) for data, and a Raspberry Pi running FastAPI as a field probe. The browser never talks to the Pi directly — Express relays commands to it over a Tailscale Funnel tunnel, HMAC-signing every request.

This is a monorepo with **two independent npm projects**: the root (frontend) and `backend/` (Express API), each with their own `package.json`/`node_modules`.

## Commands

### Frontend (run from repo root)

```bash
npm install
npm run dev            # Vite dev server, http://localhost:5173 (proxies /api -> localhost:3000)
npm run build           # production build to dist/
npm run preview         # preview built bundle
npm run lint            # eslint .
```

### Backend (run from backend/)

```bash
cd backend
npm install
cp .env.example .env    # fill in Supabase keys, CONTROL_SIGNING_SECRET, etc.
npm start                # node server.js, http://localhost:3000
npm run start:dev        # APP_ENV=development node server.js
npm test                  # full Jest suite (unit + integration)
npm run test:unit         # only __tests__/unit
npm run test:integration  # only __tests__/integration
npm run test:coverage     # with coverage thresholds (utils/, middleware/)
npm run test:watch
npm run lint:security     # scripts/lint-security.ps1 (PowerShell, ZAP-related checks)
```

Run a single backend test file:

```bash
cd backend
npx jest __tests__/unit/scoring.test.js
npx jest __tests__/integration/detectController.test.js
```

### E2E (Playwright, run from repo root)

```bash
npm run test:e2e          # auto-starts backend (3000) + frontend (5173) per playwright.config.js
npm run test:e2e:headed
npm run test:e2e:ui
npx playwright test e2e/device-management.spec.js   # single spec
```

## Architecture

### Backend layering

`routes/*.js` (mounted under `/api/*` in `server.js`) → `controllers/*.js` → `services/` and `repositories/*.js` → `config/supabaseClient.js`. Zero raw SQL — all DB access via the Supabase JS SDK. Schema migrations live in `backend/migrations/*.sql`.

Key middleware (`backend/middleware/`):
- `authMiddleware.js` — `authJWT`/`optionalAuthJWT`: verifies Supabase-issued JWTs via JWKS (ECC P-256), then checks `profiles.status === 'active'` on **every** authenticated request (rejects deactivated/on_hold users even with a valid JWT).
- `statusMiddleware.js` (`requireActiveProfile`) and `roleMiddleware.js` (`requireSuperadmin`) — additional per-route checks; `requireSuperadmin` also writes `AUTHORIZATION.DENIED` audit events.
- `rateLimiter.js` (global limiter, in-memory — resets on restart, not multi-instance safe), `requestIdMiddleware.js`, `validateUUID.js`.

`backend/utils/` holds dependency-free, fully unit-tested logic — this is where most scoring/formatting bugs should be fixed:
- `scoring.js`, `riskPipeline.js` — `bucketize(score)` maps a 0–100 score from the Supabase RPC `compute_scan_risk` to LOW/MEDIUM/HIGH/CRITICAL; also handles version bumping and auto-portal-patching with a cooldown (`PORTAL_PATCH_COOLDOWN_MS`).
- `normalization.js`, `sorting.js`, `exportFormatters.js`, `scanValidation.js`, `portalTipResolver.js`.
- `signing.js` + `piFetch.js` — HMAC-SHA256 signing for every Express→Pi call. Canonical string is `METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nBODY_SHA256`, sent as `X-Control-*` headers; secret is `CONTROL_SIGNING_SECRET` (must match the Pi-side verifier, see `docs/feature-notes/PI_SIGNING_README.md`).

`server.js` notes:
- Global error handler (last middleware) returns only generic `{error, message}` — never leak `err.message`/stack to clients. Preserve this when adding new error paths.
- Helmet/CSP, CORS (`ALLOWED_ORIGINS` env, credentials enabled), rate limiting, `trust proxy` for Railway — all configured here and env-driven.
- `/health` is intentionally before all middleware (uptime probes); `/internal/pi-smoke` checks Pi connectivity and is token-gated in production via `INTERNAL_SMOKE_TOKEN`.
- `detectStateService.startServerHeartbeatLoop()` runs a server-side polling loop independent of browser tabs, so threat detection doesn't lapse when no tab is open.

### Frontend

- `src/api/*.js` — one module per backend domain (auth, dashboard, sam, device, audit, etc.), all built on `src/api/axios.js`. The axios instance attaches the in-memory Bearer access token and, on a 401, does a single queued `auth/refresh` (via HttpOnly cookie) then retries — don't duplicate this refresh logic elsewhere.
- `src/context/` — `NetworkProvider`, `ThreatDetectionProvider` (single global polling loop for live threat detection, only mounted for authenticated routes), `ToastProvider`.
- `src/hooks/` — per-page data hooks (`useDashboard`, `useSAM`, `useDevice`, `useUsers`, ...) wrapping `src/api` calls.
- `src/pages/<Page>/<Page>.jsx` + co-located `.css` — route-level pages, lazy-loaded in `src/App.jsx`.
- Routing (`App.jsx`): public routes (`/login`, `/forgot-password`, `/reset-password`, `/force-reset-password`) vs. a catch-all protected tree gated on `getAccessToken()`, wrapped in `ThreatDetectionProvider` + `Sidebar`. `/test-auth` is a dev-only QA harness, excluded from production builds via `import.meta.env.DEV`.

### Auth model

Supabase-issued JWT (in-memory on the frontend, never persisted) + `HttpOnly` refresh cookie (`sb_refresh`). Set `CROSS_ORIGIN_COOKIES=true` server-side when frontend/backend are on different domains (switches cookies to `SameSite=None; Secure`).

### Pi / FastAPI integration

`backend/controllers/rasPiController.js`, `detectController.js`, `captivePortalController.js`, `piProxyController.js` talk to the Pi's FastAPI service through `piFetch`/`signing.js`. `FASTAPI_BASE_URL` points at the Pi (Tailscale Funnel URL in prod, `127.0.0.1:8000` in dev). The Pi-side nginx gateway only forwards via Funnel ports 443/8443/10000 — port 9000 is internal-only.

### Testing strategy

Backend tests use Jest + supertest with **DB mocking at the repository/Supabase-client layer** (real Express app, routes, and middleware; `supabaseClient` is mocked via `jest.mock`). `__tests__/helpers/testApp.js` builds a minimal app for integration tests, `__tests__/helpers/mockSupabase.js` stubs the Supabase client, `__tests__/fixtures/` holds sample payloads. Coverage thresholds for `utils/` and `middleware/` are enforced in `backend/jest.config.js` — keep new pure-function logic in `utils/` to stay covered.

## Security context

The project tracks a phased hardening effort — see `docs/SECURITY_AND_RISKS.md` and `docs/feature-notes/SECURITY_HARDENING_PLAN.md` for the current posture and outstanding watchlist items (e.g. `src/api/deviceApi.js` still has a hardcoded `localhost:3000` URL instead of using the shared axios instance; in-memory rate limiter isn't multi-instance safe). CSP is defined in **two places** that must stay consistent: `backend/server.js` (Helmet, for the API) and `vite.config.js` (dev/preview server headers).

## Documentation

`README.md` has a full documentation index. Feature-specific design notes and changelogs live under `docs/feature-notes/*.md` (e.g. scoring refactor, audit logging, captive portal, session persistence, device management).
