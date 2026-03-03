# Why-PII? — Web-based Security Assessment Tool

A Web-based Security Assessment Tool using Microcontroller applied to Unsecured Wi-Fi Access Point in Communal Public Places.

---

## UI Updates — Threat Detection Indicator (Global)

### What changed

1. **Global detection state provider** (`src/context/ThreatDetectionContext.jsx`)
   - A single `ThreatDetectionProvider` wraps all authenticated routes.
   - There is exactly ONE polling loop for the entire app; no page starts its own.

2. **Sidebar indicator** (`src/layouts/Sidebar.jsx`)
   - A small dot indicator appears next to the "Security Assessment Management" nav item.
   - **Green dot** — detection is actively monitoring a network.
   - **Pulsing blue dot** — detection is starting / scanning.
   - **Red dot** — detection has failed.
   - **Hidden** — detection is idle / stopped.
   - A threat count badge appears when there are active detected threats.
   - Native `title` tooltip shows network name and last-update time.

3. **SAM page compact status pill** (`src/pages/SAM/SAM.jsx`)
   - The full-width green "DETECTING" banner has been removed.
   - A compact status pill appears in the tab header row showing:
     - State label (Monitoring / Starting / Paused / Failed)
     - Network SSID (if available)
     - Relative last-update time
   - **Priority order:** Active detection (`DETECTING`) always wins. The pill shows "Monitoring: SSID" even if the selected network is flagged out-of-range, because detection runs on the Raspberry Pi independently of the browser's network list.
   - "Paused — out of range" only appears when detection is idle/stopped and the selected network is out of range.

4. **Dismissible out-of-range banner**
   - The orange out-of-range warning banner now includes a dismiss (✕) button.
   - Dismissal is stored in `sessionStorage` (`wf:dismissOutOfRange:<BSSID>`), persisting across in-session refreshes.
   - Dismissing the banner does NOT hide the "Paused — out of range" status pill.

### How to test manually

1. Start the backend and frontend dev servers.
2. Log in and navigate to any page — the sidebar should load without errors.
3. When no detection is running, the SAM nav item should have no indicator.
4. Run a scan from the SAM page. Observe:
   - Sidebar shows a pulsing blue dot during scan start.
   - Once detection begins, the dot turns green. Hover to see the tooltip.
5. If detection fails, the dot turns red and the SAM page shows the FAILED banner + a red "Failed" pill.
6. While detection is running, navigate away from SAM and back — the monitoring pill should persist.
7. Select a previously-scanned network that is no longer in range:
   - If detection is still running: pill shows "Monitoring: SSID" (green). Orange banner still appears.
   - If detection is idle: pill shows "Paused — out of range" (orange).
   - Dismissing the orange banner hides it; the status pill remains visible.
   - Refreshing the page keeps the banner dismissed for that network.

### Known limitations

- `activeNetwork` in the sidebar tooltip and monitoring pill uses a fallback chain: backend `ssid` field → SAM-pushed `setActiveNetwork()` override → local `lastScannedNetwork`/`selectedNetwork`. The SSID is pushed into global context when a scan starts and when SAM restores a session.
- Badge count uses `displayThreats.length`; it does not distinguish between active vs. cleared threat sessions.
- The "Updated Xs ago" timestamp refreshes only when the context re-renders (every ~3 s during active detection).
