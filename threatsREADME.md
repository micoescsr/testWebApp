**Threat Detection — End-to-End Overview**

This document describes how the threat-detection pipeline works in this codebase (backend + frontend), where the important pieces live, and how to run or test it locally.

**Scope**: runtime threat detection (live polling from the FastAPI detector, mapping into session/parent objects, optional mock data for local UI, and persistence into the `vulnerabilities_threat` table with `vt_kind = 'threat'`). This does not cover vulnerability scan rules (those are handled separately by the scan endpoints and marked with `vt_kind = 'vulnerability'`).

**Last updated**: March 1, 2026

---

## Detection State Persistence

Detection is now a **system-owned, persistent** process backed by the `public.detection_state` Postgres table. Detection survives page refresh, logout, and login. It is not tied to any single browser session or admin user.

### detection_state table

| Column | Type | Description |
|---|---|---|
| `device_id` | integer PK | Always 1 (single-device system) |
| `status` | text | `RUNNING`, `STOPPED`, or `FAILED` |
| `active_network_id` | uuid FK → networks | Network being monitored |
| `active_scan_id` | bigint FK → scans | Scan associated with detection (NOT UUID) |
| `started_by_profile_id` | uuid FK → profiles | Admin who started it |
| `started_at` | timestamptz | When detection started |
| `stopped_at` | timestamptz | When detection stopped |
| `last_heartbeat_at` | timestamptz | Last successful poll heartbeat |
| `failure_reason` | text | Why detection failed (e.g. "heartbeat timeout") |
| `updated_at` | timestamptz | Optimistic lock column |

### State transitions

```
STOPPED/FAILED → RUNNING    (start or switch)
RUNNING → RUNNING           (idempotent same target, or SWITCH_TARGET)
RUNNING → STOPPED           (explicit stop)
RUNNING → FAILED            (heartbeat timeout: last_heartbeat_at > 30s)
```

### What does NOT stop detection
- Page refresh
- Logout / login
- Opening a new tab or closing tabs

### What stops detection
- Explicit `POST /api/detect/stop`
- New scan on a different network (automatic SWITCH_TARGET)
- Heartbeat timeout (Pi offline for >30s)

### Heartbeat rules
- Heartbeat expected every ~10s (poll interval is 3s, heartbeat updates on each successful poll).
- If RUNNING and `last_heartbeat_at` is NULL or older than 30s, `GET /api/detect/status` auto-marks FAILED.

---

## API Endpoints

All endpoints are mounted at `/api/detect` and require JWT auth (`authJWT` middleware).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/detect/status` | Returns current detection state. Auto-marks FAILED if heartbeat timed out (>30s). |
| `POST` | `/api/detect/start` | Starts detection or switches target. Body: `{ networkId, scanId }`. `scanId` must be a numeric bigint from `public.scans`, **not** a UUID. |
| `POST` | `/api/detect/stop` | Stops detection. Body: `{ reason }` (optional, defaults to `"MANUAL"`). |
| `POST` | `/api/detect/heartbeat` | Updates `last_heartbeat_at`. Called automatically by the poll endpoint. |
| `GET` | `/api/detect/poll` | Proxies to FastAPI detector. **Gated**: returns 200 with `{ threatRows: [], skipped: true }` if detection is not RUNNING. On success, calls heartbeat and returns `{ threatRows }`. |

### Poll gating behaviour

`GET /api/detect/poll` checks `detection_state.status` before proxying:
- **RUNNING** → proxy to FastAPI, update heartbeat, persist threat rows, return results.
- **STOPPED / FAILED** → return `{ threatRows: [], skipped: true, reason }` without hitting FastAPI.

This ensures the FastAPI detector is only contacted when detection is legitimately active.

---

## High-level flow

1. **Scan save** triggers auto-start: `rasPiController.js` calls `detectStateService.startOrSwitch()` after the risk pipeline completes. This writes RUNNING to `detection_state` with the scan's bigint `scan_id` and the `network_id`.
2. **Frontend bootstrap**: On SAM page mount, `useThreatDetection()` calls `GET /api/detect/status`. If RUNNING, the hook immediately enters DETECTING mode and begins polling.
3. **Polling loop**: Frontend polls `GET /api/detect/poll` every 3 seconds via axios. Poll results are mapped into parent/session model for the ThreatsTable.
4. **Heartbeat**: Each successful poll triggers `POST /api/detect/heartbeat` server-side, keeping `last_heartbeat_at` fresh.
5. **Failure detection**: If the Pi goes offline, heartbeats stop. The next `GET /api/detect/status` call (or any frontend poll cycle) checks `last_heartbeat_at` > 30s and auto-marks FAILED.
6. **Persistence**: Threat rows from each poll are mapped and upserted into `vulnerabilities_threat` with `vt_kind = 'threat'`.

---

## Concurrency guard

The service uses **optimistic locking** on `updated_at`:
- Read `updated_at` before write
- Pass it as a filter condition in the update
- If rows affected = 0, re-read and retry (up to 2 retries)
- After max retries, the operation fails with a 409 Conflict

This prevents race conditions when multiple tabs or users attempt simultaneous state changes.

---

## Audit events

All detection lifecycle transitions are logged to the audit table:

| Action | Detail |
|---|---|
| `DETECT_START` | Detection started (includes network_id, scan_id) |
| `DETECT_STOP` | Detection stopped (includes reason) |
| `DETECT_SWITCH_TARGET` | Network/scan changed while detection was running |
| `DETECT_FAILED` | Heartbeat timeout triggered automatic failure |

---

## Where to look in the code

### Backend
- **Detection state service**: [backend/services/detectStateService.js](backend/services/detectStateService.js) — single source of truth for `detection_state` table operations (`ensureRow`, `getStatusAndMaybeFail`, `startOrSwitch`, `stop`, `heartbeat`, optimistic locking).
- **Detection controller**: [backend/controllers/detectController.js](backend/controllers/detectController.js) — Express handlers for all `/api/detect/*` endpoints. Contains moved `loadThreatDefinitions()`, `mapPollResultsToThreatRows()`, `findLatestScanIdForBssid()`, `persistThreatRows()` helpers.
- **Detection routes**: [backend/routes/detectRoutes.js](backend/routes/detectRoutes.js) — Express router mapping endpoints to controller handlers.
- **Server mount**: [backend/server.js](backend/server.js) — mounts `detectRoutes` at `/api/detect`, calls `detectStateService.ensureRow()` on startup.
- **Auto-start on scan save**: [backend/controllers/rasPiController.js](backend/controllers/rasPiController.js) — calls `detectStateService.startOrSwitch()` after risk pipeline.
- **Threat detail endpoint** (modal data): [backend/controllers/samController.js](backend/controllers/samController.js) at `/api/sam/threats/:idOrName`.

### Frontend
- **Detection API helpers**: [src/api/detectApi.js](src/api/detectApi.js) — `getDetectStatus()`, `startDetect()`, `stopDetect()`, `pollDetect()`.
- **Detection hook**: [src/hooks/useSAM.js](src/hooks/useSAM.js) — `useThreatDetection()` bootstraps from `/detect/status` on mount, runs axios-based polling at 3s intervals, exposes `refreshStatus()`.
- **SAM page**: [src/pages/SAM/SAM.jsx](src/pages/SAM/SAM.jsx) — destructures `failureReason`/`refreshStatus` from hook, shows FAILED banner.
- **Display**: [src/components/sam/ThreatsTable.jsx](src/components/sam/ThreatsTable.jsx) — renders parent rows and expanded sessions panel.

---

## Key data model notes

- **Table**: `vulnerabilities_threat` is used for both scan findings and runtime threats. `vt_kind` column distinguishes them (`'threat'` vs `'vulnerability'`).
- **scan_id type**: Detection uses `bigint` from `public.scans.scan_id`, NEVER the UUID from `public.vulnerability_scans.scan_id`. The start endpoint validates this and rejects UUIDs (any value containing `-`).
- **Threat mapping**: Each incoming row can contain `sessions` or nested `details`; the frontend mapper normalizes timestamps (seconds) and builds session objects.
- **Detected time**: `mapThreatRowsToParentSessions()` sets `detectedTime` to `activeSession.lastSeen` (if active) or the newest session's `lastSeen`/`firstSeen`.

---

## Local dev and testing

- **Mock data**: `src/data/mockThreats.js` provides `mappedThreats` and `rawPollSamples` for UI testing when the detector is offline.
- **Against real detector**:
  1. Ensure FastAPI detector is reachable and `FASTAPI_BASE` is set in backend `.env`.
  2. Start Express backend (`npm run dev` in `backend/`).
  3. Start Vite frontend (`npm run dev` in root).
  4. Open SAM page → trigger a scan → detection auto-starts after save.

---

## Troubleshooting

- **Browser error `process is not defined`**: frontend uses `import.meta.env` (Vite). `useSAM.js` includes a guarded lookup.
- **Threats not appearing**:
  - Check `GET /api/detect/status` — is status RUNNING?
  - Check `GET /api/detect/poll` — does it return `threatRows` (or `skipped: true`)?
  - If `skipped: true`, detection is not RUNNING. Check `detection_state` table directly.
- **Detection stuck in FAILED**:
  - Check `failure_reason` in the status response or `detection_state` table.
  - Verify the Pi is online and heartbeats are reaching the backend.
  - Re-trigger a scan to auto-start detection fresh.
- **409 Conflict on start/stop**: Concurrent state change detected. The frontend should retry automatically via `refreshStatus()`.

---

## Acceptance tests checklist

1. **Refresh preserves DETECTING**: Start detection → refresh page → SAM shows DETECTING (not IDLE).
2. **Logout + login preserves**: Start detection → logout → login → SAM shows DETECTING.
3. **Stop is explicit**: Only `POST /api/detect/stop` (or switch/heartbeat timeout) transitions to STOPPED.
4. **Network switch**: Start detection on Network A → scan Network B → detection restarts on B (SWITCH_TARGET audit logged).
5. **Heartbeat timeout**: Start detection → stop FastAPI → wait >30s → status returns FAILED with reason "heartbeat timeout".
6. **Concurrent guard**: Two tabs hit `POST /api/detect/start` simultaneously → one succeeds, the other retries via optimistic lock.
7. **scan_id is bigint**: Attempt `POST /api/detect/start` with a UUID `scanId` → 400 error.

---

## Possible improvements

- Add a WebSocket channel for real-time push instead of polling.
- Implement multi-device support (remove `DEVICE_ID = 1` assumption).
- Add a UI toggle to switch between mock data and live polling without restarting.
- Improve session detail modal to show raw payloads for forensic analysis.

---

## Files to inspect quickly

- [backend/services/detectStateService.js](backend/services/detectStateService.js)
- [backend/controllers/detectController.js](backend/controllers/detectController.js)
- [backend/routes/detectRoutes.js](backend/routes/detectRoutes.js)
- [backend/server.js](backend/server.js)
- [backend/controllers/rasPiController.js](backend/controllers/rasPiController.js)
- [src/api/detectApi.js](src/api/detectApi.js)
- [src/hooks/useSAM.js](src/hooks/useSAM.js)
- [src/pages/SAM/SAM.jsx](src/pages/SAM/SAM.jsx)
- [src/components/sam/ThreatsTable.jsx](src/components/sam/ThreatsTable.jsx)
- [backend/controllers/samController.js](backend/controllers/samController.js)

---
Updated on March 1, 2026
