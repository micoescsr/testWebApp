# Device Management – Access Point & Captive Portal

## Overview

The Device Management page lets an authenticated user **enable/disable a captive portal AP** on a scanned network and **update the captive portal announcement**. The **backend is the sole source of truth** — it loads all network config (SSID, BSSID, channel, encryption) from Supabase, validates scan freshness, seeds the captive portal on first enable, and persists AP + portal state in the DB.

**Key behaviors:**
- The page shows a single announcement editor (no tabs) — Terms & Conditions have been fully removed.
- Announcement updates always sync to the Raspberry Pi via `portal/patch`, regardless of AP state.
- When AP is **disabled**: the full portal payload (announcement + tips + risk) is sent so the Pi has the latest content ready for when AP is enabled.
- When AP is **enabled**: only the announcement portion is sent for real-time update.
- After every successful AP enable, a **post-enable portal patch** (Step 10) is sent to the Pi with the latest portal content. This runs on every enable, not just the first.
- AP enable/disable errors from the Pi are classified into normalized error codes for clear user prompts.
- Gateway timeouts (502/503/504) trigger **automatic reconciliation** — the backend polls the Pi's actual state and the frontend self-corrects via bounded polling.
- The AP apply lock includes a **TTL** — stale locks older than `AP_LOCK_TTL_SECONDS` (default 120 s) are auto-released so a crashed request can never permanently block AP operations.

---

## Architecture

```
SAM (scan) ──► NetworkContext (sessionStorage: networkId + scanId)
                  │
                  ▼
              DeviceManagement page
                  │
                  ├─ Announcement editor (left panel)
                  │      └─ POST /captivePortal/announcement   → saves to DB, syncs to Pi
                  │
                  ├─ useDevice(networkId, scanId)
                  │      ├─ GET  /device/network/:id/state     → admin state (AP, scan, portal, risk)
                  │      ├─ GET  /rasPi/networks/:id           → { ssid, bssid, channel, encryption_type }
                  │      └─ POST /device/enable-ap              → backend validates scan, loads config,
                  │                                                calls portal/patch + orchestrate/apply
                  │
                  └─ AccessPointPanel (UI: toggle + scan/error banners + risk badge)
```

---

## Secure Network ID + Scan ID Transport

**Problem:** The previous implementation stored `network_id` in `localStorage`, which is insecure (accessible to any JS on the origin, persists across sessions, visible in dev tools).

**Solution:** Replaced with a **React Context** (`NetworkContext`) that persists both `networkId` and `scanId` in **`sessionStorage`** (not `localStorage`), using a versioned envelope under the key `wf:networkScan`. State survives page refresh within the same tab. On tab close, sessionStorage clears automatically.

| Layer | What happens |
|---|---|
| `NetworkContext.jsx` | Creates a React context backed by `useSessionState("wf:networkScan", ...)`. Exports `networkId`, `scanId`, `setNetworkId`, `setScanId`, `setNetworkScan`, `clearNetworkScan`. |
| `useSessionState.js` | Drop-in replacement for `useState` that syncs to sessionStorage via a versioned envelope `{ v: 1, value: ... }`. Supports functional `setState(prev => next)`. |
| `App.jsx` | Wraps the entire app in `<NetworkProvider>` |
| `SAM.jsx` | After a successful scan + save, calls `setNetworkScan(networkId, scanId)` |
| `Sidebar.jsx` | Dynamically appends `?network_id=<id>&scan_id=<id>` to the Device Management link when context values are present |
| `DeviceManagement.jsx` | Reads from context first (`useNetworkContext()`), falls back to URL search params (for direct links / page refresh) |

**Logout behavior:** `clearSessionState()` wipes all `wf:*` keys from sessionStorage to prevent data leaking into the next session.

**Network change behavior:** Calling `setNetworkId(newId)` automatically resets `scanId` to `null` when the network changes, preventing stale scan mismatch.

---

## Scan Validation

The backend validates scans before enabling the AP:

| Check | When | Backend Error Code | UI Behaviour |
|---|---|---|---|
| `scan_id` is present | Enable only | `SCAN_REQUIRED` | Toggle disabled + "Scan required" banner with link to SAM |
| Scan belongs to the requested network | Enable only | `SCAN_NETWORK_MISMATCH` | Warning banner + "Scan Again" button |
| Scan status is FAILED / CANCELLED / TIMEOUT | Enable only | `SCAN_FAILED` | Warning banner + "Scan Again" button |
| Scan status is not COMPLETED or no `finished_at` | Enable only | `SCAN_NOT_FINISHED` | Warning banner |
| Scan has a non-null `error_code` | Enable only | `SCAN_HAS_ERRORS` | Warning banner + "Scan Again" button |
| Scan has no `scan_data` (empty object) | Enable only | `SCAN_INVALID_DATA` | Warning banner + "Scan Again" button |
| Scan is older than `SCAN_MAX_AGE_SECONDS` (default 300 s) | Enable only | `SCAN_TOO_OLD` | Warning banner + "Scan Again" button |
| None of the above | Disable | — | No scan_id required; toggle works immediately |

---

## Announcement Update Flow

Announcements can be updated **regardless of whether AP is enabled or disabled**.

### AP Disabled + Announcement Updated

```
User edits announcement → clicks Publish
    │
    ▼
POST /api/captivePortal/announcement  { content, network_id }
    │
    ├─ DB: deactivate old → insert new active announcement
    ├─ DB: update captive_portal.announcement_id FK
    │
    ├─ Build FULL portal payload from DB (announcements + tips + risk)
    │
    └─ POST /portal/patch → Pi stores content for later
    │
    ▼
Response: { ...announcement, pi_synced: true/false, pi_error: null/"..." }
```

- The Pi receives the **entire** portal payload so all content is current when AP is eventually enabled.
- If the Pi is offline, `pi_synced: false` is returned — the DB save still succeeds.
- The frontend shows: "Announcement saved but device sync failed: ..." if Pi sync fails.

### AP Enabled + Announcement Updated

```
User edits announcement → clicks Publish
    │
    ▼
POST /api/captivePortal/announcement  { content, network_id }
    │
    ├─ DB: deactivate old → insert new active announcement
    │
    └─ Send ONLY announcement portion to Pi
         { network_id: "<bssid> | <ssid>",
           patch: { portal_content: { announcements: { updated_at, announcement_text } } } }
    │
    ▼
Pi updates captive portal in real time
```

- Only the announcement section is sent — no need to resend tips/risk.

---

## AP Enable Error Classification

When the Pi responds to `orchestrate/apply` with `status: "ERROR"`, the backend classifies the `user_message` into a normalized error code. The frontend maps these to user-friendly prompts.

| Pi Response Pattern | Error Code | Category | Frontend Message | Retryable |
|---|---|---|---|---|
| `Incorrect Wi-Fi password` | `INCORRECT_PASSWORD` | auth | "Incorrect Wi-Fi password. Please check and try again." | Yes |
| `Password is required` | `PASSWORD_REQUIRED` | auth | "Password is required for this network." | Yes |
| `SSID cannot be found` | `SSID_NOT_FOUND` | not_found | "Network SSID could not be found." | No |
| `security type doesn't match` | `ENCRYPTION_MISMATCH` | outdated | "Network security type has changed. Run a new scan." | No (rescan) |
| `Refused to connect` + mismatched fields | `NETWORK_DATA_OUTDATED` | outdated | "Network details are outdated. Run a new scan." | No (rescan) |
| `matches the Pi's management network` | `PI_NETWORK_CONFLICT` | rejected | "Cannot connect — conflicts with Pi's management network." | No |
| `Busy:` / `wifi_ops_lock` | `DEVICE_BUSY` | busy | "Device is busy. Please wait and try again." | Yes |
| `Invalid payload` | `INVALID_PAYLOAD` | validation | "Details are incomplete. Please check your configuration." | No |
| `Exception:` | `DEVICE_EXCEPTION` | internal | "An internal device error occurred. Please try again." | Yes |
| `Uplink disconnected` | `UPLINK_DISCONNECTED` | connection | "Uplink disconnected. Access point is off." | Yes |
| `Couldn't connect` | `CONNECTION_FAILED` | connection | "Couldn't connect to the uplink network." | Yes |
| Any other `status: "ERROR"` | `ORCHESTRATE_ERROR` | unknown | "An unexpected device error occurred." | No |

**Success states** (e.g. `Uplink connected to '<ssid>'. Access point is ON.`) have `status: "OK"` and are **not** processed by the error classifier — the guard clause returns `null` for non-ERROR status.

---

## AP Apply Lock & TTL

The backend uses an **atomic concurrency lock** (`ap_apply_in_progress`) to prevent duplicate enable/disable operations. Lock acquisition uses a single atomic `UPDATE ... WHERE ap_apply_in_progress = false` to avoid races.

### Stale Lock Auto-Release

If lock acquisition fails, the backend checks whether the existing lock is stale:

```
Lock acquisition fails (ap_apply_in_progress already true)
    │
    ├─ ap_apply_locked_at exists AND is older than AP_LOCK_TTL_SECONDS?
    │     ├─ Yes → force-release stale lock, re-acquire, log warning, continue
    │     └─ No  → return 409 REQUEST_IN_PROGRESS
    │
    └─ Network row doesn't exist → return 404 NETWORK_NOT_FOUND
```

Lock acquisition stamps `ap_apply_locked_at = now()` so every subsequent request can detect staleness.

`releaseApLock()` always runs in the `finally` block and clears both `ap_apply_in_progress = false` **and** `ap_apply_locked_at = null`. It logs but never throws.

### Schema

The `ap_apply_locked_at timestamptz` column was added in migration `002_ap_lock_ttl.sql`.

---

## Timeout Reconciliation

The Pi's `orchestrate/apply` can take 30–60+ seconds. The nginx proxy timeout for this endpoint is **45 seconds**, and `piFetch`'s own timeout is **60 seconds**. Either layer can cut the frontend connection before the Pi responds — even when the AP operation **actually succeeds**.

### Solution: Three-layer reconciliation

**Layer 1 — Backend (immediate):**
When `piFetch` to `orchestrate/apply` fails with 502/503/504, the catch block polls `GET /device/status` on the Pi (8 s timeout):

```
piFetch('/orchestrate/apply') → timeout/502/503/504
    │
    ▼
piFetch('/device/status', { timeoutMs: 8000 })
    │
    ├─ Pi reachable → read ap_enabled → UPDATE networks (ap_enabled + ap_last_applied_at)
    │                                → return 200 { reconciled: true, ap_enabled }
    │
    └─ Pi also unreachable → fall through to normal error response { timeout: true }
```

**Layer 2 — Frontend `reconciled: true` handling:**
If the backend reconciles before the proxy kills the connection, the frontend receives `{ ok: true, reconciled: true, ap_enabled }`. `fetchAdminState()` is called immediately and UI syncs.

**Layer 3 — Frontend bounded reconciliation polling (settlement gate):**
If 502/503/504 reaches the frontend raw, `waitForAdminStateSettlement(targetApEnabled)` is called:

```
Axios catches 502/503/504
    │
    ├─ setIsReconcilingToggle(true)
    ├─ Show "The device is taking longer than expected. Checking actual access point state…"
    ├─ Suspend normal 12 s polling
    │
    ├─ Poll schedule: 3 s, 10 s, 20 s, 35 s, 50 s, 60 s
    │     ├─ ap_apply_in_progress === false → settled
    │     │     ├─ ap_enabled matches target → success ✓
    │     │     └─ ap_enabled doesn't match → "did not finish enabling/disabling"
    │     └─ ap_apply_in_progress === true → still not settled, continue
    │
    └─ Last poll + still in progress → "The device may still be processing…"
    │
    └─ setIsReconcilingToggle(false) → resume normal polling
```

Classified errors (INCORRECT_PASSWORD, SSID_NOT_FOUND, etc.) are **never** reconciled — only 502/503/504 transport errors trigger this path.

---

## Terms & Conditions — Removed

Terms & Conditions have been **fully removed** from the system (not just hidden from the UI):

| Layer | What was removed |
|---|---|
| Frontend page | Tab switcher, terms state, terms draft/publish logic |
| Frontend API | `getTerms()`, `getTermsHistory()`, `publishTerms()` |
| Backend routes | `GET /terms`, `GET /terms/history`, `POST /terms` |
| Backend controller | `getTerms`, `getTermsHistory`, `publishTerms` functions + exports |
| Backend seed | `seedDefaultContent()` no longer inserts a `terms_conditions` row |
| Pi payload | `buildPortalPayloadFromDB()` no longer includes `patch.portal_content.terms` |
| Route validation | `VALID_UPDATE_TYPES`, `ALLOWED_PAYLOAD_KEYS`, `KEYS_BY_UPDATE_TYPE` no longer include `terms` |

The `terms_conditions` DB table still exists but is no longer read from or written to.

> **Note:** The static `buildPortalPatchPayload()` in `scanValidation.js` still includes a `terms` key for backward-compatibility shape purposes. The live `buildPortalPayloadFromDB()` in `captivePortalController.js` — which actually sends content to the Pi — does **not** include terms.

---

## DB Schema Additions

Columns added to the `networks` table:

```sql
ALTER TABLE networks ADD COLUMN ap_enabled                 boolean     NOT NULL DEFAULT false;
ALTER TABLE networks ADD COLUMN ap_apply_in_progress       boolean     NOT NULL DEFAULT false;
ALTER TABLE networks ADD COLUMN ap_apply_locked_at         timestamptz          DEFAULT NULL;  -- migration 002
ALTER TABLE networks ADD COLUMN ap_last_applied_at         timestamptz          DEFAULT NULL;
ALTER TABLE networks ADD COLUMN portal_initialized         boolean     NOT NULL DEFAULT false;
ALTER TABLE networks ADD COLUMN portal_last_patched_at     timestamptz          DEFAULT NULL;
ALTER TABLE networks ADD COLUMN portal_last_patched_version integer              DEFAULT 0;
ALTER TABLE networks ADD COLUMN risk_score                 integer     NOT NULL DEFAULT 0;
ALTER TABLE networks ADD COLUMN risk_bucket                text        NOT NULL DEFAULT 'LOW';
ALTER TABLE networks ADD COLUMN risk_score_version         integer     NOT NULL DEFAULT 0;
ALTER TABLE networks ADD COLUMN last_scan_id               uuid                 DEFAULT NULL;
ALTER TABLE networks ADD COLUMN last_scan_finished_at      timestamptz          DEFAULT NULL;
ALTER TABLE networks ADD COLUMN last_threat_at             timestamptz          DEFAULT NULL;
```

---

## Files Changed

### Backend

#### `backend/routes/deviceMgmtRoutes.js`
- `classifyOrchestrateError()` — Maps Pi `user_message` to error codes
- `httpError()` — Typed error helper for structured catch handling
- `logFastApiCall()` — Debug logging for every FastAPI call + response
- `releaseApLock()` — Clears `ap_apply_in_progress = false` and `ap_apply_locked_at = null`
- **AP lock TTL** (C11 fix) — On acquisition failure, checks `ap_apply_locked_at` against `AP_LOCK_TTL_SECONDS`; auto-releases stale locks
- `VALID_UPDATE_TYPES` — `announcement`, `tips`, `risk`, `active`, `bulk` (no `terms`)
- `ALLOWED_PAYLOAD_KEYS` — `announcement`, `tips`, `risk`, `is_active`
- `KEYS_BY_UPDATE_TYPE` — Per-type allowlists; `is_active` is always optional on any type
- **`GET /api/device/ap-state/:networkId`** — Returns `{ ap_enabled, portal_initialized }`
- **`GET /api/device/network/:networkId/state`** — Full admin state (AP, lock, scan, portal, risk, flags)
- **`POST /api/device/enable-ap`** — Secure AP toggle:
  - Backend loads SSID/BSSID/channel/encryption from DB (never from frontend)
  - Enable: validates scan_id (6 checks), network config, AP password; seeds portal on first enable
  - **Step 10: Post-enable portal patch** — runs on **every** enable (not just first init)
  - Disable: no scan validation needed
  - Stamps `ap_last_applied_at` on every successful apply
  - `piFetch` timeout: **60 s** for `orchestrate/apply`
  - Timeout reconciliation via `/device/status` polling
- **`POST /api/device/portal/update`** — Client-driven portal partial update (announcement, tips, risk, active, bulk); `AP_NOT_ENABLED` guard; risk debounce; version-safe stamping
- **`POST /api/device/scan-completed`** — Webhook for scan runner. **Fail-closed**: returns 503 if `SCAN_RUNNER_TOKEN` is not configured

#### `backend/utils/riskPipeline.js`
- `bucketize(score)` — `0 → LOW`, `1–39 → LOW`, `40–69 → MEDIUM`, `70–89 → HIGH`, `90–100 → CRITICAL`
- `deriveBucketFromScanData(scanData)`, `deriveBucketFromThreats(threatRows)`
- `updateNetworkRisk(networkId, opts)` — Core risk update + auto-portal patch on bucket change
- `autoPortalRiskPatch()` — Cooldown + version-safe stamping
- `onScanCompleted(scanId, req)`, `onThreatEvent(networkId, threatRows, req)`

#### `backend/utils/scanValidation.js`
- `validateScan()` — 6 ordered checks
- `validateNetworkConfig()`, `validateApPassword()`
- `buildPortalPatchPayload()` — Static default payload builder

#### `backend/controllers/captivePortalController.js`
- `seedDefaultContent(networkId)` — Idempotent; creates announcement, captive_portal FK, tips; no terms
- `buildPortalPayloadFromDB(networkId, bssid, ssid)` — Reads `risk_score` from `scans` table, looks up `risk_classification`, builds `{ announcements, tips, security }` (no terms)
- `lookupRiskClassification(score)` — Queries `risk_classification` table; hardcoded fallback tiers
- `publishAnnouncement()` — AP-aware sync: full payload when AP off, announcement-only when AP on

#### `backend/controllers/rasPiController.js` — `saveNetworkMetadataScan()`
- Network update now includes `ssid` and `channel` (previously missing, causing stale values after re-scan)
- Dual-writes to both `scans` (legacy) and `vulnerability_scans` (UUID PK, used by AP enable + risk pipeline). The `vulnerability_scans` write is non-fatal.

#### `backend/utils/piFetch.js`
- Centralized Pi FastAPI caller with HMAC signing via `CONTROL_SIGNING_SECRET`
- Default timeout: **10 s** (overridden to 60 s for `orchestrate/apply`)
- Base URL: `PI_BASE_URL` → `FASTAPI_BASE_URL` → `http://127.0.0.1:8000`
- Production: signing always required. Dev: bypass with `PI_SIGNING_OPTIONAL=true`

### Frontend

#### `src/context/NetworkContext.jsx`
- Backed by `useSessionState("wf:networkScan", ...)` — survives refresh, clears on tab close
- `setNetworkId(newId)` auto-resets `scanId` to `null` when network changes

#### `src/hooks/useSessionState.js`
- `useSessionState(key, initialValue)` — syncs to sessionStorage with versioned envelope
- `clearSessionState()` — wipes all `wf:*` keys (called on logout)

#### `src/api/deviceApi.js`
- `toggleAP(payload)` → `POST /device/enable-ap`
- `getApState(networkId)` → `GET /device/ap-state/:networkId`
- `getNetworkConfig(networkId)` → `GET /rasPi/networks/:id`
- `getNetworkState(networkId)` → `GET /device/network/:networkId/state`
- `updatePortal(networkId, updateType, payload, reason)` → `POST /device/portal/update`
- `publishAnnouncement(content, networkId)` → `POST /captivePortal/announcement`

#### `src/hooks/useDevice.js`
- Accepts `(networkId, scanId)`
- Polls admin state every **12 s** when AP is enabled; suspended during reconciliation
- Reconciliation timers tracked in `reconcilingTimersRef`; cleaned up on unmount via `mountedRef`
- `handleUpdatePortal()` calls `updatePortal(networkId, 'risk', { risk: { bucket } }, 'manual_update')`
- `waitForAdminStateSettlement(targetApEnabled)` — 6-poll bounded reconciliation (3 s / 10 s / 20 s / 35 s / 50 s / 60 s)
- Maps all backend error codes to `scanError` (scan-related) or `error` (user message)

#### `src/components/device/AccessPointPanel.jsx`
- `computeBanner()` — strict priority chain, exactly one banner at a time
- Toggle disabled while loading, during `ap_apply_in_progress`, during `isReconcilingToggle`, or when enabling without a scan ID
- `scanErrorText` map includes `ENCRYPTION_MISMATCH` and `NETWORK_DATA_OUTDATED`
- Risk badge from `adminState.risk_state.risk_bucket`

#### `src/pages/DeviceManagement/DeviceManagement.jsx`
- Context-first, URL-param fallback for `networkId` + `scanId`
- Announcement-only editor (no tabs, no terms)
- Publishes via `publishAnnouncement()`, shows `pi_synced`/`pi_error` warning
- Retry calls both `refetch()` and `refetchState()`

#### `src/pages/SAM/SAM.jsx`
- Calls `setNetworkScan(networkId, scanId)` after successful scan save

#### `src/layouts/Sidebar.jsx`
- Appends `?network_id=<id>&scan_id=<id>` to Device Management link when context has values

---

## AP Enable/Disable Flow

### Enable (with scan validation)

```
User clicks toggle ON
    │
    ▼
POST /api/device/enable-ap  { network_id, scan_id, ap_status: "enable", ap_password? }
    │
    ▼
Step 0: Atomic lock (ap_apply_in_progress=true, ap_apply_locked_at=now)
  → 409 REQUEST_IN_PROGRESS (or stale lock auto-release if TTL exceeded)
  → 404 NETWORK_NOT_FOUND if network doesn't exist
    │
Step 1–3: scan_id required → load vulnerability_scans → validateScan() (6 checks)
Step 4–5: Load network config from DB → validateNetworkConfig()
Step 6:   validateApPassword() → 400 AP_PASSWORD_REQUIRED / AP_PASSWORD_WEAK
    │
Step 7: If !portal_initialized:
  → seedDefaultContent() → buildPortalPayloadFromDB() → POST /portal/patch
  → Re-read risk_score_version → UPDATE: portal_initialized=true, portal_last_patched_version, portal_last_patched_at
    │
Step 8: POST /orchestrate/apply [timeoutMs: 60 s]
  ├─ HTTP error → 502 FASTAPI_APPLY_FAILED
  ├─ status:"ERROR" → classifyOrchestrateError() → 422 (ap_enabled NOT set)
  └─ Success ↓
    │
Step 9: UPDATE networks SET ap_enabled=true, ap_last_applied_at, last_scan_id, last_scan_finished_at
    │
Step 10: POST /portal/patch (post-enable, non-fatal) ← EVERY enable, not just first
  → buildPortalPayloadFromDB() → Pi receives latest announcements + tips + risk
  → On success: UPDATE portal_last_patched_at
    │
Audit: AP_ENABLE_REQUEST SUCCESS
Return: { ok:true, ap_enabled:true, portal_initialized:true, portal_patched:true/false }
    │
catch (502/503/504):
  piFetch('/device/status', 8 s)
  ├─ Pi reachable → UPDATE ap_enabled to match Pi → return { reconciled:true }
  └─ Pi unreachable → return { error:'AP_TOGGLE_FAILED', timeout:true }
    │
finally: releaseApLock()
```

### Disable (no scan required)

```
POST /api/device/enable-ap  { network_id, ap_status: "disable" }
    │
Step 0: Atomic lock (same TTL logic)
    │
Load network config → validateNetworkConfig()
    │
POST /orchestrate/apply [timeoutMs: 60 s]
  ├─ status:"ERROR" → classifyOrchestrateError() → 422
  ├─ Success → UPDATE ap_enabled=false, ap_last_applied_at
  └─ Timeout → reconcile via /device/status (same as enable)
    │
finally: releaseApLock()
```

---

## Banner Priority (AccessPointPanel)

`computeBanner()` enforces strict mutual exclusion — exactly **one** banner renders at a time.

| Priority | Banner Key | Condition | Type |
|---|---|---|---|
| 1 | `config_missing` | `network_config_missing` (from `flags`) | Blocking |
| 2 | `apply_in_progress` | `ap_apply_in_progress && !isReconcilingToggle && !hasError` | Blocking + disable controls |
| 3 | `toggle_reconciling_timeout` | `isReconcilingToggle` | Info |
| 4 | `scan_error` | `scanError` (excluding `SCAN_REQUIRED`) | Blocking |
| 5 | `scan_required` | AP off + no scan | Blocking |
| 6 | `scan_stale_blocking` | AP off + has scan + not fresh | Blocking |
| 7 | `portal_outdated` | AP on + `portal_out_of_date` | Warning + Update Portal button |
| 8 | `scan_stale_info` | AP on + has scan + not fresh | Info |

---

## Admin State Response Shape

`GET /api/device/network/:networkId/state`:

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

Key server-side derivations:
- `scan_fresh` = `has_scan && (Date.now() − finished_at_ms) ≤ SCAN_MAX_AGE_SECONDS × 1000`
- `portal_out_of_date` = `ap_enabled && portal_last_patched_version < risk_score_version`
- `network_config_missing` = any of `ssid` / `bssid` / `channel` is falsy

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SCAN_MAX_AGE_SECONDS` | `300` | Max scan age (seconds) before AP enable is blocked |
| `AP_LOCK_TTL_SECONDS` | `120` | AP apply lock TTL — stale locks older than this are auto-released |
| `PI_BASE_URL` | `http://127.0.0.1:8000` | Pi FastAPI base URL (`FASTAPI_BASE_URL` accepted as fallback) |
| `CONTROL_SIGNING_SECRET` | `''` | HMAC signing secret for all Express → Pi requests |
| `PI_SIGNING_OPTIONAL` | `false` | Set `true` in dev to skip signing when no secret is configured |
| `SCAN_RUNNER_TOKEN` | `''` | Shared secret for `/scan-completed` webhook — returns 503 if unset |
| `PORTAL_PATCH_COOLDOWN_MS` | `15000` | Min ms between auto risk portal patches |
