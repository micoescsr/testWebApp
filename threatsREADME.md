**Threat Detection — End-to-End Overview**

This document describes how the threat-detection pipeline works in this codebase (backend + frontend), where the important pieces live, and how to run or test it locally.

**Scope**: runtime threat detection (live polling from the FastAPI detector, mapping into session/parent objects, optional mock data for local UI, and persistence into the `vulnerabilities_threat` table with `vt_kind = 'threat'`). This does not cover vulnerability scan rules (those are handled separately by the scan endpoints and marked with `vt_kind = 'vulnerability'`).

**High-level flow**
- Detector (external FastAPI service) performs wireless environment analysis and exposes pollable results at the FastAPI `detect/poll` endpoint.
- Backend proxy: Express server exposes `GET /api/detect/poll` which forwards to the FastAPI poll endpoint, receives `threatRows` and (optionally) persists them.
- Persistence: threat rows are mapped and stored into the `vulnerabilities_threat` table; rows include `vt_kind = 'threat'` to distinguish runtime detections from scan findings.
- Frontend polling: the React app polls `GET /api/detect/poll` (via `src/hooks/useSAM.js`) to get live detections, maps raw rows into a parent/session model, and shows them in the SAM UI (`ThreatsTable` components).

Where to look in the code
- Backend poll proxy and persistence logic: [backend/server.js](backend/server.js)
  - `GET /api/detect/poll` proxies to FastAPI and calls the persistence helpers.
- Threat detail endpoint (modal data): [backend/controllers/samController.js](backend/controllers/samController.js) and route [backend/routes/samRoutes.js](backend/routes/samRoutes.js) mounted at `/api/sam/threats/:idOrName`.
- Scan trigger & save (related): [backend/controllers/rasPiController.js](backend/controllers/rasPiController.js) and [backend/services/rasPiService.js](backend/services/rasPiService.js) — when a scan is saved, scan findings are written to `vulnerabilities_threat` with `vt_kind = 'vulnerability'`.
- Frontend polling & mapping: [src/hooks/useSAM.js](src/hooks/useSAM.js)
  - `useThreatDetection()` runs polling when detection is active.
  - `mapThreatRowsToParentSessions()` converts raw `threatRows` into a `parent` object with `sessions` (firstSeen/lastSeen/duration/state) and `detectedTime` (used in the table).
  - Dev-mode mock support: `src/data/mockThreats.js` provides `mappedThreats` and `rawPollSamples` for testing.
- Frontend display: [src/components/sam/ThreatsTable.jsx](src/components/sam/ThreatsTable.jsx)
  - Renders parent rows and an expanded sessions panel (mini-table). `detectedTime` is formatted with `formatEpoch()`.

Key data model notes
- Table: `vulnerabilities_threat` is used for both scan findings and runtime threats. To avoid mixing, code sets `vt_kind` on write and filters on read (Option A implemented).
- Threat mapping: each incoming `t` (threat row) can contain an array of `sessions` or nested `details`; the frontend mapper normalizes timestamps (seconds) and builds session objects. The `detectedTime` shown is the active session's lastSeen (if active) or the newest session's lastSeen/firstSeen.

How detected time is calculated (frontend)
- `mapThreatRowsToParentSessions()` (in `src/hooks/useSAM.js`) converts session timestamps to epoch seconds, finds an `activeSession` (state === "DETECTED") if present, and sets `detectedTime` to:
  - `activeSession.lastSeen` (if active), else
  - the newest session's `lastSeen` or `firstSeen`.
- The UI displays `detectedTime` by converting epoch seconds to a locale date/time string (`ThreatsTable.jsx -> formatEpoch`).

Local dev and testing
- Use mock data in the frontend (automatic in Vite dev mode or via env flag):
  - `src/data/mockThreats.js` contains `mappedThreats` (parent/session model) and `rawPollSamples` for testing.
  - Toggle via `VITE_USE_MOCK_THREATS` or `REACT_APP_USE_MOCK_THREATS` environment variables, or simply run the frontend in dev (import.meta.env.DEV) — `useSAM.js` will enable mock data automatically during dev.
- To test against the real detector:
  1. Ensure the FastAPI detector is reachable and `FASTAPI_BASE` is set in the backend environment.
 2. Start the backend (Express) so `GET /api/detect/poll` can proxy to FastAPI.
 3. Start the frontend (Vite) and open the SAM page; click the Threats tab and start detection (or trigger scan + detection via the UI) to see live polling.

Troubleshooting
- Browser error `process is not defined`: frontend should use `import.meta.env` (Vite). `src/hooks/useSAM.js` includes a guarded lookup and a dev fallback to avoid this runtime error.
- If threats are missing from the UI:
  - Confirm the backend `GET /api/detect/poll` returns `threatRows` (use curl or browser to hit `http://localhost:3000/api/detect/poll`).
  - Confirm the frontend is in DETECTING mode (`useThreatDetection()` sets detectionStatus to "DETECTING" when active). The SAM UI will show `displayThreats` from the last non-empty poll.

Possible improvements
- Derive a clearer `evidence` count from raw events (right now mock sessions include `raw.count` — we could compute evidence as the number of raw events or sum specific fields).
- Add a UI toggle to switch between mock data and live polling without restarting.
- Improve session detail modal to show raw payloads for forensic analysis (persist raw JSON in DB or recent cache).

Files to inspect quickly
- [backend/server.js](backend/server.js)
- [backend/controllers/samController.js](backend/controllers/samController.js)
- [src/hooks/useSAM.js](src/hooks/useSAM.js)
- [src/components/sam/ThreatsTable.jsx](src/components/sam/ThreatsTable.jsx)
- [src/data/mockThreats.js](src/data/mockThreats.js)

If you want, I can:
- Add an explicit `THREAT_README.md` inside `backend/` instead, or extend this file with sequence diagrams.
- Add a small endpoint to return raw recent polls for debugging.

---
Generated on 2026-02-18
