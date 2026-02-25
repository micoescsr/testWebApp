# Session Persistence — Architecture & Policy

> **Scope:** Explains how the Why-PII? web app preserves UI state across page refreshes without compromising security.  
> **Last updated:** February 25, 2026

---

## Problem

Before this change, refreshing the browser reset all in-memory React state:

| What was lost | User impact |
|---|---|
| `networkId` + `scanId` | Device Management showed *"No network selected. Run a scan first"* even after completing a scan |
| Selected network in SAM | User had to re-select and re-scan |
| Vulnerability results | Table emptied despite valid data in the database |
| Active tab (SAM / Device Mgmt) | Always reset to the default tab |
| Threat detection status | Polling stopped silently with no indication |

---

## Solution: `sessionStorage` with Versioned Envelopes

### Why `sessionStorage` (not `localStorage`)

| Property | `sessionStorage` | `localStorage` |
|---|---|---|
| Lifetime | Tab close clears it | Persists indefinitely |
| Tab isolation | Each tab has its own store | Shared across all tabs |
| Disk persistence | Survives refresh, **not** browser restart | Survives everything |
| Cross-tab leakage | None | Yes |

**Policy decision:** Network IDs and scan IDs are not auth secrets, but they are operational context that should not persist beyond a session or leak across tabs. `sessionStorage` satisfies both constraints.

### What is NOT stored in `sessionStorage`

| Data | Storage method | Reason |
|---|---|---|
| Access token (JWT) | In-memory variable only | Secret — must not touch any persistent storage |
| Refresh token | HttpOnly cookie (server-set) | Secret — browser JS cannot read it |
| Full scan result payloads | Not persisted | Too large, goes stale quickly, hard to version |
| User profile / role | Fetched fresh on mount | Authoritative source is the backend |

---

## Storage Keys

All keys use the `wf:` prefix (short for "WiFi framework") to avoid collisions with other libraries.

| Key | Shape | Set by | Cleared by |
|---|---|---|---|
| `wf:networkScan` | `{ v: 1, value: { networkId, scanId } }` | `NetworkContext` after scan completes | Logout, session end |
| `wf:selectedNetwork` | `{ v: 1, value: { bssid, ssid, channel, persistedAt } }` | SAM page on network selection | Logout, session end |
| `wf:lastScannedNetwork` | `{ v: 1, value: { bssid, ssid, channel, persistedAt } }` | SAM page after scan completes | Logout, session end |
| `wf:samTab` | `{ v: 1, value: "vulnerabilities" }` | SAM page on tab change | Logout, session end |
| `wf:dmTab` | `{ v: 1, value: "announcement" }` | Device Management on tab change | Logout, session end |

### Versioned envelope format

Every value is wrapped:

```json
{ "v": 1, "value": <actual_data> }
```

This allows future schema migrations. If the app reads an envelope with an unexpected version or corrupted JSON, it falls back to the initial default and overwrites the bad data.

---

## Files Changed

### New file

| File | Purpose |
|---|---|
| `src/hooks/useSessionState.js` | Drop-in `useState` replacement that syncs with `sessionStorage`. Exports `clearSessionState()` to wipe all `wf:*` keys on logout. |

### Modified files

| File | What changed |
|---|---|
| `src/context/NetworkContext.jsx` | `useState` → `useSessionState` with a single atomic key (`wf:networkScan`). `setNetworkId` auto-resets `scanId` when the network changes (prevents ID mismatch). Added `clearNetworkScan()`. |
| `src/layouts/Sidebar.jsx` | `handleLogout` now calls the backend (`POST /auth/logout`), clears the in-memory token, wipes all `wf:*` keys, then navigates to `/login`. |
| `src/api/axios.js` | Force-logout path (refresh token failure) now also calls `clearSessionState()` before redirecting. |
| `src/pages/SAM/SAM.jsx` | Persists selected network snapshot + last scanned network. On mount: restores from live scan list, auto-fetches vulnerabilities, degrades gracefully if network is out of range. Forces `DETECTING` → `IDLE` on refresh with a dismissible banner. Tab state persisted. |
| `src/pages/DeviceManagement/DeviceManagement.jsx` | Tab state (`announcement` / `terms`) persisted via `wf:dmTab`. |

---

## Refresh Behavior by Page

### SAM (Security Assessment Management)

| Scenario | Before | After |
|---|---|---|
| Refresh with network selected | Network gone, table empty | Network restored, vulnerabilities auto-fetched from DB |
| Refresh with network no longer in range | N/A (was always lost) | Banner: *"Previously selected network is no longer in range"* |
| Refresh during threat detection | Polling stopped silently | Banner: *"Detection was paused due to page refresh. Start detection again."* Status forced to IDLE. |
| Refresh on Threats tab | Reset to Vulnerabilities | Stays on Threats tab |

### Device Management

| Scenario | Before | After |
|---|---|---|
| Refresh after scan | *"No network selected. Run a scan first."* | `networkId` + `scanId` restored from session. Page loads normally. |
| Refresh on Terms tab | Reset to Announcement | Stays on Terms tab |

### Dashboard

| Scenario | Before | After |
|---|---|---|
| Refresh | Unchanged (uses mock data) | Unchanged — dashboard fetches fresh on mount |

---

## Logout Cleanup

Logout is now **centralized and complete**. There are two paths:

### 1. User-initiated (Sidebar button)

```
User clicks Logout
  → POST /auth/logout (clears HttpOnly refresh cookie on server)
  → setAccessToken(null) (clears in-memory JWT)
  → clearSessionState() (wipes all wf:* sessionStorage keys)
  → navigate("/login")
```

### 2. Forced (refresh token expired / revoked)

```
API call returns 401
  → Interceptor attempts POST auth/refresh
  → Refresh fails
  → setAccessToken(null)
  → clearSessionState()
  → window.location.href = "/login"
```

Both paths guarantee no stale session data survives.

---

## Threat Detection — Current Limitations

**Detection does NOT resume after refresh.** This is intentional.

The threat detection polling (`useThreatDetection`) uses `fetch()` to poll `/api/detect/poll` every 2 seconds. On refresh:

1. The polling loop is destroyed (React unmounts)
2. There is no backend endpoint to check if a detection session is still alive
3. Blindly resuming polling could show stale "Detecting..." UI with no actual backend activity

**Current behavior:** If `detectionStatus` was `DETECTING` or `SCANNING` before refresh, it is forced to `IDLE` and a dismissible banner informs the user.

**Future work (PR4):**
- Fix polling to use the authenticated `api` instance instead of raw `fetch()`
- Add a backend `/api/detect/status` endpoint with session lifecycle
- Implement TTL-based expiry for detection sessions
- Only then: allow `DETECTING` to resume after refresh

---

## Design Rules for `useSessionState`

These rules are enforced in the hook implementation:

| Rule | Why |
|---|---|
| `undefined` is normalized to `null` | `JSON.stringify(undefined)` produces `undefined` (not valid JSON) |
| Failed `JSON.parse` → fallback to initial value + overwrite | Prevents corrupt data from permanently breaking the app |
| Functional setState `setValue(prev => next)` works | Matches `useState` contract; required for atomic updates in `NetworkContext` |
| SSR guard: `typeof window !== 'undefined'` | Prevents build-time errors if SSR is ever added |
| One hook instance per key | Two components writing the same key would fight; keys are namespaced to avoid this |
| All keys prefixed with `wf:` | `clearSessionState()` only deletes `wf:*` keys, leaving other libraries' storage untouched |

---

## Atomicity: Why `networkId` + `scanId` Share One Key

`sessionStorage.setItem()` is synchronous but not transactional across two separate calls. If the tab crashes between writing `networkId` and `scanId`, one could exist without the other — causing a `SCAN_NETWORK_MISMATCH` error on the backend.

Solution: both are stored as a single object under `wf:networkScan`. The `setNetworkScan(nId, sId)` function writes once. Additionally, `setNetworkId()` auto-resets `scanId` when the network changes, preventing stale cross-references.

---

## Testing Checklist

### PR1 — NetworkContext persistence
- [ ] Scan → select network → refresh → Device Management still shows network (not "No network selected")
- [ ] Change network → `scanId` resets (no mismatch)
- [ ] Open a new tab → does NOT inherit previous tab's state (sessionStorage is tab-scoped)
- [ ] Close tab → reopen → state is gone

### PR2 — Logout cleanup
- [ ] Click Logout → `sessionStorage` has no `wf:*` keys
- [ ] Force-logout (expire refresh token) → `sessionStorage` has no `wf:*` keys
- [ ] After logout, refreshing on `/login` does not redirect or error

### PR3 — SAM persistence + auto-restore
- [ ] Select network → scan → refresh → vulnerabilities table repopulates
- [ ] Select network → scan → take network offline → refresh → banner: "no longer in range"
- [ ] Start detection → refresh → banner: "Detection paused" → status is IDLE
- [ ] Dismiss "Detection paused" banner → start new scan → banner does not reappear
- [ ] Switch to Threats tab → refresh → still on Threats tab
- [ ] Device Management: switch to Terms tab → refresh → still on Terms tab
