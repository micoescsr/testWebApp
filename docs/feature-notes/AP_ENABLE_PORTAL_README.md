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

---

## Overview

This feature implements a full AP (Access Point) lifecycle with:

- **Scan freshness gating** — AP can only be enabled when a recent, valid, completed scan exists
- **Atomic concurrency lock with TTL** — prevents duplicate enable/disable operations via `ap_apply_in_progress`; stale locks older than `AP_LOCK_TTL_SECONDS` (default 120 s) are auto-released
- **Captive portal auto-initialization** — first enable seeds default content and patches FastAPI
- **Post-enable portal patch** — every successful AP enable pushes the latest portal content to the Pi (not just on first init)
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
                                    piFetch (HMAC signed)
```

**Data flow:**
1. Frontend calls Express endpoints (never FastAPI directly)
2. Express handles all validation, DB reads/writes, audit logging
3. Express forwards to FastAPI only for hardware operations (AP apply, portal patch)
4. Frontend polls `/network/:id/state` every 12 s when AP is enabled to stay in sync

---

## Chunk 1 — Schema DDL

**Purpose:** Add all required columns to the `networks` table.

### Columns Added to `networks`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ap_enabled` | boolean | `false` | Whether AP is currently on |
| `ap_apply_in_progress` | boolean | `false` | Concurrency lock during enable/disable |
| `ap_apply_locked_at` | timestamptz | `null` | When lock was acquired — used for TTL-based auto-expiry (migration 002) |
| `ap_last_applied_at` | timestamptz | `null` | When AP was last successfully applied (enable or disable) |
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
| `scan_data` | jsonb | Must be present and non-empty |

### Migration Files

| File | Purpose |
|------|---------|
| `backend/migrations/001_audit_archive_and_immutability.sql` | Audit archive table, indexes, immutability triggers, RLS |
| `backend/migrations/002_ap_lock_ttl.sql` | Adds `ap_apply_locked_at timestamptz` column to `networks` |

---

## Chunk 2 — Scan Validation

**File:** `backend/utils/scanValidation.js`

### `validateScan(scan, networkId, maxAgeSeconds, nowMs?)`

Pure function — validates a `vulnerability_scans` row against 6 ordered checks:

1. Scan row must exist → `SCAN_NOT_FOUND`
2. `scan.network_id == networkId` → `SCAN_NETWORK_MISMATCH`
3. Status in `{FAILED, CANCELLED, TIMEOUT}` → `SCAN_FAILED`
4. Status != `COMPLETED` or `!finished_at` → `SCAN_NOT_FINISHED`
5. `error_code` is not null → `SCAN_HAS_ERRORS`
6. `scan_data` is falsy or empty object → `SCAN_INVALID_DATA`
7. `finished_at` older than `maxAgeSeconds` → `SCAN_TOO_OLD`

Returns `{ valid: true }` or `{ valid: false, error, message, extras? }`.

### `validateNetworkConfig(networkConfig)`

Validates that `ssid`, `bssid`, and `channel` are all present.

Returns `{ valid: true }` or `{ valid: false, error: 'NETWORK_CONFIG_MISSING', message: '...', missing: [...] }`.

### `validateApPassword(encryptionStatus, apPassword)`

- Open networks (values: `open`, `none`, `unencrypted`, `''`, `null`, `undefined`) → password ignored
- Encrypted → password required, minimum 8 characters

Returns `{ valid: true }` or `{ valid: false, error: 'AP_PASSWORD_REQUIRED'|'AP_PASSWORD_WEAK', message: '...' }`.

### `buildPortalPatchPayload(bssid, ssid, nowUnix?)`

Builds a static default portal patch payload for testing / legacy use. Still includes a `terms` key for shape completeness. The live `buildPortalPayloadFromDB()` in `captivePortalController.js` does **not** include terms.

---

## Chunk 3 — Concurrency Lock + Audit + Logging

**File:** `backend/routes/deviceMgmtRoutes.js` — `POST /enable-ap`

### Flow (Enable)

```
Step 0: Atomic lock acquisition
  UPDATE networks SET ap_apply_in_progress=true, ap_apply_locked_at=now()
  WHERE network_id=? AND ap_apply_in_progress=false
  │
  ├─ Lock acquired → continue
  └─ Lock not acquired → check if stale (ap_apply_locked_at > AP_LOCK_TTL_SECONDS ago)
        ├─ Stale → force-release + re-acquire → continue (log warning)
        └─ Fresh → 409 REQUEST_IN_PROGRESS

Step 1: scan_id required           → 400 SCAN_REQUIRED
Step 2: Load vulnerability_scans row
Step 3: validateScan()             → SCAN_* errors
Step 4: Load network config from DB (never from frontend)
Step 5: validateNetworkConfig()    → 400 NETWORK_CONFIG_MISSING
Step 6: validateApPassword()       → 400 AP_PASSWORD_REQUIRED / AP_PASSWORD_WEAK

Step 7: If !portal_initialized:
  a. seedDefaultContent(networkId)
  b. buildPortalPayloadFromDB(networkId, bssid, ssid)
  c. POST /portal/patch → 502 PORTAL_PATCH_FAILED if HTTP error
  d. Re-read risk_score_version from DB
  e. UPDATE: portal_initialized=true, portal_last_patched_version=<latest>, portal_last_patched_at=now()
  f. Audit: PORTAL_PATCH SUCCESS

Step 8: POST /orchestrate/apply [timeoutMs: 60 s]
  Body: { ssid, bssid, channel, encryption_type, ap_password?, ap_status: "enable" }
  ├─ HTTP error → Audit FAILED → 502 FASTAPI_APPLY_FAILED
  ├─ status:"ERROR" → classifyOrchestrateError() → Audit FAILED → 422 (ap_enabled NOT set)
  └─ Success ↓

Step 9: UPDATE: ap_enabled=true, ap_last_applied_at=now(), last_scan_id, last_scan_finished_at

Step 10: POST /portal/patch (post-enable, non-fatal)  ← EVERY enable, not just first init
  buildPortalPayloadFromDB() → Pi receives latest announcements + tips + risk
  On success: UPDATE portal_last_patched_at=now()

Audit: AP_ENABLE_REQUEST SUCCESS
Return: { ok:true, ap_enabled:true, portal_initialized:true, portal_patched:true/false, scan:{...}, fastapi:{...} }

catch (502/503/504 from piFetch):
  piFetch('/device/status', { timeoutMs: 8000 })
  ├─ Pi reachable → UPDATE ap_enabled to match Pi, ap_last_applied_at → return 200 { reconciled:true }
  └─ Pi unreachable → return { error:'AP_TOGGLE_FAILED', timeout:true }

finally: releaseApLock() → ap_apply_in_progress=false, ap_apply_locked_at=null
```

### Flow (Disable)

```
Step 0: Atomic lock (same TTL logic)
Load network config from DB → validateNetworkConfig()

POST /orchestrate/apply [timeoutMs: 60 s]  { ap_status: "disable", ... }
  ├─ HTTP error → 502 FASTAPI_APPLY_FAILED
  ├─ status:"ERROR" → classifyOrchestrateError() → 422
  └─ Success → UPDATE: ap_enabled=false, ap_last_applied_at=now()

Audit: AP_DISABLE_REQUEST SUCCESS
Return: { ok:true, ap_enabled:false, ap_status:"disable", fastapi:{...} }

catch (502/503/504): Same timeout reconciliation as enable

finally: releaseApLock()
```

### Key Design Decisions

- **`httpError(status, code, message, extra)`** — Typed error helper. Throw anywhere; catch block reads `.status`, `.code`, `.extra` to build response.
- **`classifyOrchestrateError(fastapiData)`** — Parses FastAPI `orchestrate/apply` responses where HTTP is 200 but `status: "ERROR"`. Returns `null` if response is not an error.
- **`releaseApLock()`** — Always runs in `finally` block. Clears both `ap_apply_in_progress` and `ap_apply_locked_at`. Logs but never throws.
- **`AP_LOCK_TTL_SECONDS`** (default 120 s) — If lock acquisition fails and the existing lock's `ap_apply_locked_at` is older than the TTL, the lock is force-released and re-acquired. Prevents permanent blockage from crashed requests.
- **Timeout reconciliation** — On 502/503/504 from `piFetch`, the catch block polls `GET /device/status` (8 s timeout). If reachable, updates `ap_enabled` and `ap_last_applied_at` in DB and returns `200 { reconciled: true }`. If unreachable, falls through to error response with `timeout: true`.
- **`logFastApiCall()`** — Logs method, URL, payload, response status + body for debugging.
- **`logAuditEvent()`** — Fire-and-forget. Maps `SUCCESS→OK`, `FAILED→FAIL`, `DENIED→DENY` for the DB enum.
- **`risk_score_version` re-read** — After portal init patch, re-reads version from DB before stamping to avoid race conditions.
- **Post-enable portal patch (Step 10)** — After every successful `ap_enabled = true`, a non-fatal `buildPortalPayloadFromDB()` + `POST /portal/patch` ensures the Pi always has the latest content when AP comes up, regardless of whether this is the first or a subsequent enable.
- **HMAC signing** — All FastAPI calls (including `/portal/patch`) are authenticated via HMAC signing (`CONTROL_SIGNING_SECRET`) through `piFetch`. The legacy `x-portal-token` / `PORTAL_TOKEN` header has been removed.

---

## Chunk 4 — Admin State Endpoint

**File:** `backend/routes/deviceMgmtRoutes.js` — `GET /network/:networkId/state`

**Purpose:** Single source of truth for the frontend. Returns all state needed to render banners.

### Response Shape

```json
{
  "ok": true,
  "network_id": "uuid",
  "ap_enabled": false,
  "ap_apply_in_progress": false,
  "portal_initialized": false,
  "scan_state": {
    "has_scan": true,
    "scan_fresh": true,
    "latest_scan_id": "uuid",
    "latest_scan_finished_at": "2026-03-13T10:00:00Z"
  },
  "portal_state": {
    "portal_out_of_date": false,
    "portal_last_patched_version": 3,
    "portal_last_patched_at": "2026-03-13T09:55:00Z"
  },
  "risk_state": {
    "risk_score": 45,
    "risk_bucket": "MEDIUM",
    "risk_score_version": 3,
    "last_threat_at": null
  },
  "flags": {
    "network_config_missing": false
  }
}
```

### Key Logic

- `scan_fresh` = `has_scan && (Date.now() − finished_at_ms) ≤ SCAN_MAX_AGE_SECONDS × 1000`
- `portal_out_of_date` = `ap_enabled && portal_last_patched_version < risk_score_version`
- `network_config_missing` = any of `ssid` / `bssid` / `channel` is falsy

The endpoint loads the latest eligible scan (COMPLETED, `error_code IS NULL`) separately from the networks row, so `has_scan` and `scan_fresh` are always accurate even if `last_scan_id` on the networks row is not yet updated.

**Frontend API:** `getNetworkState(networkId)` in `deviceApi.js`

---

## Chunk 5 — Portal Partial Update

**File:** `backend/routes/deviceMgmtRoutes.js` — `POST /portal/update`

**Purpose:** Client-driven partial portal update with strict allowlist validation. Used by the "Update Portal" button when `portal_out_of_date=true`.

### Request Body

```json
{
  "network_id": "uuid",
  "update_type": "announcement|tips|risk|active|bulk",
  "payload": { ... },
  "reason": "manual_update"
}
```

### Valid Update Types

| `update_type` | Allowed `payload` keys |
|---|---|
| `announcement` | `announcement`, `is_active` |
| `tips` | `tips`, `is_active` |
| `risk` | `risk`, `is_active` |
| `active` | `is_active` |
| `bulk` | `announcement`, `tips`, `risk`, `is_active` |

`is_active` is always optional on any type.

### Validation (`validatePatchPayload()`)

1. **Allowlist:** Only keys in `ALLOWED_PAYLOAD_KEYS` are accepted (`announcement`, `tips`, `risk`, `is_active`)
2. **Type consistency:** Keys must belong to the declared `update_type`
3. **Per-section shape:**
   - `announcement`: object with optional `content` (string, max 2000 chars) and `is_active` (boolean)
   - `tips`: array (max 20 items) of objects with required `tip_text` (string, max 300 chars), optional `sort_order` (integer, defaults to index+1), optional `is_active` (boolean)
   - `risk`: `{ bucket }` where bucket ∈ `{LOW, MEDIUM, HIGH, CRITICAL}`
   - `is_active`: boolean
4. **Risk debounce:** If `portal_last_patched_version ≥ risk_score_version` → skip patch (no-op, returns `{ ok:true, skipped:true, reason:'already_up_to_date' }`)

### Post-Patch Stamping

- Always stamps `portal_last_patched_at = now()`
- When `patch.risk` is present: re-reads `risk_score_version` from DB before stamping `portal_last_patched_version` (avoids stale stamp)

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `EMPTY_PATCH` | 400 | No payload keys provided |
| `UNSAFE_PATCH_FIELD` | 400 | Key not in allowlist |
| `UPDATE_TYPE_MISMATCH` | 400 | Key doesn't belong to declared `update_type` |
| `INVALID_PATCH_SHAPE` | 400 | Shape validation failed (wrong type, out of range, etc.) |
| `AP_NOT_ENABLED` | 409 | Can't patch portal when AP is off |
| `NETWORK_NOT_FOUND` | 404 | `network_id` does not exist |
| `FASTAPI_PORTAL_PATCH_FAILED` | 502 | FastAPI call failed |

**Frontend API:** `updatePortal(networkId, updateType, payload, reason)` in `deviceApi.js`

---

## Chunk 6 — Risk Pipeline + Auto-Portal

**File:** `backend/utils/riskPipeline.js`

### Core Functions

#### `bucketize(score)` — Score → Bucket

| Range | Bucket |
|-------|--------|
| 0 | LOW |
| 1–39 | LOW |
| 40–69 | MEDIUM |
| 70–89 | HIGH |
| 90–100 | CRITICAL |

#### `deriveBucketFromScanData(scanData)`

Walks scan findings for severity labels (Critical/High/Medium/Low) and CVSS scores. Handles array, object-with-findings-array, and keyed formats. Fallback: any "real" findings (with `status`, `id`, or `vt_name`) → MEDIUM, no findings → LOW.

#### `deriveBucketFromThreats(threatRows)`

Only counts `DETECTED` threats (ignores `CLEARED`). Maps severity labels and CVSS scores to buckets. Takes the max.

#### `updateNetworkRisk(networkId, opts)`

Core orchestrator:

1. Reads current `risk_bucket`, `risk_score`, `risk_score_version`, `ap_enabled`, `portal_last_patched_at` from DB
2. Always updates `last_scan_id` / `last_scan_finished_at` (if scan hook) and `last_threat_at` (if threat hook) when provided
3. Compares old bucket + score vs new bucket + score
4. If changed: increments `risk_score_version`, updates `risk_bucket` + `risk_score`
5. Audits `RISK_UPDATE` (only when changed)
6. If AP enabled + bucket changed → triggers `autoPortalRiskPatch()`

#### `autoPortalRiskPatch(networkId, bucket, lastPatchedAt, req)`

**Version-safe stamping:**

1. Respects cooldown (`PORTAL_PATCH_COOLDOWN_MS`, default 15 s). `null` `lastPatchedAt` allows first-ever patch immediately.
2. Snapshots `risk_score_version` + `risk_bucket` BEFORE sending FastAPI patch
3. Sends `POST /portal/patch` to FastAPI with `{ network_id, risk: { bucket } }`
4. Post-check: re-reads `risk_bucket` from DB. If bucket drifted during patch → skip stamp (let next cycle re-patch)
5. Only stamps `portal_last_patched_version = postVersion` if bucket still matches

This prevents "portal says LOW but stamped as version 7 (which is HIGH)."

#### `onScanCompleted(scanId, req)`

Webhook handler for scan completion:

1. Loads scan row from `vulnerability_scans`
2. Derives bucket from `scan_data`
3. Factors in recent threats (5-minute decay window): if `last_threat_at` is within 5 min, does not let scan downgrade below current bucket
4. Calls `updateNetworkRisk()` with scan metadata

#### `onThreatEvent(networkId, threatRows, req)`

Called from threat detection pipeline after threat rows are persisted:

- Active threats (DETECTED) → derive threat bucket → take max(current, threat bucket) → call `updateNetworkRisk()`
- All cleared → re-derive from last scan data (calls `updateNetworkRisk()` with scan-derived bucket)

### Webhook: `POST /scan-completed`

**File:** `backend/routes/deviceMgmtRoutes.js`

Hardened webhook endpoint:

1. **Fail-closed:** Returns `503 SERVICE_UNAVAILABLE` if `SCAN_RUNNER_TOKEN` env var is **not configured** (prevents accidental open endpoint)
2. **Token auth:** `X-Scan-Runner-Token` header must match `SCAN_RUNNER_TOKEN` → 401 if missing/wrong
3. **UUID validation:** `scan_id` checked against regex before any DB query → 400 if invalid
4. **Idempotency:** Checks if `networks.last_scan_id === scan_id` → returns `{ ok: true, skipped: true, reason: 'already_processed' }` (not an error)
5. Calls `onScanCompleted(scan_id, req)`

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
| `networkConfig` | `/rasPi/networks/:id` | Display-only SSID/BSSID/channel/encryption |
| `loading` | local | Mutation in progress |
| `error` | local | User-facing error message |
| `scanError` | local | Scan validation error code from backend |
| `isReconcilingToggle` | local | Whether bounded timeout reconciliation is in progress |

#### Methods

| Method | When Called | What It Does |
|--------|------------|--------------|
| `fetchNetworkConfig()` | Mount | Calls `getNetworkConfig()`, updates display state |
| `fetchAdminState()` | Mount, after mutations, every 12 s | Calls `getNetworkState()`, updates all derived state |
| `handleToggleAccessPoint(apPassword)` | User clicks toggle | Calls `toggleAP()`, refreshes state on success, maps all error codes on failure. Handles `reconciled: true` responses. On 502/503/504, enters bounded reconciliation via `waitForAdminStateSettlement`. |
| `handleUpdatePortal()` | User clicks "Update Portal" | Calls `updatePortal(networkId, 'risk', { risk: { bucket } }, 'manual_update')`, refreshes state |
| `waitForAdminStateSettlement(targetApEnabled)` | Internal, after 502/503/504 | Bounded reconciliation: 6 polls at 3 s, 10 s, 20 s, 35 s, 50 s, 60 s. Uses `ap_apply_in_progress === false` as settlement gate. Cleanup-safe on unmount via `mountedRef`. |

#### Polling

- **12-second interval** when `apEnabled === true && networkId` is set
- **Suspended** during timeout reconciliation (`isReconcilingToggle === true`) to prevent race conditions
- Clears on unmount or when AP goes off
- Keeps risk badge, `portal_out_of_date`, and scan freshness current without user interaction

#### Returns

```js
{
  accessPoint,          // { enabled, currentNetwork, accessPointNetwork, status, connectedClients }
  networkConfig,        // { ssid, bssid, channel, encryption_type }
  apEnabled,            // boolean
  portalInitialized,    // boolean
  adminState,           // full admin state object from /network/:id/state
  loading,              // boolean — mutation in progress
  configLoading,        // boolean — network config fetch in progress
  error,                // string | null — user-facing error
  scanError,            // string | null — scan validation error code
  hasScanId,            // boolean — whether scanId was passed in
  isReconcilingToggle,  // boolean — bounded timeout reconciliation active
  refetch,              // fn — re-fetch network config
  refetchState,         // fn — re-fetch admin state
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
| 1 | `config_missing` | `network_config_missing` (from `flags`) | Blocking |
| 2 | `apply_in_progress` | `ap_apply_in_progress && !isReconcilingToggle && !hasError` | Blocking + disable controls |
| 3 | `toggle_reconciling_timeout` | `isReconcilingToggle` | Info — "Checking actual access point state…" |
| 4 | `scan_error` | `scanError` (from toggle attempt, excluding `SCAN_REQUIRED`) | Blocking |
| 5 | `scan_required` | AP off + no scan | Blocking |
| 6 | `scan_stale_blocking` | AP off + has scan + not fresh | Blocking |
| 7 | `portal_outdated` | AP on + `portal_out_of_date` | Warning + Update Portal button |
| 8 | `scan_stale_info` | AP on + has scan + not fresh | Info (non-blocking) |

The first matching condition wins. No two banners ever render simultaneously.

**Notable:** `apply_in_progress` is only shown when neither reconciliation is active nor an error is displayed — preventing contradictory banners.

#### Risk Badge

Shows current `risk_bucket` from `adminState.risk_state.risk_bucket` with color-coded badge:
- `LOW` → `.risk-low` (green)
- `MEDIUM` → `.risk-medium` (amber)
- `HIGH` → `.risk-high` (red)
- `CRITICAL` → `.risk-critical` (pink/dark red)

#### Toggle Disabled When

- `loading` is true
- `ap_apply_in_progress` is true
- `isReconcilingToggle` is true
- AP is off and no `scan_id` is available (`!hasScanId`)

#### Props

```js
{
  accessPoint,          // { enabled, status, currentNetwork, ... }
  networkConfig,        // { ssid, bssid, channel, encryption_type }
  apPassword,           // string — AP password input value
  setApPassword,        // fn — updates AP password
  loading,              // boolean
  error,                // string | null
  scanError,            // string | null
  hasScanId,            // boolean
  adminState,           // full admin state object
  isReconcilingToggle,  // boolean
  onRetry,              // fn — retry handler (refetch + refetchState)
  onToggle,             // fn(apPassword) — toggle handler
  onUpdatePortal,       // fn — portal update handler
}
```

### CSS

**File:** `src/pages/DeviceManagement/DeviceManagement.css`

All classes scoped under `.device-page` to prevent cross-page collisions:

- `.device-page .info-state` — Blue banner (applying, scan stale info, reconciling)
- `.device-page .warning-state` — Amber banner (scan required, portal outdated, etc.)
- `.device-page .error-state` — Red banner (toggle errors)
- `.device-page .loading-state` — Loading indicator
- `.device-page .empty-state` — AP disabled placeholder
- `.device-page .risk-badge` — Pill-shaped risk label
- `.device-page .risk-low` / `.risk-medium` / `.risk-high` / `.risk-critical` — Color variants

---

## Correctness Fixes Applied

### Chunk 3 Fixes

1. **AP lock TTL (C11)** — Added `ap_apply_locked_at` timestamp column (migration 002). Lock acquisition now stamps the timestamp. When acquisition fails, backend checks if existing lock exceeds TTL (default 120 s) and auto-releases stale locks. `releaseApLock()` clears both `ap_apply_in_progress` and `ap_apply_locked_at`.

2. **`ap_last_applied_at` stamping** — Both enable and disable paths now stamp `ap_last_applied_at = now()` on every successful apply, providing an accurate audit trail of when AP was last changed.

3. **Post-enable portal patch (Step 10)** — After every successful enable (not just first init), `buildPortalPayloadFromDB()` is called and the result is posted to `/portal/patch`. Non-fatal: failure is logged and `portal_patched: false` is returned, but the enable response is still `{ ok: true }`.

4. **Orchestrate application-level errors** — FastAPI `/orchestrate/apply` returns HTTP 200 with `status: "ERROR"` on failures. Backend now checks `fastapiData.status === 'ERROR'` via `classifyOrchestrateError()` and returns HTTP 422 with structured error details. Previously these were treated as success — `ap_enabled` was set to `true` even though the AP was actually OFF.

5. **Guard against false `ap_enabled`** — When `classifyOrchestrateError()` detects a failure, the enable path returns 422 immediately without setting `ap_enabled = true` or `portal_initialized = true` in the DB.

### Chunk 6 Fixes

1. **Bucket scale** — `bucketize()` uses the official scale: `0 → LOW`, `1–39 → LOW`, `40–69 → MEDIUM`, `70–89 → HIGH`, `90–100 → CRITICAL`. Previous README used a different scale (0–24 = LOW, 25–49 = MEDIUM, etc.) that did not match the implementation.

2. **Fields correctness** — `updateNetworkRisk` updates all correct fields: `risk_bucket`, `risk_score`, `risk_score_version` (only on change), `last_scan_id` / `last_scan_finished_at` (scan hook), `last_threat_at` (threat hook).

3. **NULL cooldown handling** — `if (lastPatchedAt)` guard means `null` = first-ever patch, which runs immediately.

4. **Version-safe portal stamping** — `autoPortalRiskPatch` snapshots `risk_score_version` + `risk_bucket` before patch, then post-checks bucket drift. If bucket changed during patch, skip stamp and let next cycle re-patch.

5. **Webhook hardening** — `SCAN_RUNNER_TOKEN` env var check is now **fail-closed**: returns 503 if the variable is not configured at all (previously would have accepted any request with a blank token). UUID regex validation before DB query, idempotency returns `{ ok:true, skipped:true }`.

6. **`risk_score_version` re-read** — After portal init patch in the enable flow, re-reads version from DB before stamping to avoid race conditions.

### Chunk 7 Fixes

1. **Banner precedence** — Refactored to `computeBanner()` with strict priority chain. Only one banner renders at a time. `apply_in_progress` will never also show "scan stale". `apply_in_progress` now has an additional `!hasError` guard.

2. **Portal update payload** — `handleUpdatePortal` sends `reason: 'manual_update'` (user-triggered) instead of `'risk_score_changed'` (pipeline-triggered). Payload is risk-only: `{ risk: { bucket } }`.

3. **Polling** — 12-second interval when AP is enabled. Clears on unmount or disable. **Suspended during timeout reconciliation** to prevent race conditions.

4. **CSS scoping** — All new styles scoped under `.device-page` to prevent collisions.

5. **Bounded timeout reconciliation** — On 502/503/504, frontend enters `isReconcilingToggle` mode with 6 deterministic polls over 60 s. Uses `ap_apply_in_progress === false` as settlement gate. Timers cleaned up on unmount via `mountedRef`. Toggle disabled during reconciliation. Classified backend errors never enter reconciliation mode.

### Network Data Fixes

1. **Network update on scan save** — `rasPiController.saveNetworkMetadataScan()` now includes `ssid` and `channel` in the upsert-on-existing-network update. Previously only `city, province, notes, encryption_status, num_clients, bssid` were updated.

2. **Unified HMAC auth** — All FastAPI calls (`/portal/patch`, `/orchestrate/apply`, etc.) authenticate via HMAC signing (`CONTROL_SIGNING_SECRET`) through `piFetch`. The legacy `x-portal-token` / `PORTAL_TOKEN` header has been fully removed.

3. **Portal payload no longer includes terms** — `buildPortalPayloadFromDB()` in `captivePortalController.js` sends `{ announcements, tips, security }` to the Pi. Terms are fully removed from the live payload.

4. **`lookupRiskClassification()` resilience** — Falls back to hardcoded tiers when the `wifi_risk_scale` table does not exist, so risk coloring never breaks.

### NetworkContext Fix

**`NetworkContext` uses `sessionStorage`, not memory** — Previous README stated "stored in memory only". The actual implementation uses `useSessionState("wf:networkScan", ...)` which persists to `sessionStorage`. State survives page refresh within the same tab and clears on tab close. Calling `setNetworkId(newId)` auto-resets `scanId` to prevent stale scan mismatch.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_BASE_URL` | `http://127.0.0.1:8000` | Pi gateway URL (`FASTAPI_BASE_URL` accepted as fallback) |
| `CONTROL_SIGNING_SECRET` | `''` | HMAC signing secret — authenticates ALL Express → Pi requests |
| `PI_SIGNING_OPTIONAL` | `false` | Set `true` in dev to skip signing when no secret is configured |
| `SCAN_MAX_AGE_SECONDS` | `300` (5 min) | Maximum scan age for freshness check |
| `AP_LOCK_TTL_SECONDS` | `120` (2 min) | AP apply lock TTL — stale locks auto-released on next request |
| `SCAN_RUNNER_TOKEN` | `''` (disabled) | Shared secret for `/scan-completed` webhook — returns 503 if not set |
| `PORTAL_PATCH_COOLDOWN_MS` | `15000` (15 s) | Min time between auto portal risk patches |

---

## API Reference

### Device Management Routes (`/api/device/...`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/enable-ap` | JWT | Enable or disable AP (scan validation on enable) |
| `GET` | `/ap-state/:networkId` | JWT | Simple AP state (backward compat) |
| `GET` | `/network/:networkId/state` | JWT | Full admin state (Chunk 4) |
| `POST` | `/portal/update` | JWT | Client-driven portal patch (Chunk 5) |
| `POST` | `/scan-completed` | `X-Scan-Runner-Token` | Webhook for scan runner (Chunk 6) |
| `POST` | `/signal_ap` | JWT | Legacy toggle stub (backward compat) |

### Captive Portal Routes (`/api/captivePortal/...`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/announcement` | JWT | Fetch active announcement |
| `GET` | `/announcement/history` | JWT | Fetch announcement history |
| `POST` | `/announcement` | JWT | Publish new announcement (syncs to Pi) |
| `GET` | `/tips` | JWT | Fetch active tips |
| `POST` | `/tips` | JWT | Replace tips |
| `GET` | `/risk-classifications` | JWT | Fetch risk classification tiers |
| `GET` | `/summary` | JWT | Preview portal payload without pushing |
| `POST` | `/sync` | JWT | Force-push portal payload to FastAPI |

---

## Error Codes

### Scan Validation Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `SCAN_REQUIRED` | 400 | No `scan_id` provided for enable |
| `SCAN_NOT_FOUND` | 400 | Scan row doesn't exist |
| `SCAN_NETWORK_MISMATCH` | 400 | Scan belongs to different network |
| `SCAN_NOT_FINISHED` | 400 | Scan status is RUNNING/QUEUED |
| `SCAN_FAILED` | 400 | Scan status is FAILED/CANCELLED/TIMEOUT |
| `SCAN_HAS_ERRORS` | 400 | Scan completed but has `error_code` |
| `SCAN_INVALID_DATA` | 400 | Scan completed but `scan_data` is empty |
| `SCAN_TOO_OLD` | 400 | Scan `finished_at` is older than max age |

### AP Operation Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `NETWORK_NOT_FOUND` | 404 | Network row doesn't exist |
| `NETWORK_CONFIG_MISSING` | 400 | SSID/BSSID/channel missing |
| `AP_PASSWORD_REQUIRED` | 400 | Encrypted network requires password |
| `AP_PASSWORD_WEAK` | 400 | Password < 8 characters |
| `REQUEST_IN_PROGRESS` | 409 | `ap_apply_in_progress` lock held and not stale |
| `FASTAPI_APPLY_FAILED` | 502 | FastAPI `/orchestrate/apply` HTTP error |
| `PORTAL_PATCH_FAILED` | 502 | FastAPI `/portal/patch` failed (init) |
| `AP_TOGGLE_FAILED` | 502–504 | Timeout/gateway error (check `timeout: true` flag) |

### Orchestrate Error Codes (FastAPI `status: "ERROR"`)

These are returned as HTTP 422 when FastAPI returns `200 OK` but with `status: "ERROR"` in the body.

| Code | Category | Retryable | Needs Rescan | FastAPI `user_message` Pattern |
|------|----------|-----------|--------------|-------------------------------|
| `PI_NETWORK_CONFLICT` | `rejected` | No | No | `matches the Pi's management network` |
| `SSID_NOT_FOUND` | `not_found` | No | No | `SSID cannot be found` |
| `PASSWORD_REQUIRED` | `auth` | Yes | No | `Password is required` |
| `INCORRECT_PASSWORD` | `auth` | Yes | No | `Incorrect Wi-Fi password` |
| `ENCRYPTION_MISMATCH` | `outdated` | No | Yes | `security type doesn't match` |
| `NETWORK_DATA_OUTDATED` | `outdated` | No | Yes | `Refused to connect` + mismatched fields |
| `DEVICE_BUSY` | `busy` | Yes | No | `Busy:` / `wifi_ops_lock` |
| `INVALID_PAYLOAD` | `validation` | No | No | `Invalid payload` |
| `DEVICE_EXCEPTION` | `internal` | Yes | No | `Exception:` |
| `UPLINK_DISCONNECTED` | `connection` | Yes | No | `Uplink disconnected` |
| `CONNECTION_FAILED` | `connection` | Yes | No | `Couldn't connect` |
| `ORCHESTRATE_ERROR` | `unknown` | No | No | Catch-all for unrecognized error messages |

#### 422 Response Shape

```json
{
  "ok": false,
  "error": "INCORRECT_PASSWORD",
  "category": "auth",
  "user_message": "Couldn't connect to uplink Wi-Fi 'MySSID': Incorrect Wi-Fi password. ...",
  "mismatched_fields": null,
  "needs_rescan": false,
  "retryable": true,
  "fastapi": { ... }
}
```

### Portal Update Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `AP_NOT_ENABLED` | 409 | Can't patch when AP is off |
| `EMPTY_PATCH` | 400 | No payload keys provided |
| `UNSAFE_PATCH_FIELD` | 400 | Key not in allowlist |
| `UPDATE_TYPE_MISMATCH` | 400 | Key doesn't match `update_type` |
| `INVALID_PATCH_SHAPE` | 400 | Shape validation failed |
| `NETWORK_NOT_FOUND` | 404 | `network_id` does not exist |
| `FASTAPI_PORTAL_PATCH_FAILED` | 502 | FastAPI patch call failed |

### Webhook Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `SERVICE_UNAVAILABLE` | 503 | `SCAN_RUNNER_TOKEN` env var not configured |
| `UNAUTHORIZED` | 401 | Missing or wrong `X-Scan-Runner-Token` header |
| `INVALID_INPUT` | 400 | Missing or invalid UUID for `scan_id` |

---

## SQL Diagnostic Queries

### Check portal freshness mismatch

```sql
SELECT
  network_id,
  ap_enabled,
  portal_initialized,
  risk_bucket,
  risk_score_version,
  portal_last_patched_version,
  portal_last_patched_at,
  (ap_enabled AND portal_last_patched_version < risk_score_version) AS portal_out_of_date
FROM networks
WHERE network_id = 'YOUR_UUID';
```

### Check stale AP lock

```sql
SELECT
  network_id,
  ap_apply_in_progress,
  ap_apply_locked_at,
  NOW() - ap_apply_locked_at AS lock_age
FROM networks
WHERE ap_apply_in_progress = true;
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
FROM audit_logging
WHERE entity_id_uuid = 'YOUR_NETWORK_UUID'
  AND event_name IN ('RISK_UPDATE', 'PORTAL_UPDATE', 'AP_ENABLE_REQUEST', 'AP_DISABLE_REQUEST', 'PORTAL_PATCH')
ORDER BY created_at DESC
LIMIT 20;
```

### Full AP lifecycle for a network

```sql
SELECT event_name, event_status, meta->>'scan_id' AS scan_id, meta->>'portal_patched' AS portal_patched, created_at
FROM audit_logging
WHERE entity_id_uuid = 'YOUR_NETWORK_UUID'
  AND event_name LIKE 'AP_%'
ORDER BY created_at DESC
LIMIT 20;
```

---

## End-to-End Test Plan

### A. AP Enable Happy Path

1. Choose network with valid SSID/BSSID/channel, `portal_initialized=false`, `ap_enabled=false`
2. Ensure a `vulnerability_scans` row exists: `status=COMPLETED`, `error_code=null`, `finished_at` within `SCAN_MAX_AGE_SECONDS`
3. Call enable with that `scan_id`

**Expected:**
- Step 7: FastAPI `/portal/patch` called once (portal init) → `portal_initialized = true`
- Step 8: FastAPI `/orchestrate/apply` called with enable payload → `ap_enabled = true`
- Step 10: FastAPI `/portal/patch` called again (post-enable) → `portal_last_patched_at` updated
- DB: `ap_apply_in_progress` flips `true → false`, `ap_apply_locked_at = null`, `ap_last_applied_at` set, `last_scan_id` / `last_scan_finished_at` set
- Response includes `portal_patched: true`

### B. Gating Failures

| Scenario | Expected Code | Expected Banner |
|----------|--------------|-----------------|
| Missing `scan_id` | `SCAN_REQUIRED` | "Scan required" |
| Scan status RUNNING | `SCAN_NOT_FINISHED` | Scan error banner |
| Scan status FAILED | `SCAN_FAILED` | Scan error banner |
| Scan too old | `SCAN_TOO_OLD` | Scan error banner |
| Scan has no `scan_data` | `SCAN_INVALID_DATA` | Scan error banner |
| Missing SSID/channel | `NETWORK_CONFIG_MISSING` | Config missing banner |
| No password for WPA2 | `AP_PASSWORD_REQUIRED` | Error message |
| Password < 8 chars | `AP_PASSWORD_WEAK` | Error message |

### C. Portal Out-of-Date Flow

1. Increment `networks.risk_score_version` and change `risk_bucket` without changing `portal_last_patched_version`
2. Call `/network/:id/state` → `portal_out_of_date = true`
3. UI shows "Captive portal content is out of date" + Update Portal button
4. Click Update → calls `POST /device/portal/update` with risk-only patch and `reason: 'manual_update'`
5. DB stamps `portal_last_patched_version = risk_score_version` and `portal_last_patched_at = now()`
6. Banner disappears on next 12 s poll

### D. AP Lock TTL

1. Manually set `ap_apply_in_progress = true` and `ap_apply_locked_at = now() - 200 seconds`
2. Call `POST /device/enable-ap`
3. Backend detects stale lock (`200s > AP_LOCK_TTL_SECONDS = 120s`), logs warning, force-releases and re-acquires
4. Enable proceeds normally

### E. Webhook Security

| Request | Expected |
|---------|----------|
| No `SCAN_RUNNER_TOKEN` env var configured | 503 `SERVICE_UNAVAILABLE` |
| No token header | 401 `UNAUTHORIZED` |
| Wrong token | 401 `UNAUTHORIZED` |
| Invalid UUID | 400 `INVALID_INPUT` |
| Same valid `scan_id` twice | Second returns `{ ok: true, skipped: true }` |

### F. Orchestrate Error Handling

| Scenario | Expected Error Code | HTTP | DB `ap_enabled` |
|----------|-------------------|------|-----------------|
| Wrong channel in DB | `NETWORK_DATA_OUTDATED` | 422 | Not changed |
| Wrong BSSID in DB | `NETWORK_DATA_OUTDATED` | 422 | Not changed |
| Wrong password | `INCORRECT_PASSWORD` | 422 | Not changed |
| No password for encrypted | `PASSWORD_REQUIRED` | 422 | Not changed |
| SSID not visible to Pi | `SSID_NOT_FOUND` | 422 | Not changed |
| Encryption type mismatch | `ENCRYPTION_MISMATCH` | 422 | Not changed |
| Pi management network | `PI_NETWORK_CONFLICT` | 422 | Not changed |
| Device busy / lock | `DEVICE_BUSY` | 422 | Not changed |
| Internal Pi exception | `DEVICE_EXCEPTION` | 422 | Not changed |
| Gateway timeout (Pi slow) | `AP_TOGGLE_FAILED` | 502–504 | Reconciled via `/device/status` |

### G. Timeout Reconciliation

1. Mock `piFetch('/orchestrate/apply')` to time out (return 504)
2. Backend catch block polls `/device/status`
   - If Pi says AP ON → DB updated, response `{ reconciled: true, ap_enabled: true }`
   - If Pi also unreachable → response `{ error: 'AP_TOGGLE_FAILED', timeout: true }`
3. Frontend: on 504 from enable → `isReconcilingToggle = true` → polls at 3 s, 10 s…
   - `ap_apply_in_progress` clears → check `ap_enabled` matches target → clear reconciliation

---

## Files Modified

### Backend

| File | Changes |
|------|---------|
| `backend/routes/deviceMgmtRoutes.js` | Full AP lifecycle, admin state endpoint, portal partial update, scan webhook, `classifyOrchestrateError()`, AP lock TTL (`ap_apply_locked_at`), post-enable portal patch (Step 10), `ap_last_applied_at` stamping, fail-closed webhook, 60 s `piFetch` timeout, timeout reconciliation |
| `backend/utils/riskPipeline.js` | Bucket scale (0–39=LOW, 40–69=MEDIUM, 70–89=HIGH, 90–100=CRITICAL), `deriveBucketFromScanData`, `deriveBucketFromThreats`, `updateNetworkRisk`, `autoPortalRiskPatch`, `onScanCompleted`, `onThreatEvent` |
| `backend/utils/scanValidation.js` | `validateScan` (6 checks incl. empty `scan_data`), `validateNetworkConfig`, `validateApPassword`, `buildPortalPatchPayload` |
| `backend/utils/auditLogger.js` | Fire-and-forget audit logging (unchanged, consumed by new code) |
| `backend/controllers/captivePortalController.js` | `seedDefaultContent` (no terms), `buildPortalPayloadFromDB` (reads `risk_score` from `scans` table, `lookupRiskClassification`, no terms), `publishAnnouncement` (AP-aware: full payload when off, announcement-only when on) |
| `backend/controllers/rasPiController.js` | `saveNetworkMetadataScan()`: network update now includes `ssid` + `channel`; dual-writes scan to `scans` (legacy) and `vulnerability_scans` (UUID PK) |
| `backend/utils/piFetch.js` | Centralized HMAC-signed Pi caller; `PI_BASE_URL` → `FASTAPI_BASE_URL` fallback; `PI_SIGNING_OPTIONAL` dev bypass |
| `backend/migrations/002_ap_lock_ttl.sql` | Adds `ap_apply_locked_at timestamptz` to `networks` |

### Frontend

| File | Changes |
|------|---------|
| `src/hooks/useDevice.js` | Consumes `getNetworkState`, 12 s polling (suspended during reconciliation), `handleUpdatePortal`, `waitForAdminStateSettlement` (6-poll bounded reconciliation, `mountedRef` cleanup), full error code mapping |
| `src/components/device/AccessPointPanel.jsx` | `computeBanner()` with updated priority (added `!hasError` guard on `apply_in_progress`), `scanErrorText` includes `ENCRYPTION_MISMATCH` + `NETWORK_DATA_OUTDATED`, risk badge from admin state |
| `src/context/NetworkContext.jsx` | Backed by `useSessionState("wf:networkScan")` — sessionStorage persistence; `setNetworkId` auto-resets `scanId` on network change; `clearNetworkScan` called on logout |
| `src/hooks/useSessionState.js` | New file — sessionStorage-backed state with versioned envelope; `clearSessionState()` for logout |
| `src/api/deviceApi.js` | `toggleAP`, `getApState`, `getNetworkConfig`, `getNetworkState`, `updatePortal`, `publishAnnouncement` |
| `src/pages/DeviceManagement/DeviceManagement.jsx` | Context-first ID resolution, announcement-only editor, `pi_synced`/`pi_error` warning, retry calls both `refetch()` + `refetchState()` |
| `src/pages/SAM/SAM.jsx` | Calls `setNetworkScan(networkId, scanId)` after scan save |
| `src/layouts/Sidebar.jsx` | Appends `?network_id=<id>&scan_id=<id>` to Device Management link |
