# src/pages/SAM — Security Assessment Management Page

## Changes: Compact Detection Status & Dismiss Banner

### What changed

1. **Removed full-width green DETECTING banner.**
   - Previously: a prominent green banner stretched across the page when detection was active.
   - Now: replaced with a subtle **compact status pill** in the tab header row.

2. **Compact status pill** (`.detection-status-pill`)
   - Appears in the `.sam-header` beside the tab controls.
   - States:

   | Priority | Condition                         | Label                 | Style                   |
   | -------- | --------------------------------- | --------------------- | ----------------------- |
   | 1        | `detectionStatus === "DETECTING"` | Monitoring: \<SSID\>  | Green pill              |
   | 2        | `detectionStatus === "SCANNING"`  | Starting…             | Blue pill (pulsing dot) |
   | 3        | `detectionStatus === "FAILED"`    | Failed                | Red pill                |
   | 4        | Out-of-range + detection idle     | Paused — out of range | Orange pill             |
   | 5        | `detectionStatus === "IDLE"`      | _(hidden)_            | —                       |
   - Shows "Updated Xs ago" when actively monitoring.
   - **Active detection wins:** If `detectionStatus === "DETECTING"`, the pill always shows "Monitoring" even if `selectedNetwork._notInRange` is true. Detection runs on the Raspberry Pi independently.
   - "Paused — out of range" only appears when detection is idle/stopped.
   - The SSID is resolved from: `backendState.ssid` → `activeNetwork` (context) → `lastScannedNetwork.ssid` → `selectedNetwork.ssid`.

3. **Dismissible out-of-range banner**
   - The orange warning banner ("Previously selected network … is no longer in range") now has a ✕ dismiss button.
   - Dismissal persisted in `sessionStorage` with key `wf:dismissOutOfRange:<BSSID>` (fallback: `<SSID>`).
   - Dismissing the banner **does not** hide the status pill.

4. **Console.log cleanup**
   - Removed `console.log` calls that output vulnerability data, threat arrays, or BSSID strings.

5. **Single polling loop**
   - SAM.jsx no longer calls `useThreatDetection()` directly.
   - It reads detection state from `useThreatDetectionContext()` (global provider).
   - The provider (in `ThreatDetectionContext`) owns the single polling loop.

### New CSS classes (SAM.css)

| Class                               | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `.detection-status-pill`            | Base pill styling (inline-flex, rounded, compact) |
| `.detection-status-pill.monitoring` | Green theme                                       |
| `.detection-status-pill.starting`   | Blue theme                                        |
| `.detection-status-pill.paused`     | Orange theme                                      |
| `.detection-status-pill.failed`     | Red theme                                         |
| `.pill-dot`                         | 8 px colored dot inside pill                      |
| `.pill-label`                       | Status text                                       |
| `.pill-time`                        | Subdued relative-time label                       |
| `.out-of-range-banner`              | Flex layout for banner + dismiss button           |
| `.dismiss-banner-btn`               | Dismiss (✕) button styling                        |
| `@keyframes pill-pulse`             | Opacity pulse for starting state                  |

### How to test

1. Run a scan on a visible network → status pill appears as "Starting…" (blue, pulsing).
2. When detection begins → pill changes to "Monitoring: \<SSID\>" (green).
3. Navigate to another page and back → SAM page reads from context, pill state is preserved (monitoring pill persists).
4. Force the selected network out of range (e.g., clear networks list):
   - If detection is running: pill shows "Monitoring: SSID" (green). Orange banner still appears.
   - If detection is idle: pill shows "Paused — out of range" (orange).
   - Click ✕ to dismiss the orange banner; refresh the page — banner stays dismissed.
5. If detection fails → pill shows "Failed" (red); FAILED banner also visible above.
