# Device Management – Access Point Panel

## Overview

The Access Point (AP) panel in Device Management lets an authenticated user **enable/disable a captive portal AP** on a scanned network. When the toggle is enabled, the app sends the network config (from the most recent scan) to the Raspberry Pi orchestrator via FastAPI. On the very first enable, it also seeds the captive portal with default content (announcements, terms, tips, security stub).

---

## Architecture

```
SAM (scan) ──► NetworkContext (in-memory) ──► DeviceManagement page
                                                    │
                                                    ├─ useDevice(networkId)
                                                    │      │
                                                    │      ├─ GET  /rasPi/networks/:id     → fetch network config from Supabase
                                                    │      ├─ POST /device/enable-ap        → proxy to orchestrate/apply
                                                    │      └─ POST /device/portal-patch     → proxy to portal/patch (first init only)
                                                    │
                                                    └─ AccessPointPanel (UI)
```

---

## Secure Network ID Transport

**Problem:** The previous implementation stored `network_id` in `localStorage`, which is insecure (accessible to any JS on the origin, persists across sessions, visible in dev tools).

**Solution:** Replaced with a **React Context** (`NetworkContext`) that holds the `network_id` **in memory only**.

| Layer | What happens |
|---|---|
| `NetworkContext.jsx` | Creates a React context with `{ networkId, setNetworkId }` stored via `useState` (memory only) |
| `App.jsx` | Wraps the entire app in `<NetworkProvider>` |
| `SAM.jsx` | After a successful scan + save, calls `setNetworkId(networkId)` instead of `localStorage.setItem(...)` |
| `Sidebar.jsx` | Dynamically appends `?network_id=<id>` to the Device Management link when a network is in context |
| `DeviceManagement.jsx` | Reads from context first, falls back to `?network_id=` URL search param (for direct links / page refresh) |

---

## Files Changed

### Backend

#### `backend/routes/deviceMgmtRoutes.js`
- **Fixed critical bug:** `module.exports = router` was placed *before* the `/enable-ap` route, so it was never registered.
- **`POST /api/device/enable-ap`** — Proxies to FastAPI `orchestrate/apply`
  - Upserts network row in Supabase
  - Forwards `{ ssid, bssid, channel, encryption_type, ap_password?, ap_status }` to FastAPI
  - `ap_status`: `"enable"` or `"disable"`
- **`POST /api/device/portal-patch`** (new) — Proxies to FastAPI `portal/patch`
  - Constructs `network_id` as `"BSSID | SSID"` (FastAPI format)
  - Sends hardcoded default `portal_content` (announcements, terms, tips) + security stub
  - Called only on **first AP enable** per session

### Frontend

#### `src/context/NetworkContext.jsx` (new)
- In-memory React context for `networkId`
- Replaces `localStorage` usage

#### `src/api/deviceApi.js`
- `toggleAP(payload)` → `POST /device/enable-ap`
- `patchPortal(payload)` → `POST /device/portal-patch`
- `getNetworkConfig(networkId)` → `GET /rasPi/networks/:id`
- Fixed `getTerms` and `publishTerms` to pass `networkId`

#### `src/hooks/useDevice.js`
- Now accepts `networkId` parameter
- Owns network config fetching from Supabase (`GET /rasPi/networks/:id`)
- Toggle flow:
  1. **Enable** → calls `orchestrate/apply` (enable) + `portal/patch` (first time only)
  2. **Disable** → calls `orchestrate/apply` (disable)
- Tracks `portalInitialized` to avoid re-patching portal content
- Resets AP state when `networkId` changes (new scan)

#### `src/components/device/AccessPointPanel.jsx`
- Validates AP password internally before calling `onToggle(apPassword)`
- Displays network config (SSID, BSSID, channel, encryption) always visible
- Conditionally shows password input for encrypted networks

#### `src/pages/DeviceManagement/DeviceManagement.jsx`
- Reads `networkId` from context (priority) or `?network_id=` URL param (fallback)
- Delegates network config + AP toggle to `useDevice(networkId)`
- Removed all `localStorage` usage
- Shows guard message if no network is selected

#### `src/pages/SAM/SAM.jsx`
- After scan save: calls `setNetworkId(networkId)` via `useNetworkContext()`
- Removed `localStorage.setItem("lastNetworkId", ...)`

#### `src/layouts/Sidebar.jsx`
- Device Management link dynamically includes `?network_id=<id>` when context has a value

#### `src/App.jsx`
- Wraps app in `<NetworkProvider>`

---

## AP Enable/Disable Flow

### First-time Enable (after fresh scan)

```
User clicks toggle ON (+ enters AP password for encrypted networks)
    │
    ▼
POST /api/device/enable-ap
  Body: { network_id, ssid, bssid, channel, encryption_type, ap_password, ap_status: "enable" }
    │
    ├─ Upsert network in Supabase
    └─ Forward to FastAPI → POST orchestrate/apply
         Body: { ssid, bssid, channel, encryption_type, ap_password, ap_status: "enable" }
    │
    ▼
POST /api/device/portal-patch  (first enable only)
  Body: { network_id, bssid, ssid }
    │
    └─ Forward to FastAPI → POST portal/patch
         Body: {
           network_id: "BSSID | SSID",
           patch: {
             portal_content: { announcements, terms, tips },
             security: { score: 0, risk_level: "NOT YET ASSESSED" }
           }
         }
```

### Disable

```
User clicks toggle OFF
    │
    ▼
POST /api/device/enable-ap
  Body: { ..., ap_status: "disable" }
    │
    └─ Forward to FastAPI → POST orchestrate/apply
         Body: { ..., ap_status: "disable" }
```

### Update AP Details (after new scan)

1. Disable toggle → sends `ap_status: "disable"` to `orchestrate/apply`
2. New scan runs in SAM → updates `networkId` in context → `useDevice` refetches config
3. Enable toggle → sends updated config with `ap_status: "enable"` to `orchestrate/apply`

---

## Example Payloads

### orchestrate/apply (enable)
```json
{
  "ssid": "DMSCVG 2.4G",
  "bssid": "30:40:74:8E:8D:2A",
  "channel": 4,
  "encryption_type": "WPA2 WPA2-PSK AES-CCMP",
  "ap_password": "#Dns1125",
  "ap_status": "enable"
}
```

### orchestrate/apply (disable)
```json
{
  "ssid": "DMSCVG 2.4G",
  "bssid": "30:40:74:8E:8D:2A",
  "channel": 4,
  "encryption_type": "WPA2 WPA2-PSK AES-CCMP",
  "ap_status": "disable"
}
```

### portal/patch (first initialization)
```json
{
  "network_id": "30:40:74:8E:8D:2A | DMSCVG 2.4G",
  "patch": {
    "portal_content": {
      "announcements": {
        "updated_at": 1760785000,
        "announcement_text": "Welcome to this secured network. Stay safe online."
      },
      "terms": {
        "version": "2026-02-24",
        "updated_at": 1760785000,
        "text": "By connecting to this network, you agree to our terms of service and acceptable use policy."
      },
      "tips": {
        "updated_at": 1760785000,
        "items": [
          "Use a VPN when possible.",
          "Avoid banking on public Wi-Fi.",
          "Keep your device software up to date."
        ]
      }
    },
    "security": {
      "score": 0,
      "risk_level": "NOT YET ASSESSED",
      "updated_at": 1760785000
    }
  }
}
```
