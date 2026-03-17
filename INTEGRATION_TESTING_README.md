# Integration Testing Documentation

> **Complete catalog of all integration test cases in the codebase.**
> Each section maps to a test file under `backend/__tests__/integration/`. Test cases are grouped by the `describe` block (API endpoint under test) and listed with their purpose and interpretation.

---

## Table of Contents

| # | Test File | System Under Test | Tests |
|---|-----------|-------------------|:-----:|
| 1 | [auth.test.js](#1-authtestjs) | Authentication & Session Flow | 9 |
| 2 | [authorization.test.js](#2-authorizationtestjs) | Role-Based Access Control (RBAC) | 9 |
| 3 | [deviceMgmt.test.js](#3-devicemgmttestjs) | Device Management (AP Enable/Disable/Polling) | 25 |
| 4 | [scanIngestion.test.js](#4-scaningestiontestjs) | Scan Ingestion Pipeline & Device Signals | 8 |
| | | **Total** | **51** |

---

## How Integration Tests Differ from Unit Tests

| Aspect | Unit Tests | Integration Tests |
|--------|-----------|-------------------|
| **Scope** | Single function or module in isolation | Full Express route stack (middleware → controller → service → response) |
| **Mocking** | Only the function's direct dependencies | Supabase DB layer and external APIs (FastAPI/Pi), but **real** Express middleware runs |
| **Tool** | Direct function calls | [supertest](https://github.com/ladakh/supertest) — sends real HTTP requests through Express |
| **Cookie/Session** | N/A | `supertest.agent()` for cookie persistence across requests |
| **What breaks** | Logic bugs in a function | Route misconfiguration, middleware ordering, request validation, HTTP status codes, header handling |

---

## Test Infrastructure

| File | Purpose |
|------|---------|
| `backend/__tests__/helpers/testApp.js` | Creates a fresh Express app with all real middleware (cookie-parser, JSON, CORS, auth, routes) for each test suite |
| `backend/__tests__/helpers/mockSupabase.js` | Reusable Supabase client mock with chainable query builder |
| `backend/__tests__/fixtures/scanPayloads.js` | Valid and invalid scan payloads (normal, missing fields, XSS) |
| `backend/__tests__/fixtures/deviceMgmtPayloads.js` | Network rows, scan fixtures, enable/disable bodies, FastAPI response mocks |
| `backend/__tests__/fixtures/threatDefinitions.js` | Threat definition maps and sample poll results |

### Mocking Strategy

All integration tests follow the same pattern:
1. **JWT verification** (`jose`) is mocked to accept any Bearer token and return a configurable user payload
2. **Supabase profile lookup** (`@supabase/supabase-js`) is mocked so the `statusMiddleware` passes
3. **Supabase data layer** (`config/supabaseClient`) is mocked per-test with chainable query builders
4. **External HTTP** (`global.fetch`) is mocked to simulate FastAPI/Pi device responses
5. **Real Express stack** runs: cookie-parser, JSON body parser, CORS, auth middleware, route handlers

---

## 1. auth.test.js

**File:** `backend/__tests__/integration/auth.test.js`
**Routes Under Test:** `/api/auth/login`, `/api/auth/set-refresh`, `/api/auth/refresh`, `/api/auth/logout`, `/api/protected`

**Purpose:** Tests the complete authentication and session flow — from login (with Supabase credential verification) through token refresh (with HttpOnly cookie rotation) to logout (cookie clearing). Uses `supertest.agent()` for cross-request cookie persistence.

### Manuscript Interpretation

Authentication is the gateway to every protected feature. The system delegates credential verification to Supabase Auth (via REST API), but wraps it with its own session management layer: the access token is returned in the JSON response body (for frontend `Authorization` header use), while the refresh token is stored in an HttpOnly, Secure cookie (invisible to JavaScript, immune to XSS theft). Token refresh uses the cookie to obtain a new access token without re-entering credentials. These tests validate the full round-trip: login → cookie set → token refresh → logout → cookie cleared. They also verify that protected endpoints reject requests without valid tokens.

### Test Cases

#### A. `POST /api/auth/login` — Credential authentication

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 1 | `returns 200 with token on valid credentials` | `200` | Mocked Supabase returns `access_token` + `refresh_token` + `user`. The route responds with `{ token, user }` where `user.email` matches. Proves the login-to-token pipeline works end-to-end. |
| 2 | `returns 401 on invalid credentials` | `401` | Mocked Supabase returns `invalid_grant` error. The route responds with `401` and an error message containing `"Invalid"`. Proves bad credentials don't leak data or return success. |
| 3 | `returns 400 when email or password is missing` | `400` | Sending an empty body `{}` hits the request validator before Supabase is called. Returns a `400` with an `errors` array listing the missing fields. Tests input validation middleware. |

#### B. `POST /api/auth/set-refresh` — Secure cookie storage

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 4 | `sets HttpOnly cookie on valid refresh_token` | `200` | Sends `{ refresh_token: "test-refresh-token" }` and verifies (a) `Set-Cookie` header is present, (b) cookie name is `sb_refresh`, (c) cookie has the `HttpOnly` flag (blocks JavaScript access — XSS protection). |
| 5 | `returns 400 when refresh_token is missing` | `400` | Sending `{}` returns a `400` with an error containing `"Missing"`. Guards against incomplete requests. |

#### C. `POST /api/auth/refresh` — Token rotation

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 6 | `returns new access_token when valid cookie present` | `200` | Uses `supertest.agent()` to first set the refresh cookie (via `/set-refresh`), then calls `/refresh`. Mocked Supabase returns a new token pair. Verifies (a) `access_token` is `"new-access-token"`, (b) `expires_in` is `3600`, (c) a new `Set-Cookie` header rotates the refresh token. This tests the full cookie-based token refresh cycle. |
| 7 | `returns 401 without refresh cookie` | `401` | Calling `/refresh` without a prior `/set-refresh` (no cookie) returns `401` with `"No refresh cookie"`. Prevents unauthenticated refreshes. |

#### D. `POST /api/auth/logout` — Session teardown

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 8 | `clears refresh cookie` | `200` | Uses `supertest.agent()` to set a cookie, then calls `/logout`. Verifies the `Set-Cookie` header contains either `Expires=Thu, 01 Jan 1970` or `max-age=0` — both standard ways to delete a cookie. Proves the server-side session is fully terminated. |

#### E. `GET /api/protected` — Token-guarded endpoint

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 9 | `returns 401 without Authorization header` | `401` | Calling a protected endpoint with no `Authorization` header is rejected before JWT verification runs. Tests the middleware guard. |
| 10 | `returns 200 with valid Bearer token` | `200` | Sending `Authorization: Bearer valid-test-token` (accepted by the mocked `jose.jwtVerify`) returns `{ ok: true, user: { id: "user-123" } }`. Proves the full auth middleware pipeline (header parsing → JWT verify → user extraction) works. |

---

## 2. authorization.test.js

**File:** `backend/__tests__/integration/authorization.test.js`  
**Routes Under Test:** `/api/admin/users`, `/api/protected`, `/api/protected/active`

**Purpose:** Tests role-based access control (RBAC) and account status checks. Each test configures the JWT mock to return a different user role or profile status, then verifies the correct HTTP response code (200, 401, or 403).

### Manuscript Interpretation

Authorization is the second layer of security after authentication. A valid JWT proves *who* the user is; authorization determines *what* they can do. The system enforces three levels:

1. **Authentication required:** Any request without a valid token is rejected with `401`.
2. **Role-based access:** Only `superadmin` users can access admin endpoints (`/api/admin/*`). Regular `authenticated` and even `admin` roles receive `403 Forbidden`.
3. **Active profile check:** Beyond role, certain endpoints require the user's profile status to be `"active"`. Users with `"on_hold"` or `"inactive"` status are blocked with `403`.

These tests verify that the middleware stack correctly chains these checks and returns the appropriate status codes and error messages.

### Test Cases

#### A. Role-based access — admin endpoint gate

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 1 | `non-admin user receives 403 from admin endpoint` | `403` | JWT role = `"authenticated"` (regular user). Response contains `"Superadmin"` in error message. Proves non-admin users cannot access admin features. |
| 2 | `superadmin user receives 200 from admin endpoint` | `200` | JWT role = `"superadmin"`. Response contains `{ users: [...] }`. Only this role passes the admin guard. |
| 3 | `admin user (non-superadmin) receives 403 from admin endpoint` | `403` | JWT role = `"admin"` (elevated, but not superadmin). Still blocked. Tests the distinction between `admin` and `superadmin` — a common RBAC pitfall. |

#### B. Authentication required — token validation

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 4 | `missing Authorization header returns 401` | `401` | No `Authorization` header → middleware responds with `"Missing token"` before JWT verification runs. |
| 5 | `malformed Bearer token returns 401` | `401` | JWT verification throws `"Invalid token"`. Response contains `"Invalid"`. Tests the error path when the token is structurally invalid. |
| 6 | `expired token returns 401` | `401` | JWT verification throws an error with `code: "ERR_JWT_EXPIRED"`. Expired tokens are treated as invalid — no access granted. |

#### C. Active profile middleware — account status gate

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 7 | `active user accesses protected/active route` | `200` | Profile lookup returns `status: "active"`. User passes both auth and status checks. |
| 8 | `on_hold user receives 403 from active-only route` | `403` | Profile lookup returns `status: "on_hold"`. Response contains `"not active"` and `status: "on_hold"`. Tests the status middleware's rejection path. |
| 9 | `inactive user receives 403` | `403` | Profile lookup returns `status: "inactive"`. Same `403` rejection — proves the middleware blocks all non-active states. |

---

## 3. deviceMgmt.test.js

**File:** `backend/__tests__/integration/deviceMgmt.test.js`  
**Routes Under Test:** `GET /api/device/ap-state/:networkId`, `POST /api/device/enable-ap`, `GET /api/device/jobs/:jobId`, `GET /api/device/ap-live`

**Purpose:** Tests the device management system — the most complex integration in the codebase. Covers AP (Access Point) state queries, the enable/disable flow (with scan validation, portal initialization, and Pi communication), async job tracking, and live AP status polling.

### Manuscript Interpretation

Device management is the operational core of the system. When a user enables the honeypot AP on a monitored network, the system must:
1. **Validate** that a recent, matching scan exists (prevents acting on stale data)
2. **Initialize the captive portal** on first enable (seed default content, build the portal payload, patch the Pi)
3. **Apply the AP configuration** to the Pi device via FastAPI (`/orchestrate/apply`)
4. **Handle async responses** when the Pi accepts but hasn't completed the operation
5. **Poll job status** until the Pi reports completion or failure
6. **Query live AP state** to verify the physical device matches expectations

These tests cover every path: happy path, validation failures (missing fields, stale scan, network mismatch), first-enable vs. subsequent-enable, enable vs. disable, sync vs. async responses, job polling states (ONGOING/DONE/FAILED/cached/unreachable), and live status queries. The mocking is extensive — per-test Supabase table configurations and per-URL `global.fetch` responses — reflecting the real-world complexity of orchestrating a distributed system.

### Test Cases

#### A. `GET /api/device/ap-state/:networkId` — DB state query

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 1 | `returns ap_enabled and portal_initialized from DB` | `200` | DB returns `{ ap_enabled: true, portal_initialized: true }`. Both flags are forwarded in the response. |
| 2 | `defaults to false when columns are null` | `200` | DB returns `null` for both columns. Response defaults to `{ ap_enabled: false, portal_initialized: false }`. Handles fresh networks with no AP history. |
| 3 | `returns 500 when DB query fails` | `500` | Supabase returns an error. Response is `500` with `"Failed to fetch AP state"`. Tests the error propagation path. |

#### B. `POST /api/device/enable-ap` — Input validation

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 4 | `400 when network_id is missing` | `400` | Sending `{ ap_status: "enable" }` without `network_id`. Returns `VALIDATION_ERROR` with `errors` array. Request validator catches missing required field. |
| 5 | `400 when ap_status is invalid` | `400` | Sending `ap_status: "toggle"` (not `"enable"` or `"disable"`). Returns `VALIDATION_ERROR`. Tests enum validation. |
| 6 | `400 SCAN_REQUIRED when enable without scan_id` | `400` | Enabling without providing a `scan_id`. Returns `SCAN_REQUIRED`. The system requires a recent scan before enabling the AP. |

#### C. `POST /api/device/enable-ap` — Enable path

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 7 | `400 SCAN_NOT_FOUND when scan not found in DB` | `400` | The provided `scan_id` doesn't exist in `vulnerability_scans` table. Returns `SCAN_NOT_FOUND`. |
| 8 | `400 SCAN_NETWORK_MISMATCH when scan belongs to different network` | `400` | The scan exists but its `network_id` doesn't match the request's `network_id`. Returns `SCAN_NETWORK_MISMATCH`. Authorization check — prevents using another network's scan. |
| 9 | `400 SCAN_TOO_OLD when scan exceeds max age` | `400` | The scan exists and matches the network, but `finished_at` is too far in the past. Returns `SCAN_TOO_OLD` with `scan_age_seconds` and `max_age_seconds` for diagnostics. |
| 10 | `first enable → calls portal/patch THEN orchestrate/apply, sets ap_enabled + portal_initialized` | `200` | The most comprehensive test case. Network has `portal_initialized: false` (first time). Verifies: (a) `seedDefaultContent` is called to populate portal DB, (b) `buildPortalPayloadFromDB` is called twice (pre-enable patch + post-enable patch), (c) fetch calls are in order: `portal/patch` → `orchestrate/apply` → `portal/patch`, (d) portal payload includes `riskColor` and `riskDescription` (not "NOT YET ASSESSED"), (e) orchestrate payload uses DB config (not request body), (f) response has `ap_enabled: true, portal_initialized: true`. |
| 11 | `second enable (portal already initialized) → skips portal/patch` | `200` | Network already has `portal_initialized: true`. Verifies: (a) only 2 fetch calls (`orchestrate/apply` + post-enable `portal/patch`), (b) `seedDefaultContent` is NOT called, (c) `buildPortalPayloadFromDB` called only once. Tests the optimization path. |
| 12 | `enable includes ap_password in orchestrate/apply when provided` | `200` | Sending `ap_password: "secret123"` in the request body. Verifies the password is forwarded in the `orchestrate/apply` payload to the Pi. |
| 13 | `502 when orchestrate/apply returns error` | `502` | FastAPI returns HTTP 500. Server responds with `FASTAPI_APPLY_FAILED`. Tests error handling for Pi communication failures. |

#### D. `POST /api/device/enable-ap` — Disable path

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 14 | `disable works without scan_id` | `200` | Disabling the AP doesn't require a scan (unlike enabling). Verifies: (a) only 1 fetch call to `orchestrate/apply`, (b) no `portal/patch` call, (c) response has `ap_status: "disable"`, (d) payload uses DB-stored `ssid`. |
| 15 | `disable does not include ap_password` | `200` | The `orchestrate/apply` payload for disable has no `ap_password` field. Passwords are only relevant for enabling. |
| 16 | `500 when network not found in DB on disable` | `500` | Network doesn't exist in DB. Returns `500`. Even disable requires a valid network. |

#### E. `POST /api/device/enable-ap` — Async ACCEPTED path

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 17 | `returns ACCEPTED with job_id when Pi accepts async` | `200` | Pi returns `{ status: "ACCEPTED", job_id: "orch_..." }`. Server responds with `{ status: "ACCEPTED", job_id, ok: true }`. The client must then poll `/jobs/:jobId` for completion. |
| 18 | `409 when async job is already active for network` | `409` | An active job already exists in `apJobStore` for this network. Returns `REQUEST_IN_PROGRESS` with the existing `job_id`. Prevents duplicate concurrent operations. |

#### F. `GET /api/device/jobs/:jobId` — Async job polling

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 19 | `400 for invalid jobId format` | `400` | Job ID `"bad-format!"` fails format validation. Prevents injection via malformed IDs. |
| 20 | `returns ONGOING when Pi reports ongoing` | `200` | Pi's `/orchestrate/poll` returns `{ status: "ONGOING" }`. Server responds with `{ job_status: "ONGOING", ok: true }`. Client should continue polling. |
| 21 | `returns DONE and finalizes job when Pi reports done` | `200` | Pi reports completion. Server: (a) responds with `{ job_status: "DONE", ok: true }`, (b) marks job as `finalized` in `apJobStore` (prevents redundant finalization work on future polls), (c) triggers portal patch during finalization. |
| 22 | `returns cached result for already-finalized job without hitting Pi` | `200` | Job was previously finalized. Server returns the cached result directly — `global.fetch` is NOT called. Proves the caching optimization works (no unnecessary Pi calls). |
| 23 | `returns FAILED when Pi result is ERROR` | `200` | Pi reports failure. Server responds with `{ job_status: "FAILED", ok: false, error_code: ... }`. The HTTP status is still `200` (the poll itself succeeded — the *job* failed). |
| 24 | `PI_UNREACHABLE when fetch fails` | `200` | `global.fetch` returns HTTP 500 (Pi is down). Server responds with `{ job_status: "UNKNOWN", error_code: "PI_UNREACHABLE" }`. Distinguishes between job failure and network failure. |

#### G. `GET /api/device/ap-live` — Live AP state from Pi

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 25 | `returns ENABLED when Pi reports AP enabled` | `200` | Pi reports AP is running. Response has `{ ap_status: "ENABLED", uplink_status: "CONNECTED" }`. Provides real-time device state. |
| 26 | `returns DISABLED when Pi reports AP disabled` | `200` | Pi reports AP is off. Response has `{ ap_status: "DISABLED" }`. |
| 27 | `returns UNKNOWN when Pi is unreachable` | `200` | Pi returns HTTP 500. Response: `{ ok: false, ap_status: "UNKNOWN" }`. The endpoint always returns `200` — the `ok` flag and `ap_status` communicate the actual state. |

---

## 4. scanIngestion.test.js

**File:** `backend/__tests__/integration/scanIngestion.test.js`  
**Routes Under Test:** `POST /api/rasPi/networks`, `POST /api/rasPi/scan`, `POST /api/device/signal_ap`

**Purpose:** Tests the scan data ingestion pipeline — how Wi-Fi scan results from the Raspberry Pi are received, validated, stored, and how scan triggers and device signals flow through the system.

### Manuscript Interpretation

The scan ingestion pipeline is the primary data entry point for the system. The Raspberry Pi performs Wi-Fi scans and sends the results to the backend via `POST /api/rasPi/networks`. The pipeline must (1) validate the incoming payload (required fields, valid formats), (2) normalize the data (BSSID uppercase, SSID trimmed), (3) determine if the network already exists or needs creation, (4) store the scan with associated vulnerability findings, and (5) trigger risk score recalculation.

The scan trigger endpoint (`POST /api/rasPi/scan`) is a reverse-proxy that forwards scan initiation requests to the FastAPI service running on the Pi. The device signal endpoint (`POST /api/device/signal_ap`) is a simpler toggle acknowledgment for AP state changes.

### Test Cases

#### A. `POST /api/rasPi/networks` — Scan data ingestion

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 1 | `returns 201 with valid scan payload` | `201` | A complete, valid scan payload with vulnerability findings is accepted. The pipeline: (a) looks up the network (new → insert), (b) creates a scan record, (c) looks up vulnerability definitions for each finding, (d) calls `rpc` for risk score calculation, (e) returns `{ status: "OK", network_id }`. Proves the full ingestion pipeline works. |
| 2 | `returns 400 with missing required fields` | `400` | Sending `{ ssid: "Test" }` (no bssid, no channel). Returns `VALIDATION_ERROR` with an `errors` array listing each missing field. Validates the request schema enforcement. |
| 3 | `returns 400 with empty body` | `400` | Sending `{}`. Same validation error. Confirms the validator catches completely empty payloads. |

#### B. `POST /api/rasPi/scan` — Scan trigger proxy

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 4 | `proxies to FastAPI and returns 200 on success` | `200` | Forwards the scan request to FastAPI. Verifies (a) `global.fetch` was called with a URL containing `/scan` and method `POST`, (b) FastAPI's response `{ status: "OK", scan_id, message }` is forwarded to the client. The backend acts as a transparent proxy. |
| 5 | `returns 400 when ssid/bssid/channel missing` | `400` | Missing required fields are caught by the backend validator *before* the request is proxied to FastAPI. Returns `VALIDATION_ERROR` with `errors` array. |
| 6 | `returns 502 when FastAPI is unreachable` | `502` | `global.fetch` throws `ECONNREFUSED`. Server returns `502 Bad Gateway`. Proper error classification: this is the backend's upstream failing, not the client's fault. |

#### C. `POST /api/device/signal_ap` — Device toggle signal

| # | Test Case | HTTP | What It Validates |
|---|-----------|:----:|-------------------|
| 7 | `acknowledges toggle ON` | `200` | Sending `{ toggleState: true }` returns `{ success: true, status: "Active" }`. A simple acknowledgment — the actual AP enable/disable is handled by the separate `/enable-ap` endpoint. |
| 8 | `acknowledges toggle OFF` | `200` | Sending `{ toggleState: false }` returns `{ success: true, status: "Disabled" }`. |

---

## Request Flow Diagrams

### Authentication Flow (auth.test.js)

```
Client                          Express Server                    Supabase Auth
  │                                  │                                 │
  ├─ POST /api/auth/login ──────────►│                                 │
  │   { email, password }            ├─ fetch() ──────────────────────►│
  │                                  │◄─ { access_token, refresh }─────┤
  │◄─ 200 { token, user } ──────────┤                                 │
  │                                  │                                 │
  ├─ POST /api/auth/set-refresh ────►│                                 │
  │   { refresh_token }              ├─ Set-Cookie: sb_refresh ────────┤
  │◄─ 200 { ok: true } ─────────────┤                                 │
  │   [Cookie: sb_refresh]           │                                 │
  │                                  │                                 │
  ├─ POST /api/auth/refresh ────────►│                                 │
  │   [Cookie: sb_refresh]           ├─ fetch() (refresh) ────────────►│
  │                                  │◄─ { new_access, new_refresh }───┤
  │◄─ 200 { access_token } ─────────┤                                 │
  │   [Set-Cookie: sb_refresh=new]   │                                 │
  │                                  │                                 │
  ├─ POST /api/auth/logout ─────────►│                                 │
  │◄─ 200 [Set-Cookie: expired] ────┤                                 │
```

### Device Enable Flow (deviceMgmt.test.js)

```
Client                    Express Server                Supabase DB         Pi FastAPI
  │                            │                             │                  │
  ├─ POST /enable-ap ─────────►│                             │                  │
  │   { network_id,            ├─ validate scan_id ─────────►│                  │
  │     scan_id,               │◄─ scan row ─────────────────┤                  │
  │     ap_status: "enable" }  │                             │                  │
  │                            ├─ check scan freshness       │                  │
  │                            ├─ check network match        │                  │
  │                            │                             │                  │
  │                            ├─ [first enable only]        │                  │
  │                            │   seedDefaultContent() ────►│                  │
  │                            │   buildPortalPayload() ────►│                  │
  │                            │   POST /portal/patch ──────────────────────────►│
  │                            │◄──────────────────────────────────── 200 ok ───┤
  │                            │                             │                  │
  │                            ├─ POST /orchestrate/apply ──────────────────────►│
  │                            │◄──────────────────────── { status: ACCEPTED } ─┤
  │                            │                             │                  │
  │◄─ 200 { status: ACCEPTED, │                             │                  │
  │     job_id: "orch_..." } ──┤                             │                  │
  │                            │                             │                  │
  ├─ GET /jobs/:jobId ────────►│                             │                  │
  │                            ├─ GET /orchestrate/poll ────────────────────────►│
  │                            │◄──────────────────────── { status: ONGOING } ──┤
  │◄─ 200 { job_status:       │                             │                  │
  │     "ONGOING" } ───────────┤                             │                  │
  │                            │                             │                  │
  ├─ GET /jobs/:jobId ────────►│                             │                  │
  │                            ├─ GET /orchestrate/poll ────────────────────────►│
  │                            │◄──────────────────────── { status: DONE } ─────┤
  │                            ├─ update DB (ap_enabled) ───►│                  │
  │                            ├─ POST /portal/patch ──────────────────────────►│
  │◄─ 200 { job_status:       │                             │                  │
  │     "DONE" } ──────────────┤                             │                  │
```

---

## Running the Tests

```bash
# Navigate to the backend directory
cd backend

# Run all integration tests
npx jest --testPathPattern="__tests__/integration" --verbose

# Run a specific integration test file
npx jest --testPathPattern="__tests__/integration/auth.test.js" --verbose

# Run integration tests with coverage
npx jest --testPathPattern="__tests__/integration" --coverage

# Run both unit and integration tests
npx jest --verbose
```

---

## Error Code Reference

The following error codes appear across integration tests and are part of the API contract:

| Error Code | HTTP | Endpoint | Meaning |
|-----------|:----:|----------|---------|
| `VALIDATION_ERROR` | 400 | Multiple | Request body missing required fields or has invalid values |
| `SCAN_REQUIRED` | 400 | `/enable-ap` | Enable request lacks a `scan_id` |
| `SCAN_NOT_FOUND` | 400 | `/enable-ap` | The provided `scan_id` doesn't exist in the database |
| `SCAN_NETWORK_MISMATCH` | 400 | `/enable-ap` | The scan belongs to a different network than requested |
| `SCAN_TOO_OLD` | 400 | `/enable-ap` | The scan's `finished_at` exceeds the freshness threshold |
| `REQUEST_IN_PROGRESS` | 409 | `/enable-ap` | An async AP job is already active for this network |
| `FASTAPI_APPLY_FAILED` | 502 | `/enable-ap` | Pi's `/orchestrate/apply` returned a non-OK response |
| `PI_UNREACHABLE` | 200* | `/jobs/:jobId` | Pi is unreachable during job polling |

\* Job polling always returns HTTP 200; the error is communicated via `error_code` in the body.

---

*Generated from codebase analysis. 4 test files, 51 individual integration test cases.*
