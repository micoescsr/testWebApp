# Device Management – Access Point & Captive Portal

## Overview

The Device Management page lets an authenticated user **enable/disable a captive portal AP** on a scanned network and **update the captive portal announcement**. The **backend is the sole source of truth** — it loads all network config (SSID, BSSID, channel, encryption) from Supabase, validates scan freshness, seeds the captive portal on first enable, and persists AP + portal state in the DB.

**Key behaviors:**
- The page shows a single announcement editor (no tabs) — Terms & Conditions have been fully removed.
- Announcement updates always sync to the Raspberry Pi via `portal/patch`, regardless of AP state.
- When AP is **disabled**: the full portal payload (announcement + tips + risk) is sent so the Pi has the latest content ready for when AP is enabled.
- When AP is **enabled**: only the announcement portion is sent for real-time update.
- AP enable/disable errors from the Pi are classified into normalized error codes for clear user prompts.
- Gateway timeouts (502/503/504) trigger **automatic reconciliation** — the backend polls the Pi's actual state and the frontend self-corrects via delayed polling.

---

## Architecture

```
SAM (scan) ──► NetworkContext (in-memory: networkId + scanId)
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

**Solution:** Replaced with a **React Context** (`NetworkContext`) that holds both `networkId` and `scanId` **in memory only**.

| Layer | What happens |
|---|---|
| `NetworkContext.jsx` | Creates a React context with `{ networkId, scanId, setNetworkScan }` stored via `useState` (memory only) |
| `App.jsx` | Wraps the entire app in `<NetworkProvider>` |
| `SAM.jsx` | After a successful scan + save, calls `setNetworkScan(networkId, scanId)` |
| `Sidebar.jsx` | Dynamically appends `?network_id=<id>&scan_id=<id>` to the Device Management link |
| `DeviceManagement.jsx` | Reads from context first, falls back to URL search params (for direct links / page refresh) |

---

## Scan Validation

The backend validates scans before enabling the AP:

| Check | When | Backend Error Code | UI Behaviour |
|---|---|---|---|
| `scan_id` is present | Enable only | `SCAN_REQUIRED` | Toggle disabled + "Scan required" banner with link to SAM |
| Scan is not older than `SCAN_MAX_AGE_SECONDS` (default 300s, env-configurable) | Enable only | `SCAN_TOO_OLD` | Warning banner + "Scan Again" button |
| Scan's `network_id` matches the requested `network_id` | Enable only | `SCAN_NETWORK_MISMATCH` | Warning banner + "Scan Again" button |
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

## Timeout Reconciliation

The Pi's `orchestrate/apply` can take 30–60+ seconds. The nginx proxy timeout for this endpoint is **45 seconds**, and `piFetch`'s own timeout is **60 seconds**. Either layer can cut the frontend connection before the Pi responds — even when the AP operation **actually succeeds**.

A timeout is **ambiguous**: it does not prove success or failure.

### Problem

Without reconciliation:
1. Proxy kills the connection → frontend receives 502/504
2. `ap_enabled` may or may not have been set in DB (backend may still be running)
3. Frontend reverts toggle to OFF → shows hard failure message
4. AP may actually be ON on the Pi → user can't disable it because DB says OFF

### Solution: Three-layer reconciliation

**Layer 1 — Backend (immediate):**
When `piFetch` to `orchestrate/apply` fails with 502/503/504, the backend's catch block polls `GET /device/status` on the Pi (8s timeout). If the Pi responds:
- Updates `ap_enabled` in DB to match the Pi's actual state
- Returns `200 { ok: true, reconciled: true, ap_enabled: <actual> }` instead of an error

```
piFetch('/orchestrate/apply') → timeout/502/503/504
    │
    ▼
piFetch('/device/status', { timeoutMs: 8000 })
    │
    ├─ Pi reachable → read ap_enabled → UPDATE networks → return 200 { reconciled: true }
    │
    └─ Pi also unreachable → fall through to normal error response
```

**Layer 2 — Frontend `reconciled: true` handling:**
If the backend successfully reconciles before the proxy kills the connection, the frontend receives `{ ok: true, reconciled: true, ap_enabled }`. This is trusted immediately — `fetchAdminState()` is called and UI syncs to backend truth.

**Layer 3 — Frontend bounded reconciliation polling (settlement gate):**
If the error reaches the frontend as 502/503/504 (proxy killed the connection before the backend could respond), the frontend enters **bounded reconciliation mode** using `ap_apply_in_progress` as the settlement gate.

Key principle: while `ap_apply_in_progress === true`, the backend has not settled — `ap_enabled` cannot be trusted. Only when `ap_apply_in_progress === false` can the frontend interpret `ap_enabled` as final truth.

```
Axios catches 502/503/504
    │
    ├─ setIsReconcilingToggle(true)
    ├─ Show banner: "The device is taking longer than expected. Checking actual access point state…"
    ├─ Suspend normal 12s polling (no race conditions)
    │
    ├─ Bounded reconciliation polling schedule: 3s, 10s, 20s, 35s, 50s, 60s
    │     │
    │     ├─ Each poll: GET /device/network/:id/state
    │     │     ├─ ap_apply_in_progress === false (settled)
    │     │     │     ├─ ap_enabled matches target → clear error ✓
    │     │     │     └─ ap_enabled doesn't match → "did not finish enabling/disabling"
    │     │     └─ ap_apply_in_progress === true → keep waiting (not settled)
    │     │
    │     └─ Last poll + still not settled → soft unresolved message
    │
    └─ setIsReconcilingToggle(false) → resume normal polling
```

**Settlement rules:**

| Attempted | Settled `ap_enabled` | Result |
|---|---|---|
| enable | `true` | Eventual success |
| enable | `false` | Settled unsuccessful enable |
| disable | `false` | Eventual success |
| disable | `true` | Settled unsuccessful disable |

**Unresolved:** If the bounded window expires and `ap_apply_in_progress` is still `true`, the frontend stops polling, preserves the latest backend-derived UI state, and shows: *"The device may still be processing the request. Please wait a moment, then refresh or try again."*

### Why 60 seconds?

- nginx proxy timeout: **45 seconds** — this is when the frontend receives 502/504
- Backend `piFetch` timeout: **60 seconds** — backend may still be running for ~15s after the frontend gets the timeout
- Backend's own `/device/status` reconciliation adds a few more seconds
- The **60-second reconciliation window** (6 polls at 3s, 10s, 20s, 35s, 50s, 60s) covers the full backend processing pipeline with margin

### Classified errors are never reconciled

Application-level backend errors (INCORRECT_PASSWORD, SSID_NOT_FOUND, DEVICE_BUSY, etc.) are **not** ambiguous — they are real outcomes. These continue to show immediate specific feedback without entering reconciliation mode. Only 502/503/504 transport errors trigger the reconciliation path.

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
| Patch validator | `validatePatchPayload()` terms shape block removed |

The `terms_conditions` DB table still exists but is no longer read from or written to.

---

## DB Schema Additions

Two columns on the `networks` table:

```sql
ALTER TABLE networks ADD COLUMN portal_initialized boolean NOT NULL DEFAULT false;
ALTER TABLE networks ADD COLUMN ap_enabled boolean NOT NULL DEFAULT false;
```

These make AP state and portal initialization persistent across page reloads and server restarts.

---

## Files Changed

### Backend

#### `backend/controllers/captivePortalController.js`
- `seedDefaultContent()` — Creates default portal rows (announcements, tips) on first enable. No longer seeds terms.
- `buildPortalPayloadFromDB()` — Builds full Pi payload: `{ announcements, tips, security }`. No `terms` key.
- `publishAnnouncement()` — Saves new announcement to DB, then syncs to Pi:
  - AP disabled → sends full payload via `buildPortalPayloadFromDB()`
  - AP enabled → sends announcement-only partial payload
  - Returns `{ ...data, pi_synced, pi_error }`

#### `backend/routes/captivePortalRoutes.js`
- Removed `/terms` and `/terms/history` routes
- Remaining: `GET /announcement`, `GET /announcement/history`, `POST /announcement`

#### `backend/routes/deviceMgmtRoutes.js`
- `classifyOrchestrateError()` — Maps Pi `user_message` to error codes (see table above)
- `VALID_UPDATE_TYPES` / `ALLOWED_PAYLOAD_KEYS` / `KEYS_BY_UPDATE_TYPE` — No longer include `terms`
- `validatePatchPayload()` — Terms shape validation removed
- **`GET /api/device/ap-state/:networkId`** — Returns `{ ap_enabled, portal_initialized }` from `networks` table
- **`POST /api/device/enable-ap`** — Secure AP toggle:
  - Accepts only `{ network_id, scan_id?, ap_status, ap_password? }`
  - **Backend loads** SSID/BSSID/channel/encryption from Supabase (never from frontend)
  - On **enable**: validates scan_id exists, is fresh, matches network
  - If `portal_initialized` is false: calls `portal/patch` first, then `orchestrate/apply`
  - If portal already initialized: calls `orchestrate/apply` directly
  - Persists `ap_enabled` and `portal_initialized` in `networks` table
  - On **disable**: no scan validation; calls `orchestrate/apply` with `ap_status: "disable"`
  - `piFetch` timeout set to **60 seconds** for `orchestrate/apply` (both enable and disable)
  - **Timeout reconciliation**: on 502/503/504, polls `/device/status` on Pi and returns `{ reconciled: true, ap_enabled }` if reachable

### Frontend

#### `src/context/NetworkContext.jsx`
- In-memory React context for `{ networkId, scanId }`
- `setNetworkScan(nId, sId)` convenience method

#### `src/api/deviceApi.js`
- `toggleAP(payload)` → `POST /device/enable-ap` (sends only IDs + password)
- `getApState(networkId)` → `GET /device/ap-state/:networkId`
- `getNetworkConfig(networkId)` → `GET /rasPi/networks/:id` (display only)
- `patchPortal()` removed (portal seeding is now internal to backend)
- `getTerms()`, `getTermsHistory()`, `publishTerms()` removed

#### `src/hooks/useDevice.js`
- Accepts `(networkId, scanId)`
- Fetches AP state from DB on mount
- Toggle flow with optimistic UI + revert on classified failure
- Exposes `scanError`, `hasScanId`, and `isReconcilingToggle` for UI scan/timeout banners
- Handles scan codes: `SCAN_REQUIRED`, `SCAN_TOO_OLD`, `SCAN_NETWORK_MISMATCH`
- Handles AP enable error codes: `INCORRECT_PASSWORD`, `PASSWORD_REQUIRED`, `SSID_NOT_FOUND`, `ENCRYPTION_MISMATCH`, `NETWORK_DATA_OUTDATED`, `PI_NETWORK_CONFLICT`, `DEVICE_BUSY`, `DEVICE_EXCEPTION`, `INVALID_PAYLOAD`, `CONNECTION_FAILED`, `UPLINK_DISCONNECTED`, `ORCHESTRATE_ERROR`
- **Timeout reconciliation**: handles `reconciled: true` backend responses; on 502/503/504 gateway errors, enters bounded reconciliation mode using `ap_apply_in_progress` as the settlement gate (6 polls over 60s at 3s, 10s, 20s, 35s, 50s, 60s). Normal 12s polling is suspended during reconciliation. Timers are cleaned up on unmount via `mountedRef` guard.

#### `src/components/device/AccessPointPanel.jsx`
- Props: `scanError`, `hasScanId`, `isReconcilingToggle` (replaces `isEmpty`)
- Scan-required banner with "Go to Scan" navigation
- Scan-too-old and scan-mismatch warning banners
- Timeout reconciliation banner: *"The device is taking longer than expected. Checking actual access point state…"*
- Toggle disabled when loading, `ap_apply_in_progress`, `isReconcilingToggle`, or no scan available and AP is off
- `computeBanner()` priority: config_missing → apply_in_progress → toggle_reconciling_timeout → scan_error → scan_required → scan_stale_blocking → portal_outdated → scan_stale_info
- `scanErrorText` map includes `ENCRYPTION_MISMATCH` and `NETWORK_DATA_OUTDATED`

#### `src/pages/DeviceManagement/DeviceManagement.jsx`
- Reads `networkId` + `scanId` from context (priority) or URL params (fallback)
- Passes `scanId` to `useDevice(networkId, scanId)`
- Passes `scanError`, `hasScanId`, and `isReconcilingToggle` to `AccessPointPanel`
- Announcement-only editor (no tabs, no terms state)
- Publishes via `publishAnnouncement()` and shows `pi_synced`/`pi_error` warning if sync fails
- Retry button calls both `refetch()` (network config) and `refetchState()` (admin state from DB)

#### `src/pages/SAM/SAM.jsx`
- After scan save: calls `setNetworkScan(networkId, scanId)`

#### `src/layouts/Sidebar.jsx`
- Device Management link includes `?network_id=<id>&scan_id=<id>` when context has values

---

## AP Enable/Disable Flow

### Enable (with scan validation)

```
User clicks toggle ON (+ enters AP password for encrypted networks)
    │
    ▼
Frontend sends POST /api/device/enable-ap
  Body: { network_id, scan_id, ap_status: "enable", ap_password? }
    │
    ▼
Backend validates:
  1. scan_id exists in scans table
  2. scan is not older than SCAN_MAX_AGE_SECONDS
  3. scan.network_id matches request.network_id
    │
    ▼
Backend loads config from DB:
  SELECT ssid, bssid, channel, encryption_type FROM networks WHERE network_id = ?
    │
    ▼
If portal_initialized = false:
  → POST portal/patch (FastAPI) with default content
  → UPDATE networks SET portal_initialized = true
    │
    ▼
POST orchestrate/apply (FastAPI)  [timeoutMs: 60s]
  Body: { ssid, bssid, channel, encryption_type, ap_password?, ap_status: "enable" }
    │
    ├─ Success → UPDATE networks SET ap_enabled = true
    │
    └─ Timeout (502/503/504) → reconcile via GET /device/status
          ├─ Pi says AP ON  → UPDATE ap_enabled = true  → return { reconciled: true }
          └─ Pi unreachable → return error → frontend bounded reconciliation polling
                (6 polls over 60s using ap_apply_in_progress as settlement gate)
```

### Disable (no scan required)

```
User clicks toggle OFF
    │
    ▼
Frontend sends POST /api/device/enable-ap
  Body: { network_id, ap_status: "disable" }
    │
    ▼
Backend loads config from DB (needs SSID/BSSID for FastAPI)
    │
    ▼
POST orchestrate/apply (FastAPI)  [timeoutMs: 60s]
  Body: { ssid, bssid, channel, encryption_type, ap_status: "disable" }
    │
    ├─ Success → UPDATE networks SET ap_enabled = false
    │
    └─ Timeout (502/503/504) → reconcile via GET /device/status
          ├─ Pi says AP OFF → UPDATE ap_enabled = false → return { reconciled: true }
          └─ Pi unreachable → return error → frontend bounded reconciliation polling
                (6 polls over 60s using ap_apply_in_progress as settlement gate)
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SCAN_MAX_AGE_SECONDS` | `300` | Max age (seconds) of a scan before it's considered stale for AP enable |
| `FASTAPI_BASE` | `http://mothership-1.tail781e52.ts.net:8000` | Raspberry Pi FastAPI base URL |
