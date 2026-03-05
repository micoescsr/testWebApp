# Device Management – Access Point Panel

## Overview

The Access Point (AP) panel in Device Management lets an authenticated user **enable/disable a captive portal AP** on a scanned network. The **backend is the sole source of truth** — it loads all network config (SSID, BSSID, channel, encryption) from Supabase, validates scan freshness, seeds the captive portal on first enable, and persists AP + portal state in the DB.

---

## Architecture

```
SAM (scan) ──► NetworkContext (in-memory: networkId + scanId)
                  │
                  ▼
              DeviceManagement page
                  │
                  ├─ useDevice(networkId, scanId)
                  │      │
                  │      ├─ GET  /device/ap-state/:networkId  → { ap_enabled, portal_initialized }
                  │      ├─ GET  /rasPi/networks/:id          → { ssid, bssid, channel, encryption_type }
                  │      └─ POST /device/enable-ap             → backend validates scan, loads config,
                  │                                               calls portal/patch + orchestrate/apply
                  │
                  └─ AccessPointPanel (UI: toggle + scan validation banners)
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

## DB Schema Additions

Two new columns on the `networks` table (run in Supabase SQL editor):

```sql
ALTER TABLE networks ADD COLUMN portal_initialized boolean NOT NULL DEFAULT false;
ALTER TABLE networks ADD COLUMN ap_enabled boolean NOT NULL DEFAULT false;
```

These make AP state and portal initialization persistent across page reloads and server restarts.

---

## Files Changed

### Backend

#### `backend/routes/deviceMgmtRoutes.js`
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

#### `src/hooks/useDevice.js`
- Accepts `(networkId, scanId)`
- Fetches AP state from DB on mount
- Toggle flow with optimistic UI + revert on failure
- Exposes `scanError` and `hasScanId` for UI scan-validation banners
- Handles `SCAN_REQUIRED`, `SCAN_TOO_OLD`, `SCAN_NETWORK_MISMATCH` error codes

#### `src/components/device/AccessPointPanel.jsx`
- New props: `scanError`, `hasScanId` (replaces `isEmpty`)
- Scan-required banner with "Go to Scan" navigation
- Scan-too-old and scan-mismatch warning banners
- Toggle disabled when no scan available and AP is off

#### `src/pages/DeviceManagement/DeviceManagement.jsx`
- Reads `networkId` + `scanId` from context (priority) or URL params (fallback)
- Passes `scanId` to `useDevice(networkId, scanId)`
- Passes `scanError` + `hasScanId` to `AccessPointPanel`

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
| `PI_BASE_URL` | `https://mothership-1.tail781e52.ts.net` | Raspberry Pi Tailscale Funnel HTTPS URL (nginx :9000) |
| `CONTROL_SIGNING_SECRET` | *(shared with Pi)* | HMAC-SHA256 signing key — must match the Pi's value |

> **Note:** The old `FASTAPI_BASE` env var (port 8000, unsigned) has been replaced by `PI_BASE_URL` + `CONTROL_SIGNING_SECRET`. All Pi calls (`portal/patch`, `orchestrate/apply`) now go through `piFetch()` with HMAC-SHA256 signed headers. See `PI_SIGNING_README.md` for full details.
