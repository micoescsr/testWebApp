# Pi Gateway — HMAC-SHA256 Request Signing

## Overview

All backend ↔ Raspberry Pi communication now uses **HMAC-SHA256 signed requests**. The Pi (FastAPI behind nginx on port 9000, exposed via Tailscale Funnel) rejects any request missing valid signature headers. This replaces the previous unsigned `fetch()` calls that used the `FASTAPI_BASE` constant to reach the Pi directly on port 8000.

**Last updated**: June 2026

---

## Signing Scheme

Every request to the Pi carries four `X-Control-*` headers:

| Header | Value |
|---|---|
| `X-Control-Timestamp` | Epoch seconds (integer string) |
| `X-Control-Nonce` | 16-byte random hex (32 chars) |
| `X-Control-Body-SHA256` | Hex SHA-256 of the request body (`e3b0c44...` for empty body) |
| `X-Control-Signature` | Hex HMAC-SHA256 of the canonical string |

### Canonical String

The canonical string is **newline-separated** (`\n`), NOT pipe-separated:

```
METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nBODY_SHA256
```

Example for `GET /detect/poll?max_items=50`:

```
GET
/detect/poll?max_items=50
1719531234
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

- **Path includes query string** — the path used in signing is the full path with `?query=params`.
- **Body hash** — SHA-256 of the raw body bytes. For `GET` requests (empty body), this is the SHA-256 of an empty buffer.
- **HMAC key** — `CONTROL_SIGNING_SECRET` env var, UTF-8 encoded.

---

## Environment Variables

Two new env vars are required in `backend/.env` (and on Railway):

| Variable | Example | Description |
|---|---|---|
| `PI_BASE_URL` | `https://mothership-1.tail781e52.ts.net` | Pi's Tailscale Funnel HTTPS URL (nginx :9000) |
| `CONTROL_SIGNING_SECRET` | *(shared with Pi)* | HMAC-SHA256 signing key — must match the Pi's `CONTROL_SIGNING_SECRET` |

> **Note:** The old `FASTAPI_BASE` constant (pointing to `:8000`) is **no longer used** for Pi communication. The hardcoded line in `server.js` remains but is unused by any active handler.

---

## New Files Created

### 1. `backend/utils/signing.js`

**Purpose:** Low-level HMAC-SHA256 signing utility.

**Exports:** `buildSignedHeaders({ method, pathWithQuery, bodyBytes, secret })`

**What it does:**
- Generates timestamp (epoch seconds) and nonce (16-byte random hex via `crypto.randomBytes(16)`)
- Computes SHA-256 hash of body bytes
- Builds the canonical string: `METHOD\nPATH_WITH_QUERY\nTS\nNONCE\nBODY_HASH` (newline-separated)
- Computes HMAC-SHA256 of the canonical string using the signing secret
- Returns an object with the four `X-Control-*` headers

**Dependencies:** Node built-in `crypto` only (no external packages).

---

### 2. `backend/services/piGatewayService.js`

**Purpose:** Thin HTTP client that sends signed requests to the Pi.

**Exports:** `piFetch(path, { method, jsonBody, queryString })`

**What it does:**
- Reads `PI_BASE_URL` and `CONTROL_SIGNING_SECRET` from `process.env`
- Builds the full URL: `PI_BASE_URL + path + ?queryString`
- Serializes `jsonBody` to bytes (if provided) and sets `Content-Type: application/json`
- Calls `buildSignedHeaders()` with the method, path+query, body bytes, and secret
- Sends the request via `fetch()` with all signed headers attached
- Parses the response as JSON
- Throws an error with `.status` and `.data` if the Pi returns a non-2xx response

**Dependencies:** `utils/signing.js`

---

### 3. `backend/controllers/piProxyController.js`

**Purpose:** Express handlers that proxy signed requests to the Pi.

**Exports:** `{ deviceStatus, networks, scan, detectPoll, orchestrateApply, portalPatch }`

**Handlers:**

| Handler | Pi Endpoint | Method | Notes |
|---|---|---|---|
| `deviceStatus` | `/device/status` | GET | Returns Pi device status JSON |
| `networks` | `/networks` | GET | Returns available Wi-Fi networks |
| `scan` | `/scan` | POST | Forwards `req.body` as JSON payload |
| `detectPoll` | `/detect/poll` | GET | Forwards `max_items` query param (included in signature) |
| `orchestrateApply` | `/orchestrate/apply` | POST | Forwards `req.body` as JSON payload |
| `portalPatch` | `/portal/patch` | POST | Forwards `req.body` as JSON payload |

Each handler wraps `piFetch()` in try/catch and returns a `502` with `{ status, error, detail }` on failure.

**Dependencies:** `services/piGatewayService.js`

---

### 4. `backend/routes/piProxyRoutes.js`

**Purpose:** Express router mounted at `/api/pi` in `server.js`.

**Route table:**

| Express Route | Method | Handler |
|---|---|---|
| `/api/pi/device/status` | GET | `piProxy.deviceStatus` |
| `/api/pi/networks` | GET | `piProxy.networks` |
| `/api/pi/scan` | POST | `piProxy.scan` |
| `/api/pi/detect/poll` | GET | `piProxy.detectPoll` |
| `/api/pi/orchestrate/apply` | POST | `piProxy.orchestrateApply` |
| `/api/pi/portal/patch` | POST | `piProxy.portalPatch` |

---

### 5. `backend/test-pi-signing.js`

**Purpose:** One-off Node script to verify connectivity to the Pi with signed requests.

**Usage:**
```bash
cd backend
node test-pi-signing.js
```

Tests `GET /device/status` against the Pi using the signing scheme and prints the response.

---

## Modified Files — Migration from Direct `fetch()` to `piFetch()`

All files that previously used direct `fetch(FASTAPI_BASE + "/endpoint")` to reach the Pi were updated to use `piFetch()`, which attaches HMAC-SHA256 signature headers automatically.

### 1. `backend/server.js`

**Changes:**
- **Added** `require('./routes/piProxyRoutes')` import and mounted at `/api/pi`
- **Modified** the inline `GET /api/device/status` handler:
  - **Before:** `fetch(FASTAPI_BASE + "/device/status")` (unsigned, port 8000)
  - **After:** `const { piFetch } = require("./services/piGatewayService"); const data = await piFetch("/device/status", { method: "GET" });`
- The old `FASTAPI_BASE` constant on line 7 remains in the file but is no longer used by any active handler.

---

### 2. `backend/controllers/rasPiController.js`

**Changes:**
- **Removed:** `const FASTAPI_BASE = ...` constant
- **Added:** `const { piFetch } = require("../services/piGatewayService")`
- **`triggerScan()`:**
  - **Before:** `fetch(FASTAPI_BASE + "/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })`
  - **After:** `await piFetch("/scan", { method: "POST", jsonBody: payload })`
- **`getNetworksList()`:**
  - **Before:** `fetch(FASTAPI_BASE + "/networks")` → check `r.ok` → `r.json()`
  - **After:** `await piFetch("/networks", { method: "GET" })` with try/catch returning `err.status || 502`

---

### 3. `backend/controllers/detectController.js`

**Changes:**
- **Removed:** `const FASTAPI_BASE = ...` constant
- **Added:** `const { piFetch } = require("../services/piGatewayService")`
- **`poll()` handler:**
  - **Before:** `fetch(FASTAPI_BASE + "/detect/poll?max_items=...")` with `r.ok` check
  - **After:** `await piFetch("/detect/poll", { method: "GET", queryString: "max_items=..." })` with try/catch
  - Query string is now included in the signature (required by the Pi verifier)

---

### 4. `backend/services/detectStateService.js`

**Changes:**
- **Removed:** `const FASTAPI_BASE = ...` constant and `AbortController` timeout logic
- **Added:** `const { piFetch } = require("./piGatewayService")`
- **`serverPing()` (server-side heartbeat):**
  - **Before:** `fetch(FASTAPI_BASE + "/detect/poll?max_items=1", { signal: controller.signal })` with manual `AbortController` timeout
  - **After:** `await piFetch("/detect/poll", { method: "GET", queryString: "max_items=1" })` — piFetch handles its own request lifecycle

---

### 5. `backend/controllers/captivePortalController.js`

**Changes:**
- **Removed:** `const FASTAPI_BASE = ...` and `const PORTAL_TOKEN = ...` constants
- **Added:** `const { piFetch } = require('../services/piGatewayService')`
- **`syncPortal()` function:**
  - **Before:** `fetch(FASTAPI_BASE + "/portal/patch", { method: "POST", headers: { "Content-Type": "application/json", "X-Portal-Token": PORTAL_TOKEN }, body: JSON.stringify(payload) })`
  - **After:** `await piFetch('/portal/patch', { method: 'POST', jsonBody: payload })` — signing headers replace the old `X-Portal-Token` header

---

### 6. `backend/utils/riskPipeline.js`

**Changes:**
- **Removed:** `const FASTAPI_BASE = ...` and `const PORTAL_TOKEN = ...` constants
- **Added:** `const { piFetch } = require('../services/piGatewayService')`
- **`autoPortalRiskPatch()` function:**
  - **Before:** `fetch(FASTAPI_BASE + "/portal/patch", { method: "POST", headers: { "Content-Type": "application/json", "X-Portal-Token": PORTAL_TOKEN }, body: JSON.stringify(payload) })` with `res.status` check
  - **After:** `await piFetch('/portal/patch', { method: 'POST', jsonBody: payload })` with try/catch
  - Also removed `res.status` reference from the audit log metadata (it was referencing the fetch response, which is now handled inside piFetch)

---

## Data Flow (After Migration)

```
Frontend  →  Express Backend  →  piFetch()  →  Pi (nginx :9000 via Tailscale Funnel)
                                     │
                                     ├─ buildSignedHeaders()
                                     │    ├─ timestamp (epoch seconds)
                                     │    ├─ nonce (16-byte hex)
                                     │    ├─ body SHA-256
                                     │    └─ HMAC-SHA256 signature
                                     │
                                     └─ fetch(PI_BASE_URL + path, { headers: X-Control-* })
                                          │
                                          ▼
                                     Pi verifies signature → 200 OK or 401/403
```

### Before vs After

| Before | After |
|---|---|
| `FASTAPI_BASE` constant (`:8000` direct) | `PI_BASE_URL` env var (Tailscale Funnel HTTPS) |
| Unsigned `fetch()` calls | Signed via `piFetch()` with `X-Control-*` headers |
| `X-Portal-Token` header for portal endpoints | HMAC signing replaces token authentication |
| Each file managed its own Pi URL and fetch logic | Centralized in `piGatewayService.js` |

---

## Testing

### Quick connectivity test

```bash
cd backend
node test-pi-signing.js
```

Expected output: `200 OK` with Pi device status JSON.

### Backend server test

```bash
cd backend
node server.js
```

Then in another terminal:

```bash
# Device status
curl http://localhost:3000/api/device/status

# Available networks
curl http://localhost:3000/api/rasPi/networks_list

# Pi proxy routes (alternative)
curl http://localhost:3000/api/pi/device/status
curl http://localhost:3000/api/pi/networks
```

### Common errors

| Error | Cause | Fix |
|---|---|---|
| `PI_BASE_URL env var is not set` | Missing env var | Add `PI_BASE_URL` to `backend/.env` |
| `CONTROL_SIGNING_SECRET missing` | Missing env var | Add `CONTROL_SIGNING_SECRET` to `backend/.env` |
| `401 missing_signature_headers` | Wrong header names or nginx stripping headers | Verify Pi nginx config forwards `X-Control-*` headers |
| `401 invalid_signature` | Secret mismatch or wrong canonical string format | Verify `CONTROL_SIGNING_SECRET` matches Pi's value |
| `403 replay_detected` | Re-used nonce (normal if re-sending the exact same request) | Each request generates a fresh nonce automatically |
| `502 pi_call_failed` | Pi unreachable | Check Pi is online, Tailscale is connected |

---

## Summary of All Affected Files

| File | Status | What Changed |
|---|---|---|
| `backend/utils/signing.js` | **NEW** | HMAC-SHA256 signing utility |
| `backend/services/piGatewayService.js` | **NEW** | Centralized signed HTTP client (`piFetch`) |
| `backend/controllers/piProxyController.js` | **NEW** | 6 Express proxy handlers for Pi endpoints |
| `backend/routes/piProxyRoutes.js` | **NEW** | Router mounted at `/api/pi` |
| `backend/test-pi-signing.js` | **NEW** | One-off connectivity test script |
| `backend/server.js` | **MODIFIED** | Mounted `/api/pi` routes; device/status uses `piFetch` |
| `backend/controllers/rasPiController.js` | **MODIFIED** | `triggerScan` + `getNetworksList` use `piFetch` |
| `backend/controllers/detectController.js` | **MODIFIED** | `poll` uses `piFetch` with signed query string |
| `backend/services/detectStateService.js` | **MODIFIED** | `serverPing` uses `piFetch`; removed AbortController |
| `backend/controllers/captivePortalController.js` | **MODIFIED** | `syncPortal` uses `piFetch`; removed `PORTAL_TOKEN` |
| `backend/utils/riskPipeline.js` | **MODIFIED** | `autoPortalRiskPatch` uses `piFetch`; removed `PORTAL_TOKEN` |
| `backend/.env` | **MODIFIED** | Added `PI_BASE_URL` and `CONTROL_SIGNING_SECRET` |
