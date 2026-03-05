# Pi Signing & Deployment README

> **Generated from:** Security-branch signing implementation (March 5, 2026)
> **Scope:** Express (Railway) → Pi (FastAPI) HMAC request signing
> **Architecture:** Railway → HTTPS → Tailscale Serve/Funnel → HTTP → nginx :9000 → FastAPI

---

## Table of Contents

1. [Overview](#overview)
2. [Signing Scheme](#signing-scheme)
3. [Files Changed](#files-changed)
4. [Environment Variables](#environment-variables)
5. [Production Fail-Fast Behavior](#production-fail-fast-behavior)
6. [Dev Mode (Signing Optional)](#dev-mode-signing-optional)
7. [Pi-Side Configuration](#pi-side-configuration)
8. [Smoke Test Endpoint](#smoke-test-endpoint)
9. [Deploy Checklist](#deploy-checklist)
10. [Smoke Test Order](#smoke-test-order)
11. [Unit Tests](#unit-tests)
12. [Troubleshooting](#troubleshooting)

---

## Overview

Every Express → Pi HTTP call is signed with HMAC-SHA256 so the Pi can verify that requests originate from the authorized Railway deployment. Signing is handled by a single centralized utility (`piFetch`) — individual controllers never construct Pi requests directly.

**Network path:**

```
Railway (Express)
  │
  ▼  HTTPS
Tailscale Serve/Funnel URL (https://<device>.ts.net)
  │
  ▼  TLS terminated by Funnel
nginx gateway (:9000)
  │
  ▼  HTTP proxy_pass
FastAPI (localhost)
```

---

## Signing Scheme

The scheme matches the Pi's `verify_signed_request()` dependency exactly.

### Headers (all four required)

| Header | Value |
|---|---|
| `X-Control-Timestamp` | Epoch seconds (string) |
| `X-Control-Nonce` | Random UUID (`crypto.randomUUID()`) |
| `X-Control-Body-SHA256` | Lowercase hex SHA-256 of the exact request body bytes |
| `X-Control-Signature` | Lowercase hex HMAC-SHA-256 of the canonical string |

### Canonical string (newline-delimited)

```
METHOD\n
PATH_WITH_QUERY\n
TIMESTAMP\n
NONCE\n
BODY_SHA256
```

**Rules:**

- `METHOD` — uppercase (`GET`, `POST`, etc.)
- `PATH_WITH_QUERY` — must include query string when present (e.g. `/detect/poll?max_items=50`). Must NOT include scheme or host.
- Body hash — computed from the exact outbound bytes:
  - GET / no body → `sha256(Buffer.alloc(0))` → `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  - JSON body → `const s = JSON.stringify(obj); sha256(Buffer.from(s, "utf8"))`
- Signature and body hash are always lowercase hex.

### Signed endpoints

All six Pi-facing endpoints are signed via `piFetch()`:

| Endpoint | Method | Query signed? |
|---|---|---|
| `/device/status` | GET | N/A |
| `/networks` | GET | N/A |
| `/scan` | POST | N/A |
| `/detect/poll` | GET | Yes (`max_items=N`) |
| `/orchestrate/apply` | POST | N/A |
| `/portal/patch` | POST | N/A |

---

## Files Changed

| File | Purpose |
|---|---|
| `backend/utils/signing.js` | `buildSignedHeaders()` — builds the 4 `X-Control-*` headers from method, path+query, body bytes, and secret |
| `backend/utils/piFetch.js` | `piFetch()` — centralized Pi fetch with signing, timeout, non-OK logging. Returns `{ ok, status, data, rawText }` |
| `backend/config/envValidation.js` | Fail-fast: `PI_BASE_URL` and `CONTROL_SIGNING_SECRET` required in production |
| `backend/server.js` | Added `GET /internal/pi-smoke` deploy verification route |
| `backend/controllers/detectController.js` | Updated comment (query IS now signed) |
| `backend/services/detectStateService.js` | Updated comment (query IS now signed) |
| `backend/__tests__/setup.js` | Added `PI_BASE_URL` test env var |
| `backend/__tests__/unit/signing.test.js` | 8 unit tests for canonical string formation and HMAC verification |
| `backend/.env` | Added `PI_BASE_URL` and `PI_SIGNING_OPTIONAL=true` for dev |

---

## Environment Variables

### Railway (production) — required

| Variable | Example | Notes |
|---|---|---|
| `PI_BASE_URL` | `https://<device>.ts.net` | Funnel/Serve public URL. **No trailing slash.** |
| `CONTROL_SIGNING_SECRET` | `(random 32+ char string)` | Must match the Pi's `CONTROL_SIGNING_SECRET` exactly. |
| `INTERNAL_SMOKE_TOKEN` | `(random string)` | Protects `/internal/pi-smoke`. Required in prod. |

### Railway — do NOT set

| Variable | Why |
|---|---|
| `PI_SIGNING_OPTIONAL` | Must not be set in production — signing is always enforced. |
| `FASTAPI_BASE_URL` | Legacy. Use `PI_BASE_URL` instead. |

### Local development (.env)

```dotenv
PI_BASE_URL=http://127.0.0.1:8000
FASTAPI_BASE_URL=http://127.0.0.1:8000        # legacy fallback
CONTROL_SIGNING_SECRET=                         # empty = signing skipped in dev
PI_SIGNING_OPTIONAL=true                        # allows empty secret in dev
```

---

## Production Fail-Fast Behavior

In production (`APP_ENV=production`), the server **refuses to start** if either `PI_BASE_URL` or `CONTROL_SIGNING_SECRET` is missing. This is enforced by `envValidation.js` at startup.

At runtime, `piFetch()` also throws immediately if the secret is empty and signing is required (i.e. `PI_SIGNING_OPTIONAL` is not `"true"` or `NODE_ENV` is `"production"`).

---

## Dev Mode (Signing Optional)

For local development without a Pi:

1. Leave `CONTROL_SIGNING_SECRET` empty in `.env`.
2. Set `PI_SIGNING_OPTIONAL=true` in `.env`.

`piFetch()` will still make requests (to `PI_BASE_URL` or `http://127.0.0.1:8000`) but without signing headers. This lets you develop against a local FastAPI that has `CONTROL_REQUIRE_SIGNED=0`.

**This override is blocked in production** — if `NODE_ENV=production`, signing is always enforced regardless of `PI_SIGNING_OPTIONAL`.

---

## Pi-Side Configuration

On the Raspberry Pi, signing enforcement is controlled by:

```
CONTROL_REQUIRE_SIGNED=1          # "1", "true", or "yes" to enforce
CONTROL_SIGNING_SECRET=<same as Railway>
```

| Pi Setting | Effect |
|---|---|
| `CONTROL_REQUIRE_SIGNED=0` (or unset) | Pi accepts unsigned requests (staged rollout) |
| `CONTROL_REQUIRE_SIGNED=1` | Pi rejects any request without valid `X-Control-*` headers |

**For the security deployment, use `CONTROL_REQUIRE_SIGNED=1`.**

Optional Pi tuning (defaults are usually fine):

| Variable | Default | Purpose |
|---|---|---|
| `CONTROL_MAX_SKEW_SEC` | 300 | Max clock skew tolerance (seconds) |
| `CONTROL_NONCE_TTL_SEC` | 600 | How long nonces are remembered (replay protection) |

---

## Smoke Test Endpoint

### `GET /internal/pi-smoke`

Calls `/device/status` through `piFetch` to verify end-to-end signing + connectivity.

**Auth:** Requires `Authorization: Bearer <INTERNAL_SMOKE_TOKEN>` when `INTERNAL_SMOKE_TOKEN` is set (always set it in production). Open in dev when no token is configured.

**Success response (200):**

```json
{
  "pi_reachable": true,
  "pi_status": 200,
  "pi_data": { "status": "online", "..." }
}
```

**Failure response (502):**

```json
{
  "pi_reachable": false,
  "error": "Pi request timed out after 8000ms"
}
```

**Usage:**

```bash
# Production (Railway)
curl -H "Authorization: Bearer <token>" https://<railway-app>/internal/pi-smoke

# Local dev
curl http://localhost:3001/internal/pi-smoke
```

---

## Deploy Checklist

### Before deploying to Railway

- [ ] `PI_BASE_URL` set in Railway env vars (Funnel URL, not localhost)
- [ ] `CONTROL_SIGNING_SECRET` set in Railway env vars (matches Pi)
- [ ] `INTERNAL_SMOKE_TOKEN` set in Railway env vars
- [ ] `PI_SIGNING_OPTIONAL` is **NOT** set in Railway env vars
- [ ] Pi has `CONTROL_REQUIRE_SIGNED=1` and matching `CONTROL_SIGNING_SECRET`
- [ ] Tailscale Serve/Funnel enabled by tailnet admin
- [ ] Serve maps public HTTPS to nginx on `:9000`
- [ ] nginx proxies to FastAPI on localhost

### After deploying

- [ ] `GET /health` returns `{ "status": "ok" }`
- [ ] `GET /internal/pi-smoke` returns `{ "pi_reachable": true }`
- [ ] `GET /api/detect/poll?max_items=1` succeeds (validates query signing)
- [ ] `POST /api/rasPi/scan` succeeds (validates body signing)

---

## Smoke Test Order

Test in this order — each step validates a progressively deeper part of the stack:

| # | Call | Validates |
|---|---|---|
| 1 | `GET /internal/pi-smoke` | Signing + Funnel + nginx + FastAPI reachability |
| 2 | `GET /api/device/status` (with JWT) | Auth + signing together |
| 3 | `GET /api/detect/poll?max_items=1` (with JWT) | **Query string included in signature** |
| 4 | `POST /api/rasPi/scan` (with JWT + body) | POST body signing |

**If #3 fails but #1 works**, the issue is almost always "query not included in signature" — but with the current implementation this is handled correctly.

---

## Unit Tests

Run the signing tests:

```bash
cd backend
npx jest __tests__/unit/signing.test.js --no-coverage
```

**8 tests covering:**

| Test | What it verifies |
|---|---|
| Returns all four X-Control-* headers | Header presence |
| Correct body SHA256 for empty body (GET) | `sha256("")` matches known hash |
| Correct body SHA256 for JSON body (POST) | Hash matches `sha256(JSON.stringify(obj))` |
| Query string in signature | `/detect/poll?max_items=50` vs `/detect/poll` produce different sigs |
| Lowercase hex output | Both body hash and signature are `[0-9a-f]{64}` |
| Method uppercased | `"get"` and `"GET"` both produce valid signatures |
| Throws if secret missing | Empty secret → `Error("CONTROL_SIGNING_SECRET missing")` |
| Produces verifiable HMAC | Reconstructs canonical string from headers and re-verifies |

---

## Troubleshooting

### "Pi request timed out after 10000ms"
- Funnel/Serve not running or not configured
- nginx not listening on `:9000`
- `PI_BASE_URL` is pointing at `localhost` instead of the Funnel URL

### "CONTROL_SIGNING_SECRET is not set"
- Set the secret in your `.env` or Railway env vars
- In dev, set `PI_SIGNING_OPTIONAL=true` to skip signing

### Pi returns 401/403
- Secrets don't match between Railway and Pi
- Clock skew > `CONTROL_MAX_SKEW_SEC` (default 300s)
- Nonce replay (shouldn't happen with `crypto.randomUUID()`)

### `GET /detect/poll` fails but `GET /device/status` works
- Historically caused by signing the path without the query string
- Current implementation signs `pathWithQuery` correctly — if this still happens, check that the `query` option is being passed to `piFetch()`

### Server won't start in production
- Missing `PI_BASE_URL` or `CONTROL_SIGNING_SECRET` → `envValidation.js` blocks startup
- Check Railway logs for `STARTUP BLOCKED — Environment validation failed`
