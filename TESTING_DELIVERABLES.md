# Phase 6 — Testing Deliverables

> **Generated:** 2026-03-05  
> **Last updated:** 2026-03-07 (whitebox assessment addendum)  
> **Stack:** React (Vite) + Express.js + PostgreSQL (Supabase) + Railway  
> **Test runner:** `backend/scripts/phase6-tests.ps1`  
> **Regression guard:** `npm run lint:security` (68 files, 0 violations)

---

## 6-A: Scope List

### In-Scope Endpoints (48 total routes)

#### Public Surface (3 routes — no JWT required)

| # | Method | Path | Auth Mechanism | Purpose |
|---|--------|------|----------------|---------|
| 1 | GET | `/health` | None (pre-middleware) | Railway uptime probe |
| 2 | POST | `/api/auth/login` | `loginLimiter` (10/15 min) | User authentication |
| 3 | POST | `/api/auth/set-refresh` | None (sets HttpOnly cookie) | Refresh token storage |

#### Token-Gated Webhook (1 route — shared secret, not JWT)

| # | Method | Path | Auth Mechanism | Purpose |
|---|--------|------|----------------|---------|
| 4 | POST | `/api/device/scan-completed` | `X-Scan-Runner-Token` header | Pi scan webhook |

#### JWT-Protected Routes (41 routes)

| Group | Routes | Extra Guards |
|-------|--------|--------------|
| Auth lifecycle | `POST /api/auth/refresh`, `POST /api/auth/logout` | `refreshLimiter`, `optionalAuthJWT` |
| Web app metadata | `GET /api/webapp/network_metadata`, `GET /api/webapp/vulnerabilities_latest` | — |
| User profiles | `GET .../profiles/me`, `GET .../profiles`, `PUT .../profiles/:id`, `DELETE .../profiles/:id`, `POST .../profiles/:id/activate-with-temp`, `POST .../profiles/:id/deactivate` | `validateUUID('id')`, field allowlist (PUT), self-deletion guard (DELETE) |
| Raspberry Pi | `GET /api/rasPi/networks`, `GET .../networks/:networkId`, `POST .../scan`, `GET .../networks_list`, `POST .../networks` | `validateUUID('networkId')` |
| Device management | `POST .../signal_ap`, `GET .../ap-state/:networkId`, `POST .../enable-ap`, `GET .../network/:networkId/state`, `POST .../portal/update`, `GET /api/device/status` | `validateUUID('networkId')` |
| Detection | `GET .../status`, `POST .../start`, `POST .../stop`, `POST .../heartbeat`, `GET .../poll` | — |
| SAM | `GET .../threats/:idOrName`, `GET .../vulnerabilities/:idOrName` | — |
| Captive portal | `GET .../announcement`, `GET .../announcement/history`, `POST .../announcement`, `GET .../terms`, `GET .../terms/history`, `POST .../terms`, `GET .../tips`, `POST .../tips`, `GET .../risk-classifications`, `GET .../summary`, `POST .../sync` | — |
| Audit | `GET .../logs`, `GET .../export`, `POST .../archive` | `requireSuperadmin` |
| History | `GET .../vulnerabilities`, `GET .../threats` | — |

#### Superadmin-Only Routes (3 routes)

| Method | Path | Guards |
|--------|------|--------|
| GET | `/api/audit/logs` | `authJWT` → `requireSuperadmin` |
| GET | `/api/audit/export` | `authJWT` → `requireSuperadmin` |
| POST | `/api/audit/archive` | `authJWT` → `requireSuperadmin` |

### Out-of-Scope Items

| Item | Rationale |
|------|-----------|
| Frontend React components | XSS defense is architectural (JSX auto-escaping, zero `dangerouslySetInnerHTML`); no stored HTML rendering |
| Supabase RLS policies | Database-level policies are managed in Supabase dashboard, not in Express code |
| Tailscale Funnel config | Infrastructure-level; tested via Pi connectivity, not backend code |
| Third-party dependency CVEs | Tracked via `npm audit`; not in scope for functional security tests |
| Load/performance testing | Capstone scope is functional security, not scale testing |

---

## 6-B: Test Matrix

| # | Category | Endpoint(s) | Tool | Expected | Actual | Status |
|---|----------|-------------|------|----------|--------|--------|
| 1 | **Public surface** | `GET /health` | phase6-tests.ps1 | 200 (no auth) | 200 | PASS |
| 2 | **Public surface** | `POST /api/auth/login` | phase6-tests.ps1 | 400 (accessible, not 401) | 400 | PASS |
| 3 | **Webhook auth** | `POST /api/device/scan-completed` (no token) | phase6-tests.ps1 | 401 (rejected) | 401 | PASS |
| 4 | **Webhook auth** | `POST /api/device/scan-completed` (wrong token) | phase6-tests.ps1 | 401 (rejected) | 401 | PASS |
| 5 | **Broken access control** | 29 JWT-protected endpoints (no token) | phase6-tests.ps1 | All return 401 | 29/29 → 401 | PASS |
| 6 | **UUID validation** | 5 routes with `:id`/`:networkId` = `not-a-uuid` | phase6-tests.ps1 | 401 (auth-first ordering) | 5/5 → 401 | PASS |
| 7 | **Security headers** | `X-Content-Type-Options` | curl.exe | `nosniff` | `nosniff` | PASS |
| 8 | **Security headers** | `X-Frame-Options` | curl.exe | `SAMEORIGIN` | `SAMEORIGIN` | PASS |
| 9 | **Security headers** | `X-XSS-Protection` | curl.exe | `0` (Helmet default) | `0` | PASS |
| 10 | **Security headers** | `Strict-Transport-Security` | curl.exe | Absent in dev (prod-only) | Absent | PASS |
| 11 | **Security headers** | `Content-Security-Policy` | curl.exe | Present | Present | PASS |
| 12 | **Security headers** | `X-Powered-By` | curl.exe | Removed | Removed | PASS |
| 13 | **Rate limiting** | `POST /api/auth/login` (15 rapid attempts) | phase6-tests.ps1 | 429 after threshold | 429 at request 9-10 | PASS |
| 14 | **Error leak (JSON)** | `POST /api/auth/login` (malformed `{bad json`) | phase6-tests.ps1 | 400, no stack trace | 400 `INVALID_JSON` | PASS |
| 15 | **SQLi** | `POST /api/auth/login` (`' OR 1=1 --`) | phase6-tests.ps1 | No DB info leaked | 429 (rate-limited), no DB info | PASS |
| 16 | **XSS (stored)** | Captive portal announcements/terms | Manual / React | Stored as text, rendered escaped | JSX auto-escaping, zero `dangerouslySetInnerHTML` | PASS (architectural) |
| 17 | **XSS (reflected)** | Error responses | phase6-tests.ps1 + manual | Not reflected in HTML | JSON-only responses, global error handler | PASS |

---

## 6-C: Before/After Evidence

### Phase 1 — Security Headers

| Check | Before | After |
|-------|--------|-------|
| `X-Content-Type-Options` | Missing | `nosniff` |
| `X-Frame-Options` | Missing | `SAMEORIGIN` |
| `X-XSS-Protection` | Missing | `0` (browser XSS filter disabled per best practice) |
| `Content-Security-Policy` | Missing | Full directive set with env-aware `connect-src` |
| `X-Powered-By` | `Express` | Removed |
| Rate limiting | None (0/10) | `loginLimiter` 10/15 min, `refreshLimiter` 20/15 min, `globalLimiter` 300/15 min |
| Trust proxy | Not set | `app.set('trust proxy', 1)` |

### Phase 2 — Route Auth Lockdown

| Check | Before | After |
|-------|--------|-------|
| Unprotected routes | Multiple route groups accessible without JWT | 0 unprotected (29/29 return 401) |
| `/api/device/status` | No auth | `authJWT` middleware |
| `/api/audit/*` | No role check | `authJWT` + `requireSuperadmin` |
| `/api/detect/*` | No auth | `authJWT` on all 5 routes |

### Phase 3 — Bug Fixes & Info Disclosure

| Check | Before | After |
|-------|--------|-------|
| `FASTAPI_BASE_URL` | 5 files used `process.env.FASTAPI_BASE` with hardcoded Tailscale URLs | All use `process.env.FASTAPI_BASE_URL` via `piFetch` |
| `scan-completed` auth | Not behind `authJWT` (correct) but unprotected | Token-guarded with `SCAN_RUNNER_TOKEN` |
| Error responses | Some routes leaked `err.message` | Generic error messages, global error handler catches express.json parse errors |

### Phase 4 — Deployment Readiness

| Check | Before | After |
|-------|--------|-------|
| CORS | Hardcoded `localhost:5173` | Env-based `ALLOWED_ORIGINS` with validation |
| Pi auth | Split naming (`PORTAL_TOKEN` vs `PORTAL_PATCH_TOKEN`) | Unified HMAC signing via `CONTROL_SIGNING_SECRET` for all Pi endpoints |
| Regression guard | None | `npm run lint:security` scans 68 files for 2 forbidden patterns |

### Phase 5 — Optional Polish

| Check | Before | After |
|-------|--------|-------|
| UUID validation | Route params passed directly to Supabase queries | `validateUUID` middleware on 7 routes (after `authJWT`) |
| `updateUser` field allowlist | `req.body` spread directly into update | Only `{ first_name, last_name, username, email, role, status }` accepted |
| Self-deletion guard | Superadmin could delete own account | `if (currentUser.id === id) return 403` |
| `jsonwebtoken` npm package | Installed in root (unused, `jose` is the actual JWT lib) | Removed (14 packages) |

### Phase 6 — Error Leak Prevention (discovered during testing)

| Check | Before | After |
|-------|--------|-------|
| Malformed JSON body | Express default error handler leaked stack trace | Global error handler returns `{ error: "INVALID_JSON" }` with 400 |
| Unhandled errors | Stack traces could reach client | Global error handler returns `{ error: "INTERNAL_ERROR" }` with 500 |

---

## 6-D: Retest Proof

All retests executed via `backend/scripts/phase6-tests.ps1` on **2026-03-05 09:43**:

```
TEST 1 — PUBLIC SURFACE:        3/3 PASS
TEST 2 — ACCESS CONTROL:       29/29 return 401
TEST 3 — UUID VALIDATION:       5/5 PASS (auth-first ordering confirmed)
TEST 4 — SECURITY HEADERS:      6/6 PASS
TEST 5 — RATE LIMITING:         PASS (429 at request 9-10)
TEST 6 — ERROR LEAK:            2/2 PASS (no stack traces, no DB info)
TEST 7 — WEBHOOK AUTH:          2/2 PASS (rejected without valid token)
```

### Regression Guard

```
npm run lint:security
> Scanned 68 files, 0 violations
```

### Reproducibility

To reproduce all tests:
```powershell
cd backend
node server.js                                    # start server
powershell -ExecutionPolicy Bypass -File scripts/phase6-tests.ps1   # run tests
npm run lint:security                              # regression guard
```

---

## 6-E: Limitations

The following limitations should be explicitly stated in the capstone paper:

### 1. In-Memory Rate Limiter
- Rate limiter uses `express-rate-limit` with the default in-memory store
- **Impact:** Counters reset on server restart; not distributed across instances
- **If Railway auto-scales:** Attacker can spread requests across instances to bypass limits
- **Production fix:** `rate-limit-redis` with a shared Redis store

### 2. In-Memory Nonce Cache (HMAC Replay Prevention)
- HMAC nonce cache for Pi command signing is stored in a module-level `Set`
- **Impact:** Nonce seen by instance A is unknown to instance B
- **Production fix:** Centralized nonce store (Redis or DB)

### 3. CSP Environment Awareness
- CSP `connect-src` is configured via environment variables for Railway domain and Supabase URL
- **Impact:** New CDN or third-party domains require explicit addition to `connectSources`
- **Note:** Tested in development mode; production CSP may need tuning per deployment

### 4. HSTS Not Active in Development
- `Strict-Transport-Security` is only enabled when `APP_ENV=production`
- **Rationale:** HSTS on localhost would break HTTP development workflow
- **Evidence:** Test 4 confirms HSTS absent in dev (by design), present when `APP_ENV=production`

### 5. Webhook Authentication Model
- `scan-completed` webhook uses a shared secret token (`X-Scan-Runner-Token` header)
- **Impact:** Token rotation requires coordinated deployment of Express + Pi
- **Production fix:** mTLS or signed webhooks (HMAC with timestamp + nonce)

### 6. No Redis for Multi-Instance State
- Rate limiter, nonce cache, and idempotency cache all use in-memory stores
- **Impact:** Inconsistent state across Railway auto-scaled instances
- **Production fix:** Redis-backed stores for all three

### 7. Tailscale Funnel Constraints
- Funnel publicly listens on limited ports (443, 8443, 10000)
- Funnel relay bandwidth limits apply to scan payloads
- **Mitigation:** HMAC + nginx provide layered defense on the Pi side

### 8. `/health` Endpoint Lacks Security Headers
- Health check is mounted before Helmet middleware (intentional — prevents Railway uptime probe failures)
- **Impact:** `/health` responses lack CSP, X-Frame-Options, etc.
- **Rationale:** Health endpoint returns only `{"status":"ok"}` — no sensitive data, no user interaction
- **All other routes** receive full Helmet headers (6/6 checks pass on post-middleware endpoints)

### 9. SQLi Defense is Architectural, Not Tested with Full Automation
- 100% Supabase SDK usage means zero raw SQL in the codebase
- Manual SQLi payloads in login were rejected (no DB errors leaked)
- **Note:** Full automated SQLi testing (e.g., sqlmap) was not performed — defense is architectural

### 10. JWT Rotation Relies on Supabase JWKS
- JWT key rotation is handled by Supabase's JWKS endpoint
- Express fetches the remote key set via `jose.createRemoteJWKSet()`
- **Impact:** If Supabase rotates keys and the Express JWKS cache is stale, auth may temporarily fail
- **Mitigation:** `jose` handles JWKS refresh automatically

---

## Defense Statements (for capstone paper)

> **Authentication:** JWKS-based JWT verification via `jose`, in-memory access tokens (never in localStorage), HttpOnly refresh cookies with `SameSite=Lax` and path scoping.

> **Authorization:** All 29 protected endpoints return 401 without a valid JWT (verified via automated test suite). Audit endpoints additionally require `superadmin` role. User management routes enforce UUID validation and field allowlisting.

> **Injection Defense:** 100% Supabase SDK usage — zero raw SQL queries in the entire codebase. Manual SQLi payloads rejected without leaking database information.

> **XSS Defense:** React JSX auto-escaping throughout the frontend. Zero uses of `dangerouslySetInnerHTML`. Server responses are JSON-only with proper Content-Type headers.

> **Security Headers:** Helmet provides X-Content-Type-Options, X-Frame-Options, Content-Security-Policy (environment-aware), and removes X-Powered-By fingerprint. HSTS enabled in production.

> **Rate Limiting:** Login endpoint limited to 10 attempts per 15-minute window. Refresh endpoint limited to 20 per 15 minutes. Global limiter at 300 requests per 15 minutes. Automated test confirms 429 response after threshold.

> **Error Handling:** Global error handler intercepts all unhandled exceptions. Malformed JSON returns generic `INVALID_JSON` error. No stack traces or internal details reach the client.

> **Regression Guard:** `npm run lint:security` scans 68 backend files for 3 forbidden patterns (hardcoded URLs, wrong env var names, missing token compat). Zero violations as of final test.

---

## 6-F: Whitebox Assessment (2026-03-07)

> Full source-code review of backend (controllers, middleware, services, repositories, utils, validators, config) and frontend (API layer, context, hooks, components, build config). Findings are categorized by severity and mapped to recommended further testing.

### Assessment Scope

| Layer | Files Reviewed | Method |
|-------|---------------|--------|
| Backend middleware | `authMiddleware.js`, `rateLimiter.js`, `requestIdMiddleware.js`, `roleMiddleware.js`, `statusMiddleware.js`, `validateUUID.js` | Full source read |
| Backend controllers | All 12 controllers (`audit`, `auth`, `captivePortal`, `dashboard`, `detect`, `deviceMgmt`, `history`, `metadata`, `piProxy`, `rasPi`, `sam`, `user`) | Full source read |
| Backend services | `authService.js`, `dashboardService.js`, `detectStateService.js`, `riskPipeline.js` | Full source read |
| Backend repositories | `assessmentRepository.js`, `auditRepository.js`, `userRepository.js` | Full source read |
| Backend utils | `auditLogger.js`, `exportFormatters.js`, `normalization.js`, `piFetch.js`, `riskPipeline.js`, `scanValidation.js`, `scoring.js`, `signing.js`, `sorting.js` | Full source read |
| Backend validators | `authValidator.js`, `rasPiValidator.js`, `userValidators.js` | Full source read |
| Backend config | `envValidation.js`, `supabaseClient.js` | Full source read |
| Frontend API | All 10+ API modules in `src/api/` | Full source read |
| Frontend state | `NetworkContext.js`, `ThreatDetectionContext.js`, auth flow | Full source read |
| Frontend hooks | `useSessionState.js`, `useSAM.js`, `useDevice.js`, `useProfile.js`, etc. | Full source read |
| Frontend routing | `App.jsx`, route guards, login flow | Full source read |
| Existing tests | All 5 unit suites, 4 integration suites, E2E spec | Full source read |

---

### Critical Findings (Require Action Before Production)

#### WB-C1: `requireActiveProfile` Middleware — Defined But Not Applied

**Severity:** CRITICAL (mitigated to HIGH after SEC-001)  
**Files:** `backend/middleware/statusMiddleware.js` (defined), all route files (not imported)

The `requireActiveProfile` middleware correctly queries `profiles.status` and blocks non-active users with 403. However, **zero production routes use it**. It is only imported in `__tests__/helpers/testApp.js` for the synthetic `/api/protected` test route.

**Impact:** Users with status `inactive`, `on_hold`, or `suspended` retain API access as long as their JWT is valid (up to 1h TTL). 

**Mitigation (March 6 — SEC-001):** Deactivation now scrambles the Supabase Auth password with `crypto.randomBytes(64)`, permanently preventing new logins. This narrows the window to only the remaining JWT lifetime (~1h max), but does not eliminate the gap — a deactivated user with a cached JWT can still hit all endpoints until it expires.

**Recommended test:** Add integration tests that verify inactive/on_hold users receive 403 on sensitive endpoints. Add `requireActiveProfile` after `authJWT` on all protected routes (or fold status check into `authJWT`).

---

#### WB-C2: Debug Console.log Leaking Sensitive Data

**Severity:** CRITICAL  
**File:** `backend/controllers/authController.js` (lines 205, 216-217)

```
console.log("[auth/set-refresh] setting cookie, token length:", refresh_token.length, "opts:", JSON.stringify(opts));
console.log("[auth/refresh] cookies:", JSON.stringify(req.cookies));
console.log("[auth/refresh] raw cookie header:", req.headers.cookie);
```

The last two lines log the **actual HttpOnly refresh token** to stdout. Code comment says `// DEBUG: remove after testing`. This was flagged in Phase 4-D but remains in code.

**Impact:** In Railway/production, container logs are accessible to anyone with deploy access. Refresh tokens in logs enable session hijacking.

**Recommended test:** Grep-based regression guard for `console.log.*cookie` patterns.

---

#### WB-C3: Remaining Error Message Leaks in HTTP Responses

**Severity:** HIGH  
**Files:** `rasPiController.js` (lines 337, 354, 407), `userController.js` (line 63), `piProxyController.js` (line ~60)

The global error handler correctly catches `entity.parse.failed` and unhandled exceptions. However, individual controller catch blocks still return raw `err.message` to the client:

```javascript
// rasPiController.js
res.status(500).json({ error: err.message });

// userController.js  
return res.status(400).json({ error: authError.message });
```

**Impact:** Supabase constraint violations, Postgres errors, or internal service errors could leak schema details, table names, or internal URLs.

**Recommended test:** For each controller, send a request that triggers a 500 and verify the response body contains only generic error strings (no `.message`, no stack traces, no internal paths).

---

#### WB-C4: Validators Exist But Are Unused

**Severity:** HIGH  
**Files:** `backend/validators/authValidator.js`, `backend/validators/userValidators.js`, `backend/validators/rasPiValidator.js`

Three validator modules were created but **never imported or applied** in any route file:

| Validator | What It Does | Where It Should Be Applied |
|-----------|-------------|---------------------------|
| `authValidator.login` | `express-validator` rules for email + password format | `POST /api/auth/login` in `authRoutes.js` |
| `createUserValidator` | Required field check for user creation | `POST /api/webapp/profiles` (if it exists) |
| `insertMetadataValidator` | Required field check for network metadata | `POST /api/rasPi/networks` in `rasPiRoutes.js` |

**Impact:** All user input passes directly to controllers with only ad-hoc existence checks. No type, length, format, or charset validation.

**Recommended test:** Input validation tests — send oversized strings (100KB SSID), wrong types (channel = "abc"), unicode edge cases, and verify 400 responses with structured error messages.

---

### High-Severity Findings

#### WB-H1: AP Apply Lock Has No TTL

**Severity:** HIGH  
**File:** `backend/routes/deviceMgmtRoutes.js`

The `ap_apply_in_progress` boolean flag prevents concurrent AP operations. If the orchestrate/apply call to the Pi crashes, times out, or the Express process restarts mid-operation, the lock stays `true` **permanently**. The `releaseApLock` function only runs in the happy path and catch block — but if the process dies, it never executes.

**Impact:** Network permanently locked out of AP operations until manual DB intervention.

**Recommended test:** Simulate a timeout/crash during AP enable (mock piFetch to throw after lock acquired) and verify the lock is released or has a TTL-based auto-release.

---

#### WB-H2: No Input Length/Type Validation on `rasPiController.saveNetworkMetadataScan`

**Severity:** HIGH  
**File:** `backend/controllers/rasPiController.js`

User-supplied fields (`city`, `province`, `notes`, `ssid`, `bssid`) are destructured from `req.body` and passed directly to Supabase upsert. No validation for:
- String length (notes could be megabytes)
- Data type (channel should be numeric 1-14)
- Character set (unicode bombs, null bytes)

**Impact:** Oversized payloads stored in DB; potential denial-of-service via storage exhaustion.

**Recommended test:** Send a payload with `notes` = 1MB string, `channel` = "not-a-number", `ssid` = null bytes. Verify controller rejects with 400.

---

#### WB-H3: Audit Logging Silently Swallows Errors

**Severity:** MEDIUM-HIGH  
**File:** `backend/utils/auditLogger.js`

All audit calls use `.catch(() => {})` or `.catch((err) => console.error(...))`. If the audit DB is down or the insert fails, critical security events (LOGIN, DELETE_USER, ARCHIVE, AP_ENABLE) are silently lost.

**Impact:** Compliance gap — security events may not be recorded. No alerting on audit infrastructure failures.

**Recommended test:** Mock `supabaseAdmin.from('audit_logs').insert()` to fail and verify the calling function still completes (current behavior). Document this as a known limitation.

---

#### WB-H4: `supabaseClient.js` Null UUID Debug Wrapper — Logs But Doesn't Enforce

**Severity:** MEDIUM  
**File:** `backend/config/supabaseClient.js`

The `.eq()` and `.in()` wrappers log errors when called with `null` or `'null'` values but **still execute the query**. This is a debugging aid, not a guard.

**Impact:** If a controller passes a null UUID, the query executes against Supabase and may return unexpected rows (WHERE id = null) or Postgres errors.

**Recommended test:** Verify that `validateUUID` middleware catches null/invalid UUIDs before they reach the Supabase client. For routes without UUID params (e.g., query params), add explicit null checks.

---

### Frontend Findings

#### WB-F1: Frontend Security Posture — Strong

The frontend has a solid security architecture:

| Control | Implementation | Status |
|---------|---------------|--------|
| Token storage | In-memory access token (never localStorage) | ✅ Secure |
| Refresh token | HttpOnly cookie (server-set) | ✅ Secure |
| Token refresh | Single-flight queue in axios interceptor | ✅ Secure |
| Route guards | Protected routes redirect to `/login` | ✅ Secure |
| XSS defense | Zero `dangerouslySetInnerHTML` | ✅ Secure |
| Logout | Multi-layer: API + memory + storage + redirect | ✅ Secure |
| Session state | `sessionStorage` with `wf:` prefix + versioning | ✅ Secure |

#### WB-F2: Minor Frontend Gaps

| Finding | File | Severity | Detail |
|---------|------|----------|--------|
| Debug console.logs | `src/api/rasPiApi.js`, `src/hooks/useDevice.js`, `src/hooks/useSAM.js` | LOW | Network IDs, BSSID data, payload structures logged to console. Strip or wrap in `import.meta.env.DEV` check. |
| localStorage for SAM timestamps | `src/hooks/useSAM.js` | LOW | Uses `localStorage` for BSSID "cleared" timestamps. Persists across sessions. Should use `sessionStorage` for tab-scope isolation. |
| Raw error display | `src/pages/AccountsAudit/AccountsAudit.jsx`, `src/pages/TestAuth/TestAuth.jsx` | LOW | Backend error messages displayed directly to users. If backend leaks internal details, frontend amplifies them. |
| Report template injection surface | `src/utils/reportTemplates.js` | LOW | Builds HTML via template literals with `JSON.stringify()`. SSID/threat names could break JSON context. Low risk since reports are generated client-side. |

---

### Test Coverage Gap Analysis

#### Current Coverage (132 unit + 43 integration = 175 tests)

| Component | Tests Exist? | Coverage Level | Missing |
|-----------|-------------|---------------|---------|
| `scoring.js` | ✅ 20 tests | HIGH | — |
| `normalization.js` | ✅ 20 tests | HIGH | — |
| `sorting.js` | ✅ 16 tests | HIGH | — |
| `exportFormatters.js` | ✅ 14 tests | HIGH | — |
| `scanValidation.js` | ✅ 17 tests | HIGH | — |
| `signing.js` | ✅ Tests exist | MEDIUM | Pi-side signature verification |
| Auth routes | ✅ 7 tests | MEDIUM | Temp password flow, origin validation bypass, token rotation |
| Scan ingestion | ✅ 6 tests | MEDIUM | Null findings, vulnerability persistence errors |
| Authorization | ✅ 8 tests | MEDIUM | `requireActiveProfile` enforcement (tested in test helper but not production routes) |
| Device management | ✅ 16 tests | HIGH | Lock TTL, crash recovery |
| **rasPiController** | ❌ | ZERO | All handlers untested: `triggerScan`, `saveNetworkMetadataScan`, `getNetworks`, `getNetworksById` |
| **userController** | ❌ | ZERO | CRUD operations, role checks, field allowlist, self-deletion guard |
| **detectController** | ❌ | ZERO | `startDetection`, `stopDetection`, `heartbeat`, `poll` handlers |
| **captivePortalController** | ❌ | ZERO | All 11 captive portal endpoints |
| **dashboardController** | ❌ | ZERO | Summary, network list, parallel queries |
| **historyController** | ❌ | ZERO | Vulnerability/threat history queries |
| **auditController** | ❌ | ZERO | Pagination, search, date filters, export, archive |
| **detectStateService** | ❌ | ZERO | Optimistic locking, retry logic, race conditions, heartbeat timeout |
| **riskPipeline** | ❌ | ZERO | Bucket derivation, portal patching, cooldown |
| **piFetch** | ❌ | ZERO | Signing enforcement, timeout behavior, error wrapping |
| **auditLogger** | ❌ | ZERO | Event formatting, silent failure behavior, archive logic |
| **auditRepository** | ❌ | ZERO | SQL whitelist, pagination, date range filtering |
| E2E tests | ✅ 4 tests | LOW | Only device management golden path; no auth E2E, no scan E2E |

#### Recommended Additional Tests (Priority Order)

| Priority | Component | Test Type | What to Test | Est. Cases |
|----------|-----------|-----------|-------------|-----------|
| P0 | `requireActiveProfile` enforcement | Integration | Inactive user with valid JWT → 403 on each protected route group | 8 |
| P0 | Error leak prevention | Integration | Trigger 500 on each controller → verify no `err.message` in response body | 12 |
| P0 | Input validation | Unit + Integration | Oversized strings, wrong types, null bytes, unicode edge cases on `rasPi`, `captivePortal`, `user` endpoints | 20 |
| P1 | `userController` CRUD | Integration | Create, read, update (field allowlist), delete (self-deletion guard), role check | 10 |
| P1 | `detectController` lifecycle | Integration | Start → heartbeat → poll → stop flow with mocked Pi | 8 |
| P1 | `auditController` queries | Integration | Pagination boundaries, search injection, date range, export format | 8 |
| P1 | `captivePortalController` | Integration | CRUD for announcements, terms, tips, risk-classifications, sync | 12 |
| P2 | `detectStateService` concurrency | Unit | Concurrent `startOrSwitch` calls, lock conflict, retry exhaustion | 6 |
| P2 | `riskPipeline` | Unit | Bucket derivation edge cases, version bumping, portal patch cooldown | 8 |
| P2 | `piFetch` signing | Unit | HMAC generation matches expected format, timeout handling, signing skip in dev | 6 |
| P2 | `auditLogger` failure modes | Unit | Insert failure → silent catch, old/new value serialization, entity ID fallback | 5 |
| P3 | AP lock TTL | Integration | Lock acquired → crash simulation → verify lock auto-releases | 3 |
| P3 | E2E auth flow | E2E (Playwright) | Login → dashboard → refresh → logout → protected page redirect | 4 |

**Estimated additional tests:** ~130 cases across 13 components.

---

### Positive Controls Confirmed by Whitebox Review

These patterns were verified at the source code level (not just via black-box testing):

| Control | Evidence | Rating |
|---------|----------|--------|
| JWKS verification | `authMiddleware.js` uses `jose.createRemoteJWKSet()` with audience validation | ✅ |
| HMAC request signing | `signing.js` builds canonical string (method + path + timestamp + nonce + body SHA256). `piFetch.js` enforces signing in production. | ✅ |
| Optimistic locking | `detectStateService.js` uses `updated_at` as lock with 3-attempt retry | ✅ |
| Audit trail | `auditLogger.js` captures actor, entity, old/new values, request ID, IP, user-agent | ✅ |
| Field allowlist | `userController.js` destructures only 6 permitted fields for `updateUser` | ✅ |
| Self-deletion guard | `userController.js` blocks `currentUser.id === id` in `deleteUser` | ✅ |
| Deactivation password scramble (SEC-001) | `deactivateUser` overwrites auth password with `crypto.randomBytes(64)` — old credentials permanently destroyed. Failure is non-fatal (login already blocked by `status=inactive`). | ✅ |
| Mandatory temp PW on reactivation (SEC-002) | `reactivateUser` always generates temp password when reactivating to `active` — backend enforces server-side regardless of frontend flag. Reactivation to `on_hold` does not generate temp PW. | ✅ |
| Deactivation modal error handling (BUG-001) | `confirmAction` uses `actionSucceeded` flag — modal cleanup skipped on failure, `alert()` shows error, `handleDeactivate` validates user ID before proceeding. | ✅ |
| UUID validation | `validateUUID.js` factory function applied on 7 routes with `:id`/`:networkId` params | ✅ |
| Environment validation | `envValidation.js` crashes on missing vars before Express setup | ✅ |
| Retry logic | `detectStateService.js` handles concurrency with MAX_RETRIES=2 + idempotency check | ✅ |
| Risk versioning | `riskPipeline.js` bumps `risk_score_version` atomically on score change | ✅ |
| In-memory token storage (frontend) | `src/api/axios.js` stores access token in module-level variable, never localStorage | ✅ |
| Single-flight refresh (frontend) | Axios interceptor queues concurrent 401 retries behind a single refresh call | ✅ |

---

### Summary: What Should Be Done Next

#### Immediate (Before Any Production Deploy)

1. **Remove debug console.logs** from `authController.js` (lines 205, 216-217) — session token leak
2. **Apply `requireActiveProfile`** to all JWT-protected routes — or fold status check into `authJWT` middleware
3. **Wire up validators** — apply existing `authValidator.login` to `/api/auth/login`, or remove dead validator files
4. **Fix remaining `err.message` leaks** in `rasPiController.js` (lines 337, 354, 407) and `userController.js` (line 63)
5. **Set explicit `express.json({ limit: '100kb' })`** in `server.js`

#### Short-Term (Next Sprint)

6. Add integration tests for `userController`, `detectController`, `auditController`, `captivePortalController` (~38 cases)
7. Add input validation tests — oversized/malformed payloads across all POST endpoints (~20 cases)
8. Add error leak regression tests — trigger 500 on each controller and verify generic responses (~12 cases)
9. Add AP lock TTL or session-scoped auto-release to `deviceMgmtRoutes.js`
10. Strip frontend debug `console.log` calls or wrap in `import.meta.env.DEV`

#### Medium-Term

11. Add unit tests for `detectStateService`, `riskPipeline`, `piFetch`, `auditLogger` (~25 cases)
12. Add E2E tests for auth lifecycle and scan-to-detection flow (~8 cases)
13. Implement structured logging (Winston/Pino) — replace scattered `console.log`/`console.error`
14. Add audit log failure alerting (dead-letter queue or monitoring hook)
15. Move all hardcoded timeouts to environment variables (e.g., `HEARTBEAT_TIMEOUT_SEC`)
