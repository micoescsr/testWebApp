# Device Management – Access Point & Captive Portal

## Overview

The Device Management page lets an authenticated user **enable/disable a captive portal AP** on a scanned network and **update the captive portal announcement**. The **backend is the sole source of truth** — it loads all network config (SSID, BSSID, channel, encryption) from Supabase, validates scan freshness, seeds the captive portal on first enable, and persists AP + portal state in the DB.

**Key behaviors:**
- The page shows a single announcement editor (no tabs) — Terms & Conditions have been fully removed.
- Announcement updates always sync to the Raspberry Pi via `portal/patch`, regardless of AP state.
- When AP is **disabled**: the full portal payload (announcement + tips + risk) is sent so the Pi has the latest content ready for when AP is enabled.
- When AP is **enabled**: only the announcement portion is sent for real-time update.
- AP enable/disable errors from the Pi are classified into normalized error codes for clear user prompts.

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
- Toggle flow with optimistic UI + revert on failure
- Exposes `scanError` and `hasScanId` for UI scan-validation banners
- Handles scan codes: `SCAN_REQUIRED`, `SCAN_TOO_OLD`, `SCAN_NETWORK_MISMATCH`
- Handles AP enable error codes: `INCORRECT_PASSWORD`, `PASSWORD_REQUIRED`, `SSID_NOT_FOUND`, `ENCRYPTION_MISMATCH`, `NETWORK_DATA_OUTDATED`, `PI_NETWORK_CONFLICT`, `DEVICE_BUSY`, `DEVICE_EXCEPTION`, `INVALID_PAYLOAD`, `CONNECTION_FAILED`, `UPLINK_DISCONNECTED`, `ORCHESTRATE_ERROR`

#### `src/components/device/AccessPointPanel.jsx`
- New props: `scanError`, `hasScanId` (replaces `isEmpty`)
- Scan-required banner with "Go to Scan" navigation
- Scan-too-old and scan-mismatch warning banners
- Toggle disabled when no scan available and AP is off
- `scanErrorText` map includes `ENCRYPTION_MISMATCH` and `NETWORK_DATA_OUTDATED`

#### `src/pages/DeviceManagement/DeviceManagement.jsx`
- Reads `networkId` + `scanId` from context (priority) or URL params (fallback)
- Passes `scanId` to `useDevice(networkId, scanId)`
- Passes `scanError` + `hasScanId` to `AccessPointPanel`
- Announcement-only editor (no tabs, no terms state)
- Publishes via `publishAnnouncement()` and shows `pi_synced`/`pi_error` warning if sync fails

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
POST orchestrate/apply (FastAPI)
  Body: { ssid, bssid, channel, encryption_type, ap_password?, ap_status: "enable" }
    │
    ▼
UPDATE networks SET ap_enabled = true
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
POST orchestrate/apply (FastAPI)
  Body: { ssid, bssid, channel, encryption_type, ap_status: "disable" }
    │
    ▼
UPDATE networks SET ap_enabled = false
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SCAN_MAX_AGE_SECONDS` | `300` | Max age (seconds) of a scan before it's considered stale for AP enable |
| `FASTAPI_BASE` | `http://mothership-1.tail781e52.ts.net:8000` | Raspberry Pi FastAPI base URL |
