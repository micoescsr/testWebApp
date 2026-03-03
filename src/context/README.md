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
| `activeNetwork`      | `string \| null` | SSID of the network under detection. Resolved from: SAM-pushed override → `backendState.ssid`   |
| `setActiveNetwork`   | `function`       | Lets SAM page push the active SSID into global context (e.g., on scan start or session restore) |

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

### `setActiveNetwork` flow

The backend `/detect/status` response may not include an `ssid` field. To ensure the monitoring pill and sidebar tooltip always show the network name, the SAM page pushes the SSID into context via `setActiveNetwork()` in two places:

1. **On scan start** — after `setLastScannedNetwork(selectedNetwork)` in `handleScan()`.
2. **On session restore** — in the `useEffect` that hydrates `lastScannedNetwork` / `selectedNetwork` from `sessionStorage` snapshots after page refresh.
