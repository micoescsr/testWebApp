# AP Enable/Disable + Scan Freshness Gating + Captive Portal Auto-Update

Complete implementation reference for the access-point lifecycle, scan validation gating, risk-driven captive portal patching, and deterministic frontend banners.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Chunk 1 — Schema DDL](#chunk-1--schema-ddl)
4. [Chunk 2 — Scan Validation](#chunk-2--scan-validation)
5. [Chunk 3 — Concurrency Lock + Audit + Logging](#chunk-3--concurrency-lock--audit--logging)
6. [Chunk 4 — Admin State Endpoint](#chunk-4--admin-state-endpoint)
7. [Chunk 5 — Portal Partial Update](#chunk-5--portal-partial-update)
8. [Chunk 6 — Risk Pipeline + Auto-Portal](#chunk-6--risk-pipeline--auto-portal)
9. [Chunk 7 — Frontend UI Banners](#chunk-7--frontend-ui-banners)
10. [Correctness Fixes Applied](#correctness-fixes-applied)
11. [Environment Variables](#environment-variables)
12. [API Reference](#api-reference)
13. [Error Codes](#error-codes)
14. [SQL Diagnostic Queries](#sql-diagnostic-queries)
15. [End-to-End Test Plan](#end-to-end-test-plan)
16. [Files Modified](#files-modified)
17. [Future Improvements](#future-improvements)

---

## Overview

This feature implements a full AP (Access Point) lifecycle with:

- **Scan freshness gating** — AP can only be enabled when a recent, valid, completed scan exists
- **Atomic concurrency lock** — prevents duplicate enable/disable operations via `ap_apply_in_progress`
- **Captive portal auto-initialization** — first enable seeds default content and patches FastAPI
- **Risk-driven portal updates** — when risk bucket changes (via scan or threat events), portal is auto-patched
- **Version-safe stamping** — portal patches are stamped only when the version matches what was actually sent
- **Deterministic UI banners** — frontend renders exactly one banner based on strict priority from admin state
- **12-second polling** — keeps UI in sync with backend state while AP is enabled

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│  React UI   │────▶│  Express API │────▶│   Supabase   │     │  FastAPI   │
│ (useDevice) │◀────│  (routes/)   │◀────│  (PostgreSQL)│     │ (Rasp Pi)  │
└─────────────┘     └──────┬───────┘     └──────────────┘     └─────▲──────┘
                           │                                        │
                           └────────────────────────────────────────┘
                              /portal/patch  &  /orchestrate/apply
```

**Data flow:**
1. Frontend calls Express endpoints (never FastAPI directly)
2. Express handles all validation, DB reads/writes, audit logging
3. Express forwards to FastAPI only for hardware operations (AP apply, portal patch)
4. Frontend polls `/network/:id/state` every 12s when AP is enabled to stay in sync

---

## Chunk 1 — Schema DDL

**Purpose:** Add all required columns to the `networks` table.

### Columns Added to `networks`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ap_enabled` | boolean | `false` | Whether AP is currently on |
| `ap_apply_in_progress` | boolean | `false` | Concurrency lock during enable/disable |
| `portal_initialized` | boolean | `false` | Whether default portal content has been seeded |
| `portal_last_patched_at` | timestamptz | `null` | When portal was last patched on FastAPI |
| `portal_last_patched_version` | integer | `0` | The `risk_score_version` that was last sent to FastAPI |
| `risk_score` | integer | `0` | Numeric risk score (0–100) |
| `risk_bucket` | text | `'LOW'` | Bucket label: LOW / MEDIUM / HIGH / CRITICAL |
| `risk_score_version` | integer | `0` | Monotonically increasing; bumped on every risk change |
| `last_scan_id` | uuid | `null` | The scan_id that last updated risk |
| `last_scan_finished_at` | timestamptz | `null` | When that scan finished |
| `last_threat_at` | timestamptz | `null` | When risk was last updated by a threat event |

### Scan Table Used

The `vulnerability_scans` table (already existing) is used for scan validation:

| Column | Type | Usage |
|--------|------|-------|
| `scan_id` | uuid (PK) | Referenced by enable-ap |
| `network_id` | uuid (FK) | Must match the network being enabled |
| `status` | text | Must be `'COMPLETED'` |
| `finished_at` | timestamptz | Must be within `SCAN_MAX_AGE_SECONDS` |
| `error_code` | text | Must be `null` |
| `scan_data` | jsonb | Must be present |

---

## Chunk 2 — Scan Validation

**File:** `backend/utils/scanValidation.js`

### `validateScan(scan, networkId, maxAgeSeconds, nowMs?)`

Pure function — validates a `vulnerability_scans` row against 6 ordered checks:

1. Scan row must exist → `SCAN_NOT_FOUND`
2. `scan.network_id == networkId` → `SCAN_NETWORK_MISMATCH`
3. Status in `{FAILED, CANCELLED, TIMEOUT}` → `SCAN_FAILED`
4. Status != `COMPLETED` or !`finished_at` → `SCAN_NOT_FINISHED`
5. `error_code` is not null → `SCAN_HAS_ERRORS`
6. `scan_data` is falsy → `SCAN_INVALID_DATA`
7. `finished_at` older than `maxAgeSeconds` → `SCAN_TOO_OLD`

### `validateNetworkConfig(networkConfig)`

Validates that SSID, BSSID, and channel are all present.

Returns `{ valid: true }` or `{ valid: false, error: 'NETWORK_CONFIG_MISSING', message: '...' }`.

### `validateApPassword(password, encryptionType)`

- Open networks → password ignored
- Encrypted → password required, minimum 8 characters

Returns `{ valid: true }` or `{ valid: false, error: 'AP_PASSWORD_REQUIRED'|'AP_PASSWORD_WEAK', message: '...' }`.

### `buildPortalPatchPayload(networkConfig, riskBucket)`

Builds the JSON payload for FastAPI `/portal/patch` from DB data.

---

## Chunk 3 — Concurrency Lock + Audit + Logging

**File:** `backend/routes/deviceMgmtRoutes.js` — `POST /enable-ap`

### Flow (Enable)

```
1. Validate scan_id present                    → SCAN_REQUIRED
2. Load vulnerability_scans row from DB
3. validateScan()                              → SCAN_* errors
4. Load network config from networks table
5. validateNetworkConfig()                     → NETWORK_CONFIG_MISSING
6. validateApPassword()                        → AP_PASSWORD_*
7. Atomically set ap_apply_in_progress = true  → REQUEST_IN_PROGRESS (if already locked)
8. Audit: AP_ENABLE_REQUEST
9. If !portal_initialized:
   a. seedDefaultContent()
   b. buildPortalPayloadFromDB()
   c. POST FastAPI /portal/patch               → PORTAL_PATCH_FAILED
   d. Set portal_initialized=true, portal_last_patched_at, portal_last_patched_version
   e. Audit: AP_ENABLE_REQUEST (portal init)
10. POST FastAPI /orchestrate/apply             → FASTAPI_APPLY_FAILED
11. Update DB: ap_enabled=true, last_scan_id, last_scan_finished_at
12. Audit: AP_STATUS_CHANGE (SUCCESS)
13. finally: releaseApLock()
```

### Flow (Disable)

```
1. Load + validateNetworkConfig()
2. Set ap_apply_in_progress = true
3. POST FastAPI /orchestrate/apply (disable payload)
4. Update DB: ap_enabled=false
5. finally: releaseApLock()
```

### Key Design Decisions

- **`httpError(status, code, message, extra)`** — Typed error helper. Throw anywhere; catch block reads `.status`, `.code`, `.extra` to build response.
- **`releaseApLock()`** — Always runs in `finally` block. Logs but never throws.
- **`logFastApiCall()`** — Logs method, URL, payload, response status + body for debugging.
- **`logAuditEvent()`** — Fire-and-forget. Maps `SUCCESS→OK`, `FAILED→FAIL`, `DENIED→DENY` for the DB enum.
- **`risk_score_version` re-read** — After portal init patch, re-reads version from DB before stamping to avoid race conditions.

---

## Chunk 4 — Admin State Endpoint

**File:** `backend/routes/deviceMgmtRoutes.js` — `GET /network/:networkId/state`

**Purpose:** Single source of truth for the frontend. Returns all state needed to render banners.

### Response Shape

```json
{
  "network_id": "uuid",
  "ap_enabled": true,
  "ap_apply_in_progress": false,
  "portal_initialized": true,
  "scan_state": {
    "has_scan": true,
    "scan_fresh": true,
    "last_scan_id": "uuid",
    "last_scan_finished_at": "2026-02-28T...",
    "scan_age_seconds": 120,
    "max_age_seconds": 300
  },
  "portal_state": {
    "portal_out_of_date": false,
    "portal_last_patched_at": "2026-02-28T...",
    "portal_last_patched_version": 3
  },
  "risk_state": {
    "risk_bucket": "MEDIUM",
    "risk_score": 42,
    "risk_score_version": 3
  },
  "flags": {
    "network_config_missing": false
  }
}
```

### Key Logic

- `scan_fresh` = `has_scan && scan_age_seconds <= max_age_seconds`
- `portal_out_of_date` = `ap_enabled && portal_initialized && portal_last_patched_version < risk_score_version`
- `network_config_missing` = any of SSID/BSSID/channel is falsy

**Frontend API:** `getNetworkState(networkId)` in `deviceApi.js`

---

## Chunk 5 — Portal Partial Update

**File:** `backend/routes/deviceMgmtRoutes.js` — `POST /portal/update`

**Purpose:** Client-driven partial portal update with strict allowlist validation. Used by the "Update Portal" button when `portal_out_of_date=true`.

### Request Body

```json
{
  "network_id": "uuid",
  "update_type": "risk",
  "payload": {
    "risk": { "bucket": "HIGH" }
  },
  "reason": "manual_update"
}
```

### Validation (`validatePatchPayload()`)

1. **Allowlist:** Only keys in `ALLOWED_PAYLOAD_KEYS` are accepted (announcement, terms, tips, risk, is_active)
2. **Type consistency:** Keys must belong to the declared `update_type` (e.g., `risk` update can't include `announcement`)
3. **Risk shape:** `{ risk: { bucket } }` where bucket ∈ `{LOW, MEDIUM, HIGH, CRITICAL}`
4. **Risk debounce:** If current `risk_bucket` matches payload bucket → skip patch (no-op)

### Post-Patch

- Forwards to FastAPI `/portal/patch`
- Stamps `portal_last_patched_version = risk_score_version`, `portal_last_patched_at = now()`
- Audits `PORTAL_UPDATE` with `update_type` + `reason`

### Error Codes

| Code | Meaning |
|------|---------|
| `EMPTY_PATCH` | No payload keys provided |
| `UNSAFE_PATCH_FIELD` | Key not in allowlist |
| `UPDATE_TYPE_MISMATCH` | Key doesn't belong to declared update_type |
| `INVALID_PATCH_SHAPE` | Risk payload has invalid bucket value |
| `AP_NOT_ENABLED` | Can't patch portal when AP is off |
| `FASTAPI_PORTAL_PATCH_FAILED` | FastAPI call failed |

**Frontend API:** `updatePortal(networkId, updateType, payload, reason)` in `deviceApi.js`

---

## Chunk 6 — Risk Pipeline + Auto-Portal

**File:** `backend/utils/riskPipeline.js`

### Core Functions

#### `bucketize(score)` — Score → Bucket

| Range | Bucket |
|-------|--------|
| 0–24 | LOW |
| 25–49 | MEDIUM |
| 50–74 | HIGH |
| 75–100 | CRITICAL |

#### `deriveBucketFromScanData(scanData)`

Walks scan findings for severity labels (Critical/High/Medium/Low) or CVSS scores. Handles array, object-with-findings-array, and keyed formats. Fallback: any findings → MEDIUM, no findings → LOW.

#### `deriveBucketFromThreats(threatRows)`

Only counts `DETECTED` threats (ignores `CLEARED`). Maps severity labels to buckets. Takes the max.

#### `updateNetworkRisk(networkId, opts)`

Core orchestrator:

1. Reads current `risk_bucket`, `risk_score_version` from DB
2. Compares old bucket vs new bucket
3. If changed: increments `risk_score_version`, updates `risk_bucket` + `risk_score`
4. Audits `RISK_UPDATE` (changed or unchanged)
5. If AP enabled + bucket changed → triggers `autoPortalRiskPatch()`

#### `autoPortalRiskPatch(networkId, bucket, lastPatchedAt, req)`

**Version-safe stamping:**

1. Respects cooldown (`PORTAL_PATCH_COOLDOWN_MS`, default 15s). NULL `lastPatchedAt` allows first-ever patch immediately.
2. Snapshots `risk_score_version` + `risk_bucket` BEFORE sending FastAPI patch
3. Sends `POST /portal/patch` to FastAPI
4. Post-check: re-reads `risk_bucket` from DB. If bucket drifted during patch → skip stamp (let next cycle re-patch)
5. Only stamps `portal_last_patched_version = snapshotVersion` if bucket still matches

This prevents "portal says LOW but stamped as version 7 (which is HIGH)."

#### `onScanCompleted(scanId, req)`

Webhook handler for scan completion:

1. Loads scan row from `vulnerability_scans`
2. Derives bucket from `scan_data`
3. Factors in recent threats (5-minute decay window)
4. Calls `updateNetworkRisk()` with scan metadata

#### `onThreatEvent(networkId, threatRows, req)`

Called from `server.js` after threat rows are persisted:

- Active threats (DETECTED) → elevate bucket
- All cleared → re-derive from last scan data
- Calls `updateNetworkRisk()` with threat metadata

### Webhook: `POST /scan-completed`

**File:** `backend/routes/deviceMgmtRoutes.js`

Hardened webhook endpoint:

1. **Token auth:** `X-Scan-Runner-Token` header must match `SCAN_RUNNER_TOKEN` env var → 401 if missing/wrong
2. **UUID validation:** `scan_id` checked against regex before any DB query → 400 if invalid
3. **Idempotency:** Checks if `networks.last_scan_id === scan_id` → returns `{ ok: true, skipped: true, reason: 'already_processed' }` (not an error)
4. Calls `onScanCompleted(scan_id, req)`

### Threat Hook Wiring

**File:** `backend/server.js` — inside `persistThreatRows()`

After threat rows are inserted and `scans.risk_score` is updated:
- Resolves `network_id` from BSSID (normalized to uppercase)
- Calls `onThreatEvent(networkId, threatRows)` (non-fatal; wrapped in try/catch)

---

## Chunk 7 — Frontend UI Banners

### `useDevice.js` Hook

**File:** `src/hooks/useDevice.js`

#### State

| State | Source | Description |
|-------|--------|-------------|
| `adminState` | `/network/:id/state` | Full admin state object (source of truth) |
| `apEnabled` | `adminState.ap_enabled` | Whether AP is on |
| `portalInitialized` | `adminState.portal_initialized` | Whether portal was seeded |
| `loading` | local | Mutation in progress |
| `error` | local | User-facing error message |
| `scanError` | local | Scan validation error code from backend |

#### Methods

| Method | When Called | What It Does |
|--------|------------|--------------|
| `fetchAdminState()` | Mount, after mutations, every 12s | Calls `getNetworkState()`, updates all derived state |
| `handleToggleAccessPoint(password)` | User clicks toggle | Calls `toggleAP()`, refreshes state on success, maps all error codes on failure |
| `handleUpdatePortal()` | User clicks "Update Portal" | Calls `updatePortal(networkId, 'risk', { risk: { bucket } }, 'manual_update')`, refreshes state |

#### Polling

- **12-second interval** when `apEnabled=true && networkId` is set
- Clears on unmount or when AP goes off
- Keeps risk badge, `portal_out_of_date`, and scan freshness current without user interaction

#### Returns

```js
{
  accessPoint,          // { enabled, currentNetwork, status, connectedClients, ... }
  networkConfig,        // { ssid, bssid, channel, encryption_type }
  apEnabled,
  portalInitialized,
  adminState,           // full state object from /network/:id/state
  loading,
  configLoading,
  error,
  scanError,
  hasScanId,
  refetch,              // re-fetches network config
  refetchState,         // re-fetches admin state
  handleToggleAccessPoint,
  handleUpdatePortal,
}
```

### `AccessPointPanel.jsx`

**File:** `src/components/device/AccessPointPanel.jsx`

#### Banner Precedence (Exclusive — Only ONE Renders)

The `computeBanner()` function enforces strict priority:

| Priority | Banner Key | Condition | Type |
|----------|-----------|-----------|------|
| 1 | `config_missing` | `network_config_missing` | Blocking |
| 2 | `apply_in_progress` | `ap_apply_in_progress` | Blocking + disable controls |
| 3 | `scan_error` | `scanError` (from toggle attempt) | Blocking |
| 4 | `scan_required` | AP off + no scan | Blocking |
| 5 | `scan_stale_blocking` | AP off + has scan + not fresh | Blocking |
| 6 | `portal_outdated` | AP on + `portal_out_of_date` | Warning + Update Portal button |
| 7 | `scan_stale_info` | AP on + has scan + not fresh | Info (non-blocking) |

The first matching condition wins. No two banners ever render simultaneously.

#### Risk Badge

Shows current `risk_bucket` with color-coded badge (LOW=green, MEDIUM=amber, HIGH=red, CRITICAL=pink).

#### Props

```js
{
  accessPoint,     // { enabled, status, ... }
  networkConfig,   // { ssid, bssid, channel, encryption_type }
  apPassword,      // controlled input value
  setApPassword,   // setter
  loading,         // mutation loading
  error,           // error message
  scanError,       // scan error code
  hasScanId,       // boolean
  adminState,      // full admin state from /network/:id/state
  onRetry,         // refetch handler
  onToggle,        // toggle handler (receives password)
  onUpdatePortal,  // portal update handler
}
```

### CSS

**File:** `src/pages/DeviceManagement/DeviceManagement.css`

All new classes are scoped under `.device-page` to prevent cross-page collisions:

- `.device-page .info-state` — Blue banner (applying, scan stale info)
- `.device-page .warning-state` — Amber banner (scan required, portal outdated, etc.)
- `.device-page .risk-badge` — Pill-shaped risk label
- `.device-page .risk-low` / `.risk-medium` / `.risk-high` / `.risk-critical` — Color variants

---

## Correctness Fixes Applied

### Chunk 6 Fixes (6 checks)

1. **Fields correctness** — `updateNetworkRisk` updates all correct fields: `risk_bucket`, `risk_score`, `risk_score_version` (only on change), `last_scan_id`/`last_scan_finished_at` (scan hook), `last_threat_at` (threat hook)

2. **NULL cooldown handling** — `if (lastPatchedAt)` guard means NULL = first-ever patch, which runs immediately

3. **Version-safe portal stamping** — `autoPortalRiskPatch` snapshots `risk_score_version` + `risk_bucket` before patch, then post-checks bucket drift. If bucket changed during patch, skip stamp and let next cycle re-patch

4. **BSSID normalization** — `persistThreatRows` normalizes to uppercase; `findLatestScanIdForBssid` queries with normalized BSSID

5. **Webhook hardening** — `SCAN_RUNNER_TOKEN` env var, `X-Scan-Runner-Token` header check (401), UUID regex validation before DB query, idempotency returns `{ok:true, skipped:true}` (not error)

### Chunk 7 Fixes (5 checks)

1. **Banner precedence** — Refactored to `computeBanner()` with strict priority chain. Only one banner renders at a time. `ap_apply_in_progress=true` will never also show "scan stale"

2. **Portal update reason** — `handleUpdatePortal` sends `reason: 'manual_update'` (user-triggered) instead of `'risk_score_changed'` (pipeline-triggered). Payload is risk-only: `{ risk: { bucket } }`

3. **Polling** — 12-second interval when AP is enabled. Clears on unmount or disable. Keeps risk badge, portal freshness, and scan age current

4. **CSS scoping** — All new styles scoped under `.device-page` to prevent collisions

5. **Webhook** — Verified: 401 on bad token, env var comparison, UUID before DB query, idempotent retries return `{ok:true, skipped:true}`

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FASTAPI_BASE` | `http://mothership-1.tail781e52.ts.net:8000` | FastAPI base URL |
| `SCAN_MAX_AGE_SECONDS` | `300` (5 min) | Maximum scan age for freshness check |
| `SCAN_RUNNER_TOKEN` | `''` (disabled) | Shared secret for `/scan-completed` webhook |
| `PORTAL_PATCH_COOLDOWN_MS` | `15000` (15s) | Min time between auto portal patches |

---

## API Reference

### Device Management Routes (`/api/device/...`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/enable-ap` | Enable or disable AP (with scan validation) |
| `GET` | `/ap-state/:networkId` | Simple AP state (backward compat) |
| `GET` | `/network/:networkId/state` | Full admin state (Chunk 4) |
| `POST` | `/portal/update` | Client-driven portal patch (Chunk 5) |
| `POST` | `/scan-completed` | Webhook for scan runner (Chunk 6) |
| `POST` | `/signal_ap` | Legacy toggle (backward compat) |

---

## Error Codes

### Scan Validation Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `SCAN_REQUIRED` | 400 | No `scan_id` provided for enable |
| `SCAN_NOT_FOUND` | 404 | Scan row doesn't exist |
| `SCAN_NETWORK_MISMATCH` | 409 | Scan belongs to different network |
| `SCAN_NOT_FINISHED` | 409 | Scan status is RUNNING/QUEUED |
| `SCAN_FAILED` | 409 | Scan status is FAILED/CANCELLED/TIMEOUT |
| `SCAN_HAS_ERRORS` | 409 | Scan completed but has error_code |
| `SCAN_INVALID_DATA` | 409 | Scan completed but scan_data is empty |
| `SCAN_TOO_OLD` | 409 | Scan finished_at is older than max age |

### AP Operation Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `NETWORK_CONFIG_MISSING` | 400 | SSID/BSSID/channel missing |
| `AP_PASSWORD_REQUIRED` | 400 | Encrypted network requires password |
| `AP_PASSWORD_WEAK` | 400 | Password < 8 characters |
| `REQUEST_IN_PROGRESS` | 409 | `ap_apply_in_progress` lock held |
| `FASTAPI_APPLY_FAILED` | 502 | FastAPI `/orchestrate/apply` failed |
| `PORTAL_PATCH_FAILED` | 502 | FastAPI `/portal/patch` failed (init) |

### Portal Update Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `AP_NOT_ENABLED` | 400 | Can't patch when AP is off |
| `EMPTY_PATCH` | 400 | No payload keys provided |
| `UNSAFE_PATCH_FIELD` | 400 | Key not in allowlist |
| `UPDATE_TYPE_MISMATCH` | 400 | Key doesn't match update_type |
| `INVALID_PATCH_SHAPE` | 400 | Invalid risk bucket value |
| `FASTAPI_PORTAL_PATCH_FAILED` | 502 | FastAPI patch call failed |

### Webhook Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or wrong scan runner token |
| `INVALID_INPUT` | 400 | Missing or invalid UUID for scan_id |

---

## SQL Diagnostic Queries

### Check portal freshness mismatch

```sql
SELECT
  network_id,
  ap_enabled,
  risk_bucket,
  risk_score_version,
  portal_last_patched_version,
  portal_last_patched_at,
  (ap_enabled AND portal_last_patched_version < risk_score_version) AS portal_out_of_date
FROM networks
WHERE network_id = 'YOUR_UUID';
```

### Latest eligible scan

```sql
SELECT scan_id, status, finished_at, error_code
FROM vulnerability_scans
WHERE network_id = 'YOUR_UUID'
  AND status = 'COMPLETED'
  AND error_code IS NULL
ORDER BY finished_at DESC
LIMIT 1;
```

### Risk pipeline audit trail

```sql
SELECT event_name, event_status, meta, created_at
FROM audit_logs
WHERE entity_id_uuid = 'YOUR_NETWORK_UUID'
  AND event_name IN ('RISK_UPDATE', 'PORTAL_UPDATE', 'AP_ENABLE_REQUEST', 'AP_STATUS_CHANGE')
ORDER BY created_at DESC
LIMIT 20;
```

### Check concurrency lock

```sql
SELECT network_id, ap_apply_in_progress
FROM networks
WHERE ap_apply_in_progress = true;
```

---

## End-to-End Test Plan

### A. AP Enable Happy Path

1. Choose network with valid SSID/BSSID/channel, `portal_initialized=false`, `ap_enabled=false`
2. Ensure a `vulnerability_scans` row exists: `status=COMPLETED`, `error_code=null`, `finished_at` recent
3. Call enable with that `scan_id`

**Expected:**
- FastAPI `/portal/patch` called once (portal init)
- FastAPI `/orchestrate/apply` called with enable payload
- DB: `ap_enabled=true`, `ap_apply_in_progress` flips true→false, `portal_initialized=true`, `portal_last_patched_at` set, `last_scan_id`/`last_scan_finished_at` set

### B. Gating Failures

| Scenario | Expected Code | Expected Banner |
|----------|--------------|-----------------|
| Missing `scan_id` | `SCAN_REQUIRED` | "Scan required" |
| Scan status RUNNING | `SCAN_NOT_FINISHED` | Scan error banner |
| Scan status FAILED | `SCAN_FAILED` | Scan error banner |
| Scan too old | `SCAN_TOO_OLD` | Scan error banner |

### C. Portal Out-of-Date Flow

1. Increment `networks.risk_score_version` and change `risk_bucket` (without changing `portal_last_patched_version`)
2. Call `/network/:id/state` → `portal_out_of_date=true`
3. UI shows "Captive portal content is out of date" + Update Portal button
4. Click Update → calls Chunk 5 risk-only patch
5. DB stamps `portal_last_patched_version == risk_score_version`
6. Banner disappears on next poll (12s)

### D. Webhook Security

| Request | Expected |
|---------|----------|
| No token header | 401 `UNAUTHORIZED` |
| Wrong token | 401 `UNAUTHORIZED` |
| Invalid UUID | 400 `INVALID_INPUT` |
| Same valid `scan_id` twice | Second returns `{ ok: true, skipped: true }` |

---

## Files Modified

### Backend

| File | Changes |
|------|---------|
| `backend/routes/deviceMgmtRoutes.js` | Full AP lifecycle, admin state endpoint, portal partial update, scan webhook |
| `backend/utils/riskPipeline.js` | **New file** — bucket computation, version bumping, auto-portal patching, scan/threat hooks |
| `backend/utils/scanValidation.js` | Pure scan validation functions, network config validation, password validation, portal payload builder |
| `backend/utils/auditLogger.js` | Fire-and-forget audit logging (unchanged, consumed by new code) |
| `backend/server.js` | Wired `onThreatEvent` into `persistThreatRows()` |

### Frontend

| File | Changes |
|------|---------|
| `src/hooks/useDevice.js` | Full rewrite — consumes `getNetworkState`, adds polling, portal update, admin state |
| `src/components/device/AccessPointPanel.jsx` | Full rewrite — deterministic banners via `computeBanner()`, risk badge, Update Portal button |
| `src/pages/DeviceManagement/DeviceManagement.jsx` | Wired new props: `adminState`, `handleUpdatePortal`, `refetchState` |
| `src/pages/DeviceManagement/DeviceManagement.css` | Added scoped styles for `.info-state`, `.warning-state`, `.risk-badge`, `.risk-*` |
| `src/api/deviceApi.js` | Added `getNetworkState()`, `updatePortal()` |

---

## Future Improvements

### 1. DB-Backed Debounce Queue

Current `portal_last_patched_at` cooldown works but under bursty telemetry can cause repeated skips without guaranteeing a "later patch" happens.

**Design:**
- Add to `networks`: `portal_risk_patch_queued_at`, `portal_risk_patch_last_attempt_at`
- When risk changes during cooldown → set `queued_at`
- Lightweight worker (every 10s) patches queued networks when cooldown passes
- Guarantees eventual consistency

### 2. Diagnostics Panel

Admin-visible panel showing:
- `last_scan_finished_at`, `last_threat_at`
- `risk_bucket` + `risk_score_version`
- `portal_last_patched_version/at`
- Last AP apply time
- Last portal patch response code (from audit logs)

Makes it easy to answer "why is portal out of date?" without SQL.

### 3. Numeric Risk Score Algorithm

Currently bucket-only (no numeric scoring). When `computeRiskScore()` is ready:
- Swap derivation logic in `riskPipeline.js`
- Everything else (versioning, stamping, auto-portal) works unchanged
- `bucketize(score)` already maps 0–100 → bucket labels
