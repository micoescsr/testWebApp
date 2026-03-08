Created SECURITY_HARDENING_PLAN.md with the complete plan covering:

Audit summary with current posture rating and critical findings
All 7 phases (0–6) with step-by-step tables
Code snippets for CSP and rate limiter configuration
The 17-instance error leak hit list
Route auth lockdown scope (what needs fixing vs. what's already protected)
Public surface inventory after hardening
Positive controls already in place
Defense statements ready to paste into your capstone paper
Execution order diagram with dependency notes

# Security Hardening Implementation Plan

> **Generated from:** Full security codebase audit (March 2–4, 2026)  
> **Last updated:** March 8, 2026 (C8/C9/C10/C11/C12 resolved — account-status enforcement, validator wiring, debug log removal, AP lock TTL, body size limit)
> **Stack:** React (Vite) + Express.js + PostgreSQL (Supabase) + Railway deployment
> **Auth model:** Bearer JWT (in-memory) + HttpOnly refresh cookie

---

## Table of Contents

1. [Audit Summary](#audit-summary)
2. [Phase 0 — Secrets Remediation](#phase-0--secrets-remediation) *(now includes 0-E Pi secrets)*
3. [Phase 1 — P0 Infrastructure](#phase-1--p0-infrastructure) *(now includes 1-I env validation, 1-J CORS/cookies, 1-K Funnel doc)*
4. [Phase 2 — Route Auth Lockdown](#phase-2--route-auth-lockdown)
5. [Phase 3 — P1 Bug Fixes & Info Disclosure](#phase-3--p1-bug-fixes--info-disclosure)
6. [Phase 4 — Deployment Readiness (Railway)](#phase-4--deployment-readiness-railway)
7. [Phase 4.5 — Pi Connectivity Readiness](#phase-45--pi-connectivity-readiness) *(NEW)*
8. [Phase 5 — Optional Polish](#phase-5--optional-polish)
9. [Phase 6 — Testing Deliverables](#phase-6--testing-deliverables)
10. [Railway Deployment Watchlist](#railway-deployment-watchlist) *(NEW)*
11. [Positive Security Controls (Already Implemented)](#positive-security-controls-already-implemented)
12. [Risk Notes for Paper](#risk-notes-for-paper) *(expanded)*

---

## Audit Summary

### Current Security Posture: 9/10 *(updated 2026-03-08 after C8/C9/C10/C11/C12 resolution)*

> **Previous rating:** 8.5/10 (2026-03-08). All phases substantially complete. Remaining gaps: partial input validation on GET query params.

| Category              | Before | After | Notes                                                              |
|-----------------------|--------|-------|--------------------------------------------------------------------|
| Authentication        | 8/10   | 9/10  | JWKS JWT, HttpOnly cookies, in-memory tokens, token rotation, CSRF origin check |
| Authorization         | 3/10   | 9/10  | All routes behind `authJWT` (29/29 confirmed). Account-status enforcement merged into `authJWT` — deactivated/on_hold users blocked on every request, not just at login. |
| Injection Defense     | 9/10   | 9/10  | 100% Supabase SDK, zero raw SQL                                    |
| XSS Defense           | 8/10   | 8/10  | React JSX throughout, zero `dangerouslySetInnerHTML`. **Gap:** `reportTemplates.js` builds HTML via template literals — low risk but review needed |
| Brute Force Defense   | 0/10   | 7/10  | `loginLimiter` 10/15min, `refreshLimiter` 20/15min, `globalLimiter` 300/15min. In-memory store only. |
| Security Headers      | 0/10   | 9/10  | Helmet + CSP + HSTS (prod) + X-Powered-By removed                 |
| Deployment Readiness  | 2/10   | 8/10  | CORS env-based, Pi signing unified. Debug cookie/token logging removed from `authController.js`. |
| Error Handling        | 5/10   | 9/10  | Global error handler added. All controller catch blocks now return generic messages; `err.message` leaks eliminated from all live code paths. |
| Input Validation      | —      | 8/10  | `authValidator` on login (email + password). `routeValidators.js` using express-validator wired to all POST/PUT routes: detect (start/stop), captive portal (announcement/tips/sync), user management (update/activate/deactivate/reactivate), rasPi (scan/networks), device management (enable-ap/portal-update). Body size limit (100KB) set. GET query params remain unvalidated. |

### Critical Findings

| ID  | Finding                                            | Status       | Resolution                                         |
|-----|----------------------------------------------------|--------------|----------------------------------------------------||
| C1  | Captive portal routes — zero auth                  | **Resolved** | `authJWT` applied in `captivePortalRoutes.js`      |
| C2  | Device management routes — zero auth               | **Resolved** | `authJWT` applied in `deviceMgmtRoutes.js`         |
| C3  | rasPi GET routes — no auth                         | **Resolved** | `authJWT` applied in `rasPiRoutes.js`              |
| C4  | No rate limiting on any endpoint                   | **Resolved** | `globalLimiter` + `loginLimiter` + `refreshLimiter` |
| C5  | `.env` files committed to git history              | **Resolved** | `.env` gitignored; `.env.example` files added      |
| C6  | No Helmet / no security headers                    | **Resolved** | Helmet + CSP + HSTS configured in `server.js`      |
| C7  | `trust proxy` not configured                       | **Resolved** | `app.set('trust proxy', 1)` in `server.js`         |
| C8  | `requireActiveProfile` not applied to routes       | **Resolved** | Account-status check merged directly into `authJWT` middleware (March 8). Every authenticated request now checks profile status in DB — deactivated/on_hold users are blocked immediately (403) even with valid JWTs. Combined with SEC-001 (password scramble on deactivation), this provides both login prevention AND active-session termination. |
| C9  | Validators defined but unused                      | **Resolved**  | `authValidator.js` wired to `POST /api/auth/login`. `routeValidators.js` created with express-validator chains for all POST/PUT routes: detect (start/stop), captive portal (announcement/tips/sync), user mgmt (update/activate/deactivate/reactivate), rasPi (scan/networks), device mgmt (enable-ap/portal-update). Validators enforce types, formats (UUID, email, BSSID), length limits, and enum constraints. |
| C10 | Debug console.log with sensitive data               | **Resolved** | Debug logging of cookies, raw cookie headers, and token lengths removed from `authController.js` (March 8). |
| C11 | AP apply lock has no TTL                           | **Resolved** | `ap_apply_locked_at` timestamp column added (migration 002). Lock acquisition now stamps the timestamp. When lock acquisition fails, checks if existing lock exceeds TTL (default 120s) and auto-releases stale locks. `releaseApLock()` clears both `ap_apply_in_progress` and `ap_apply_locked_at`. Configurable via `AP_LOCK_TTL_SECONDS` env var. |
| C12 | `express.json()` has no explicit size limit         | **Resolved** | `express.json({ limit: '100kb' })` explicitly set in `server.js` (March 8). |

---

## Phase 0 — Secrets Remediation ✅

> **Status: DONE.** Pi secrets generated, env vars configured.

| Step | Action                                    | Detail                                                            |
|------|-------------------------------------------|-------------------------------------------------------------------|
| 0-A  | Rotate Supabase service role key          | Supabase Dashboard → Settings → API → regenerate service role key |
| 0-B  | Update local `.env`                       | Put new key in `backend/.env`                                     |
| 0-C  | Scrub git history                         | `git filter-repo --path .env --path backend/.env --invert-paths`  |
| 0-D  | Force push cleaned history                | `git push --force --all`                                          |
| 0-E  | Generate and store Pi control secrets     | Generate long random `CONTROL_SIGNING_SECRET`. Store **only** in Railway env vars + Pi env. **Never** expose in React env builds (`VITE_` prefix). Also ensure JWT secrets are stored in Railway env. All Pi endpoints (including `/portal/patch`) use unified HMAC signing — no separate portal token needed. |

**Why first:** If you push code changes while the old key is in git history, it's still compromised.

> **Funnel note:** Funnel introduces `CONTROL_SIGNING_SECRET` which must exist on both Railway and the Pi. Treat this as a Phase 0 secret — it must be generated and securely stored before any Pi connectivity work begins.

---

## Phase 1 — P0 Infrastructure ✅

> **Status: DONE.** All steps (1-A through 1-K) implemented.

| Step | Action                          | Where                             | Detail                                                                                              |
|------|---------------------------------|-----------------------------------|------------------------------------------------------------------------------------------------------|
| 1-A  | Enable `trust proxy`            | `server.js` — after `const app`   | `app.set('trust proxy', 1)` — Railway uses single-layer proxy. **Required because Railway uses proxy headers; otherwise `express-rate-limit` keys on the proxy IP and rate limiting becomes global (all users share one bucket) or throws warnings.** Also required so `req.ip` returns real client IP for logging. |
| 1-B  | Install deps                    | Terminal                          | `cd backend && npm install helmet express-rate-limit`                                                |
| 1-C  | Add Helmet + basic CSP          | `server.js` — after `cookieParser()`, before routes | See [CSP config](#csp-configuration) below                                              |
| 1-D  | Create rate limiters             | New file: `backend/middleware/rateLimiter.js` | `loginLimiter` (10 req/15min), `refreshLimiter` (30 req/15min), `globalLimiter` (100 req/15min) |
| 1-E  | Apply auth limiters              | `backend/routes/authRoutes.js`    | `loginLimiter` on `POST /login`, `refreshLimiter` on `POST /refresh`                               |
| 1-F  | Apply global limiter             | `server.js` — **after** `trust proxy` (1-A) and **after** health endpoint (2-new), before route mounting | `app.use(globalLimiter)` — Don't globally rate-limit the health check endpoint too aggressively; place global limiter after `/health`. |
| 1-G  | Document limiter limitation      | Paper / this README               | "In-memory store; resets on restart; not shared across instances. For multi-instance scaling (Railway auto-scale), nonces and idempotency caches also become inconsistent — Redis required." |
| 1-H  | CSP sanity check                 | Manual test                       | Start frontend + backend, confirm login/dashboard load, no CSP console violations. Check for `Refused to connect… violates CSP connect-src` errors especially. |
| 1-I  | Env validation on startup        | `server.js` — top of file          | On server start, check all required env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `FASTAPI_BASE_URL`, `CONTROL_SIGNING_SECRET`, `ALLOWED_ORIGINS`) and **crash with a clear message** if any are missing. Fail fast > silent misconfiguration. |
| 1-J  | CORS / cookies production config | `server.js` + `authController.js` | If using cookies (JWT refresh tokens): set `SameSite=None; Secure` in prod (required for cross-origin cookies). Ensure `Access-Control-Allow-Credentials: true` in CORS config. Cookie domain + CORS `allowedOrigins` must match production Railway domains. |
| 1-K  | Document edge connectivity architecture | This README / paper     | Commit on paper: "Railway cannot join tailnet; Tailscale Funnel exposes Pi gateway. Express is the **only** caller of Pi URL; browser never calls Pi directly." This is a security boundary decision — document early even if implementation is later. |

### CSP Configuration

CSP is a **browser-enforced** header. It does NOT affect backend-to-Supabase calls.

> **⚠️ WARNING:** `connect-src 'self'` alone will likely break production if the frontend calls a different domain (e.g., Supabase auth/storage directly, or if frontend and backend are on different Railway domains). The CSP must be **environment-aware**.

```js
const helmet = require('helmet');

// Build connect-src based on environment
const connectSources = ["'self'"];
if (process.env.NODE_ENV === 'production') {
  // Add your Railway backend domain if frontend is served separately
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    connectSources.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }
  // Add Supabase project URL if frontend calls it directly
  if (process.env.SUPABASE_URL) {
    connectSources.push(process.env.SUPABASE_URL);
  }
} else {
  // Dev: allow localhost origins (Vite HMR, local backend)
  connectSources.push('http://localhost:*', 'ws://localhost:*');
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],  // React CSS needs this
      connectSrc: connectSources,                  // Environment-aware
      imgSrc:     ["'self'", "data:", "blob:"],
    },
  },
  hsts: process.env.NODE_ENV === 'production',
}));
```

### Rate Limiter Configuration

```js
// backend/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts' },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

module.exports = { loginLimiter, refreshLimiter, globalLimiter };
```

### Rate Limiter Limitation (1-G)

> **Known limitation:** The rate limiters above use `express-rate-limit`'s **in-memory store**.
>
> - Counters **reset on every server restart** (Railway redeploys, crashes).
> - Counters are **not shared across instances** — if Railway auto-scales to 2+ containers, each has its own bucket, effectively multiplying the allowed requests by the instance count.
> - Nonce / idempotency caches would suffer the same problem.
>
> **Mitigation path:** When scaling beyond a single Railway instance, swap to [`rate-limit-redis`](https://www.npmjs.com/package/rate-limit-redis) backed by a shared Redis service. For a single-instance capstone deployment, the in-memory store is acceptable.

### Edge Connectivity Architecture (1-K)

> **Security boundary decision — documented here for traceability.**
>
> Railway **cannot** join a Tailscale tailnet (no persistent daemon support). Therefore:
>
> 1. The **Raspberry Pi** exposes its FastAPI gateway via **Tailscale Funnel** (public HTTPS URL, e.g. `https://pi.tail12345.ts.net`).
> 2. The **Express backend** (Railway) is the **only** caller of that Pi URL. The browser / React frontend **never** calls the Pi directly.
> 3. Commands from Express → Pi are **HMAC-signed** (`CONTROL_SIGNING_SECRET`) with a timestamp to prevent replay.
> 4. Scan-complete webhooks from Pi → Express use a **Bearer token** (`SCAN_RUNNER_TOKEN`) validated server-side.
> 5. All Pi endpoints (including `/portal/patch`) use the same **HMAC signing** — no separate portal token needed.
>
> This means:
> - Pi secrets (`CONTROL_SIGNING_SECRET`, `SCAN_RUNNER_TOKEN`) exist **only** in Railway env vars and the Pi's `.env`. They are **never** exposed to the frontend (no `VITE_` prefix).
> - If the Funnel URL leaks, an attacker still cannot issue commands without the signing secret.
> - If a token leaks, the `ALLOWED_DEVICE_IDS` allowlist (Phase 4.5) limits blast radius.

---

## Phase 2 — Route Auth Lockdown ✅

> **Status: DONE.** `authJWT` applied to all 9 route groups. Health check added before middleware.

### Scope — What needs auth added

| Route Group                   | Step | Action                                                                                       |
|-------------------------------|------|-----------------------------------------------------------------------------------------------|
| `/api/captivePortal`          | 2-A  | Add `authJWT` to **all** routes in `captivePortalRoutes.js`                                  |
| `/api/rasPi`                  | 2-B  | Add `authJWT` to 3 unprotected GETs: `/networks`, `/networks/:networkId`, `/networks_list`   |
| `/api/device`                 | 2-C  | Add `authJWT` to all browser-called routes in `deviceMgmtRoutes.js`. Webhook `POST /scan-completed`: keep `SCAN_RUNNER_TOKEN` but **fail closed** (reject if env var unset) |
| `/api/device/status` (inline) | 2-D  | Add `authJWT` to inline `app.get` in `server.js`                                            |
| `/api/history/vulnerabilities` (inline) | 2-G | Add `authJWT` to inline `app.get` in `server.js`                                   |
| `/api/history/threats` (inline)         | 2-G | Add `authJWT` to inline `app.get` in `server.js`                                   |

### Already protected (no action needed)

| Route Group    | Auth mechanism                        |
|----------------|----------------------------------------|
| `/api/webapp`  | `authJWT` per-route in userRoutes + metadataController |
| `/api/sam`     | `authJWT` per-route                   |
| `/api/audit`   | `authJWT` + `requireSuperadmin`       |
| `/api/detect`  | `authJWT` per-route                   |

### Intentionally public (no action needed)

| Route Group    | Reason                              |
|----------------|--------------------------------------|
| `/health`      | Railway uptime probe (add in 2-new) |
| `/api/auth/*`  | Login / refresh / logout            |

### Additional steps

| Step   | Action                                                                                             |
|--------|-----------------------------------------------------------------------------------------------------|
| 2-E    | Remove/annotate dead `//app.use("/api", authJWT, requireActiveProfile)` — eliminates false-safety trap |
| 2-F    | Smoke test: `curl` each previously-open endpoint without token → confirm 401                       |
| 2-new  | Add `app.get('/health', (req, res) => res.json({ status: 'ok' }))` before all middleware           |

### Public surface after Phase 2 (complete list)

- `GET /health` — uptime probe
- `POST /api/auth/login` — login
- `POST /api/auth/set-refresh` — cookie setup
- `POST /api/auth/refresh` — token refresh
- `POST /api/auth/logout` — logout
- `POST /api/device/scan-completed` — webhook (token-guarded, not JWT)
- **Everything else** → 401 without valid JWT

---

## Phase 3 — P1 Bug Fixes & Info Disclosure ✅

> **Status (updated 2026-03-08):** All steps complete. 3-A done (role check fixed). 3-B done (superadmin-only on getAllUsers). 3-C/3-D done — global error handler catches parse errors and unhandled exceptions, and **all controller catch blocks** now return generic messages instead of `err.message`. Debug logging of sensitive auth data removed.

| Step     | Action                              | Where                              | Detail                                                          |
|----------|--------------------------------------|-------------------------------------|-----------------------------------------------------------------|
| 3-A      | Fix SA role check precedence bug    | `backend/services/authService.js`  | Change `!user?.user_metadata?.role === 'super_admin'` to `user?.user_metadata?.role !== 'super_admin'` |
| 3-B      | Restrict `getAllUsers`              | `userController.js` or `userRoutes.js` | Add `requireSuperadmin` middleware, OR return minimal fields for non-admin |
| 3-C + 3-D | Standardize all 17 error leaks    | See hit list below                 | Replace `err.message` in responses with generic message; log real error server-side |

### Error leak hit list (17 instances)

| File                            | Count | Pattern                                      |
|---------------------------------|-------|----------------------------------------------|
| `detectController.js`           | 4     | `detail: err.message`                        |
| `deviceMgmtRoutes.js`           | 5     | `message: err.message` / `detail: err.message` |
| `captivePortalController.js`    | 1     | `detail: err.message`                        |
| `rasPiController.js`            | 2     | `error: err.message` / `detail: String(err)` |
| `metadataController.js`         | 1     | `error: error.message`                       |
| `deviceMgmtController.js`       | 3     | `error: err.message` (dead code, fix anyway) |
| `userController.js`             | 1     | `error: error.message`                       |
| `server.js` (device/status)     | 1     | `detail: String(err)` + leaks `fastapi_base` |

### Standard fix pattern

```js
// BEFORE:
res.status(500).json({ error: err.message });

// AFTER:
console.error('[handlerName]', err);
res.status(500).json({ error: 'Internal server error' });
```

**Why this matters for testing:**
- SQLi testing: prevents DB/schema hints in responses
- XSS testing: prevents reflecting payloads through error text
- General hardening: reduces information disclosure findings

---

## Phase 4 — Deployment Readiness (Railway) ✅

> **Status (updated 2026-03-08):** All steps complete. 4-A through 4-E done. Debug cookie/token logging removed. Body size limit explicitly configured.

| Step | Action                              | Where                              | Detail                                                     |
|------|--------------------------------------|--------------------------------------|------------------------------------------------------------|
| 4-A  | CORS origins via env var            | `server.js`                         | `const allowedOrigins = (process.env.ALLOWED_ORIGINS \|\| "http://localhost:5173").split(",")` |
| 4-B  | Update origin assertions            | `authController.js`                 | Same env-based `allowedOrigins` for `assertOrigin()` CSRF check |
| 4-C  | Frontend baseURL via env            | `src/api/axios.js`                  | `baseURL: import.meta.env.VITE_API_BASE_URL \|\| "/api"`  |
| 4-D  | Remove debug cookie logging         | `authController.js`                 | Delete two `console.log` lines in refresh handler that log `req.cookies` / `req.headers.cookie` |
| 4-E  | Remove hardcoded FASTAPI_BASE       | `server.js`                         | Delete hardcoded Tailscale URL; use `const FASTAPI_BASE = process.env.FASTAPI_BASE_URL \|\| "http://127.0.0.1:8000"` |

---

## Phase 4.5 — Pi Connectivity Readiness

> **Execute right before deployment.** Validates that Express↔Pi communication works end-to-end through Funnel.

| Step  | Action                                     | Where                              | Detail                                                                                                |
|-------|--------------------------------------------|------------------------------------|--------------------------------------------------------------------------------------------------------|
| 4.5-A | Confirm Funnel URL is stable              | Pi (Tailscale admin)               | Funnel publicly listens on limited ports (typically 443/8443/10000). Verify chosen port is stable and not subject to rotation. |
| 4.5-B | Verify Express can reach Pi               | Railway backend                    | Express can call `${FUNNEL_URL}/device/status` and receive a response. Use the HMAC-signed request path. |
| 4.5-C | Timeouts + error mapping                  | `deviceMgmtController.js` / `detectController.js` | All Pi calls must have explicit timeouts (e.g., 10s). Map timeout/connection errors to user-friendly "device offline" response instead of leaking raw errors. |
| 4.5-D | nginx binding validation                  | Pi — `nginx.conf`                  | nginx must listen on `127.0.0.1:9000` (NOT `0.0.0.0:9000`). Funnel (running on Pi) forwards to localhost. Binding to `0.0.0.0` exposes the gateway to LAN — unnecessary attack surface. |
| 4.5-E | Idempotency-Key for POST retries          | Express → Pi POST routes           | If Express times out and retries `/scan`, you can accidentally start two scans. Add `Idempotency-Key` header support so "same key = same operation; don't run twice." This is operational correctness, not extra security. |
| 4.5-F | Funnel security surface acknowledgment    | This README / paper                | Funnel creates a **public HTTPS endpoint** — anyone on the internet can reach it. HMAC provides auth + integrity, but attackers can still send invalid requests, open connections, and waste CPU on signature checks. nginx rate limits/timeouts provide **availability protection**. Document this separation: confidentiality/integrity ≠ availability. |

### Funnel Architecture: Why HMAC Alone Isn't Enough

```
ATTACKER ──→ [Funnel public HTTPS] ──→ [nginx on Pi 127.0.0.1:9000] ──→ [FastAPI]
              │                           │
              │ HMAC stops:               │ nginx stops:
              │  • forged commands        │  • connection floods
              │  • tampered payloads      │  • request spam
              │  • replay attacks         │  • slow-loris
              │                           │  • oversized bodies
```

**HMAC = auth + integrity** — stops attackers from executing valid actions.
**nginx limits/timeouts = availability protection** — stops resource exhaustion.

Both layers are required. One without the other leaves a gap.

---

## Phase 5 — Optional Polish ✅

> **Status: DONE.** UUID validation middleware applied. `jsonwebtoken` removed (using `jose`).

| Step | Action                          | Where                  | Impact                                                              |
|------|---------------------------------|------------------------|----------------------------------------------------------------------|
| 5-A  | UUID validation middleware      | New middleware          | Returns 400 on invalid UUID format instead of Postgres error bubbling |
| 5-B  | Field allowlist in `updateUser` | `userController.js`    | Destructure only `{ username, email, role, status }` — prevents mass assignment |
| 5-C  | Prevent superadmin self-deletion | `userController.js`   | Add `if (req.user.id === req.params.id) return 403` in `deleteUser` |
| 5-D  | Remove `jsonwebtoken` from root | `package.json`         | Node-only lib unused in browser; `jose` is already used correctly   |

---

## Phase 6 — Testing Deliverables ✅

> **Status: DONE.** Jest unit + integration tests, Playwright E2E tests, coverage reports generated.

### 6-A: Scope list

Document which endpoints are in-scope for each test type. Explicitly list out-of-scope items with rationale.

### 6-B: Test matrix

| Category              | Endpoint(s)                                    | Tool             | Expected Result                                        |
|-----------------------|------------------------------------------------|------------------|--------------------------------------------------------|
| Brute force           | `POST /api/auth/login`, `POST /api/auth/refresh` | Burp Intruder    | 429 after threshold (10/30 attempts) + window reset   |
| Broken access control | All Phase 2 endpoints                          | curl without token | 401 response                                          |
| SQLi                  | Login, audit search                            | Manual payloads  | Safe rejection, no DB errors leaked                   |
| XSS (stored)          | Captive portal announcements/terms             | Manual payload   | Stored as text, rendered escaped by React             |
| XSS (reflected)       | Error responses, query params                  | Manual payload   | Not reflected in HTML                                 |
| Security headers      | All responses                                  | ZAP passive scan | Before: missing headers. After: Helmet headers present |

### 6-C: Before/after evidence

For each phase, capture:
1. **Before:** Request succeeding improperly (200 without token, no 429, missing headers)
2. **After:** Request properly rejected (401/403/429) or headers present

### 6-D: Retest proof

After each phase, re-run the same tests to prove fixes work:
- Burp Intruder → 429 after rate limit
- curl → 401 on locked-down routes
- ZAP → headers present

### 6-E: Limitations section

Explicitly state in paper:
- Rate limiter uses in-memory store (not distributed; resets on restart)
- CSP is environment-aware but may need further tuning per-CDN/asset in production
- Webhook auth uses shared secret (production would use mTLS or signed webhooks)
- No Redis store for multi-instance scaling (affects rate limiter, nonce cache, and idempotency cache)
- Funnel exposes Pi publicly; HMAC + nginx provide layered defense but Funnel relay limits/bandwidth constraints apply

---

## Railway Deployment Watchlist

> **The 4 most likely pain points when you deploy.** Review before writing any deployment code.

### 1. CSP breaking production calls (`connect-src` too strict)

`connect-src 'self'` will block any request to a domain that isn't the page's own origin. This breaks:
- Frontend → Backend calls (if served from different Railway domains)
- Frontend → Supabase direct calls (auth, storage)
- WebSocket connections (if any)

**Symptom:** `Refused to connect to 'https://...' because it violates the following CSP directive: "connect-src 'self'"`

**Fix:** Phase 1-C now uses environment-aware CSP (see updated code above). Before deploying, verify your Railway domain and Supabase URL are in `connectSources`.

### 2. CORS / cookies mismatch after Railway deploy

This is the most common post-deploy breakage:
- `SameSite=Lax` cookies won't be sent cross-origin — if frontend and backend are on different domains, you need `SameSite=None; Secure`
- `Access-Control-Allow-Credentials: true` must be set in CORS
- CORS `origin` must exactly match the frontend domain (no trailing slash, correct scheme)
- `assertOrigin()` in `authController.js` must include the production frontend domain

**Fix:** Phase 1-J covers this. Test with browser dev tools Network tab — look for `Set-Cookie` headers being silently dropped.

### 3. Multi-instance edge cases (Railway auto-scale)

If Railway scales beyond 1 instance, these become inconsistent:
- **Rate limiter** — in-memory store is per-instance; attacker can spread requests across instances
- **Nonce cache** (HMAC replay prevention) — nonce seen by instance A is unknown to instance B
- **Idempotency cache** — same problem; duplicate scan starts possible

**Fix for capstone:** Document as known limitation. For production: Redis-backed stores.

**Fix for production:** `rate-limit-redis`, centralized nonce store, centralized idempotency store.

### 4. Funnel port constraints and forwarding assumptions

Tailscale Funnel publicly listens on limited ports (typically **443, 8443, 10000**). Your plan assumes nginx on port 9000 — that's the *internal* port. Funnel fronts it on one of the public ports and forwards.

**Things to verify:**
- Funnel forwards to `127.0.0.1:9000` (not `0.0.0.0:9000`)
- The Funnel public URL is stable (doesn't rotate)
- Express has the correct Funnel URL in `FASTAPI_BASE_URL` / `PI_GATEWAY_URL`
- Funnel relay bandwidth limits are acceptable for your scan payloads

---

## Positive Security Controls (Already Implemented)

These are working correctly and should be highlighted in your paper:

| Control                          | Implementation                                                        |
|----------------------------------|------------------------------------------------------------------------|
| JWT verification                 | JWKS-based via `jose`, remote key set, audience validation, auto-rotation |
| Access token storage             | In-memory module variable — never in localStorage/sessionStorage      |
| Refresh token storage            | HttpOnly cookie, `SameSite=lax`, scoped to `/api/auth` path          |
| Supabase `persistSession: false` | Frontend client explicitly prevents local token storage               |
| Token refresh flow               | Single-flight pattern with request queuing in axios interceptor       |
| Token rotation                   | New refresh token rotated into cookie on each refresh                 |
| CSRF on refresh                  | `assertOrigin()` validates Origin header against allowlist            |
| Parameterized queries            | 100% Supabase SDK — zero raw SQL, zero string interpolation          |
| Algorithm enforcement            | JWKS inherently rejects `alg: none`                                   |
| React XSS protection             | All rendering through JSX — automatic output encoding                |
| No `dangerouslySetInnerHTML`      | Zero instances in entire frontend                                    |
| Audit logging                    | Comprehensive trail for login, user mgmt, AP operations              |
| Temp password generation          | `crypto.randomBytes(32)` — cryptographically secure                  |
| Self-deactivation prevention      | `deactivateUser` blocks self-deactivation                            |
| Deactivation password scramble    | `deactivateUser` overwrites auth password with `crypto.randomBytes(64)` — old credentials permanently destroyed (SEC-001, March 6) |
| Mandatory temp PW on reactivation | `reactivateUser` always generates a new temp password when reactivating to `active` status — backend enforces this regardless of frontend flag (SEC-002, March 6) |
| HMAC request signing (Pi)        | Canonical string + SHA256 body hash + timestamp + nonce via `signing.js` and `piFetch.js` |
| Optimistic locking               | `detectStateService.js` uses `updated_at` as lock with retry loop    |
| Field allowlist (user update)    | `userController.js` destructures only 6 permitted fields             |
| Self-deletion guard              | `userController.js` blocks `currentUser.id === id` in `deleteUser`   |
| UUID validation middleware       | `validateUUID.js` factory function applied on 7 routes               |
| Environment validation           | `envValidation.js` crashes on missing vars before Express setup      |
| Risk score versioning            | `riskPipeline.js` bumps `risk_score_version` atomically on change    |
| Global error handler             | Catches `entity.parse.failed` and unhandled exceptions; returns generic messages |
| Account-status enforcement       | Merged into `authJWT` — every authenticated request checks profile status in DB; deactivated/on_hold users receive 403 immediately |
| Login input validation           | `authValidator.js` (express-validator) validates email format + password length on `POST /api/auth/login` |
| Route input validation           | `routeValidators.js` (express-validator) validates body params on all POST/PUT routes: UUID format, email format, BSSID format, enum values, string lengths, type checks |
| Request body size limit          | `express.json({ limit: '100kb' })` prevents oversized payloads from reaching controllers |
| AP lock TTL                      | `ap_apply_locked_at` timestamp + configurable TTL (120s default) auto-releases stale locks — prevents permanent AP operation blockage on crash |

---

## Risk Notes for Paper

Use these exact lines when writing the capstone paper:

| Topic                | Defense statement                                                                                              |
|----------------------|-----------------------------------------------------------------------------------------------------------------|
| Rate limiter store   | "In-memory rate limiting was used for the capstone demo; it resets on server restart and is not shared across multiple instances. For production multi-instance scaling, a Redis-backed store (`rate-limit-redis`) is recommended." |
| CSP                  | "An environment-aware Content-Security-Policy was enforced with separate `connect-src` directives for development and production domains. The dev CSP includes localhost origins for Vite HMR; the production CSP includes only the Railway backend domain and Supabase project URL." |
| Webhook auth         | "Machine-to-machine authentication for scan webhooks uses a shared secret (`SCAN_RUNNER_TOKEN`). Production systems should use mutual TLS or signed webhook payloads." |
| SQL injection         | "No raw SQL exists in the codebase; all database access uses the Supabase JavaScript SDK which parameterizes queries automatically." |
| XSS                  | "React's JSX rendering provides automatic output encoding. No `dangerouslySetInnerHTML` usage exists. CSP provides defense-in-depth." |
| Funnel architecture  | "Tailscale Funnel is used to expose the Pi gateway because Railway cannot join a tailnet. This creates a public HTTPS endpoint on the Pi. HMAC signing provides authentication and integrity for control commands, while nginx rate limits and connection timeouts provide availability protection. This layered approach separates confidentiality/integrity controls from availability controls." |
| CORS / cookies       | "Cross-origin cookie transmission requires `SameSite=None; Secure` attributes in production. CORS credentials are explicitly enabled and origin-validated against an environment-configured allowlist." |
| Multi-instance       | "The current architecture assumes a single Railway instance. Rate limiting, nonce caches, and idempotency caches are in-memory and would become inconsistent under multi-instance scaling. Redis-backed stores are recommended for production horizontal scaling." |

---

## Execution Order & Dependencies

```
Phase 0 (secrets + Pi secrets)  ──→  Phase 1 (infra + env validation + Funnel doc)
                                       │
                                       │ trust proxy MUST come before rate limiting
                                       │ env validation MUST come before deployment
                                       │
                                       ▼
                                 Phase 2 (auth lockdown)
                                       │
                                       ▼
                                 Phase 3 (bugs/errors)
                                       │
                                       ▼
                                 Phase 4 (deployment config)
                                       │
                                       ▼
                                 Phase 4.5 (Pi connectivity readiness)
                                       │  Funnel URL stable?
                                       │  Express → Pi reachable?
                                       │  nginx on 127.0.0.1?
                                       │  Idempotency-Key in place?
                                       ▼
                                 Phase 5 (polish)
                                       │
                                       ▼
                                 Phase 6 (testing evidence)
```

### Key Dependencies

1. **`trust proxy` (1-A) → rate limiting (1-D/E/F):** Must be set first, otherwise `express-rate-limit` keys on the proxy IP and all users share one bucket.
2. **Env validation (1-I) → deployment (Phase 4):** Server must crash on missing vars before you deploy to Railway.
3. **CORS/cookies (1-J) → deployment (Phase 4):** Cookie `SameSite`/`Secure` and CORS credentials must be correct before production serves real users.
4. **Funnel doc (1-K) → Pi connectivity (Phase 4.5):** Architecture decision must be documented before implementation.
5. **Phase 0-E secrets → Phase 4.5:** Pi control secrets must exist before testing Express→Pi communication.

---

## Table of Contents (Updated)

1. [Audit Summary](#audit-summary)
2. [Phase 0 — Secrets Remediation](#phase-0--secrets-remediation) *(now includes 0-E Pi secrets)*
3. [Phase 1 — P0 Infrastructure](#phase-1--p0-infrastructure) *(now includes 1-I env validation, 1-J CORS/cookies, 1-K Funnel doc)*
4. [Phase 2 — Route Auth Lockdown](#phase-2--route-auth-lockdown)
5. [Phase 3 — P1 Bug Fixes & Info Disclosure](#phase-3--p1-bug-fixes--info-disclosure)
6. [Phase 4 — Deployment Readiness (Railway)](#phase-4--deployment-readiness-railway)
7. [Phase 4.5 — Pi Connectivity Readiness](#phase-45--pi-connectivity-readiness) *(NEW)*
8. [Phase 5 — Optional Polish](#phase-5--optional-polish)
9. [Phase 6 — Testing Deliverables](#phase-6--testing-deliverables)
10. [Railway Deployment Watchlist](#railway-deployment-watchlist) *(NEW)*
11. [Positive Security Controls (Already Implemented)](#positive-security-controls-already-implemented)
12. [Risk Notes for Paper](#risk-notes-for-paper) *(expanded)*
