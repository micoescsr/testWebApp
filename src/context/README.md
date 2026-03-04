# src/context — React Context Providers

## ThreatDetectionContext.jsx

**Purpose:** Global single-source-of-truth for threat-detection state across the app.

### What it does

- Wraps the existing `useThreatDetection()` hook (from `src/hooks/useSAM.js`) inside a React context provider.
- Ensures there is exactly **one polling loop** for the entire authenticated app.
- Exposes the following to consumers via `useThreatDetectionContext()`:

| Property             | Type             | Description                                                                                     |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `detectionStatus`    | `string`         | `"IDLE"`, `"SCANNING"`, `"DETECTING"`, `"FAILED"`                                               |
| `setDetectionStatus` | `function`       | Setter for imperative status changes (e.g., on scan start)                                      |
| `detectionResults`   | `object \| null` | Latest poll response payload                                                                    |
| `liveThreats`        | `array`          | Raw mapped threat rows from the latest poll                                                     |
| `displayThreats`     | `array`          | Sticky/latest-known threats shown in the UI                                                     |
| `failureReason`      | `string \| null` | Human-readable failure description                                                              |
| `backendState`       | `object \| null` | Full detection_state row from `/detect/status`                                                  |
| `refreshStatus`      | `function`       | Re-fetch `/detect/status` (call after scan save)                                                |
| `resetDetection`     | `function`       | Stop polling and clear all detection state                                                      |
| `lastUpdated`        | `number`         | `Date.now()` timestamp, updated on every status/results change                                  |
| `activeNetwork`      | `string \| null` | SSID of the network under detection. Resolved from: `backendState.ssid` (authoritative) → session-cached override → `null`. Persisted in `sessionStorage` under `wf:activeNetwork` for fast initial render before `/detect/status` responds. |
| `setActiveNetwork`   | `function`       | Lets SAM page push the active SSID into global context (e.g., on scan start or session restore). Also called automatically when `backendState.ssid` changes. |

### Exported helpers

- **`timeAgo(ts)`** — Converts a ms timestamp to a human-readable relative string (`"just now"`, `"15s ago"`, `"2m ago"`, `"1h ago"`). Used by both Sidebar and SAM page.

### Usage

```jsx
import { useThreatDetectionContext } from "../context/ThreatDetectionContext";

const { detectionStatus, displayThreats, lastUpdated } =
  useThreatDetectionContext();
```

### Architecture note

The provider is mounted in `App.jsx` inside the authenticated route guard. It is **not** mounted on public pages (login, forgot-password), avoiding unauthenticated API calls.

### `activeNetwork` resolution (updated March 4, 2026)

The backend `GET /api/detect/status` response now **always includes an `ssid` field** (JOINed from the `networks` table via `active_network_id`). This is the authoritative source.

**Resolution order:**
1. `detection.backendState?.ssid` — authoritative, populated after `/detect/status` responds
2. `activeNetworkOverride` (session cache via `wf:activeNetwork`) — fast fallback for initial render before the bootstrap call resolves
3. `null` — no active network

**Sync effect:** Whenever `backendState.ssid` changes (e.g., after bootstrap, after scan save, or after another user switches the target network), the context automatically updates the session-cached override to match. This ensures:
- The correct SSID is displayed immediately after page refresh (from session cache) and confirmed once the backend responds.
- Account switches work: `clearSessionState()` on logout wipes the cache, and the next login re-populates it from the backend.

**SAM page still calls `setActiveNetwork()`** in two places for immediate UI feedback:
1. **On scan start** — after `setLastScannedNetwork(selectedNetwork)` in `handleScan()`.
2. **On session restore** — in the `useEffect` that hydrates `lastScannedNetwork` / `selectedNetwork` from `sessionStorage` snapshots after page refresh.
