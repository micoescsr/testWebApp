# Threat Detection

Why-PII? performs passive, rule-based Wi-Fi threat detection. The application does not deauthenticate clients, capture authentication handshakes or packet payloads, brute-force networks, or actively exploit assessed access points.

## API Surface

All detection routes are mounted under `/api/detect` and require a valid JWT, an active profile, and AAL2/MFA:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/status` | Read authoritative detection state |
| `POST` | `/start` | Start or switch the monitored scan/network |
| `POST` | `/stop` | Stop detection and drain the Pi queue |
| `POST` | `/heartbeat` | Update liveness for the active detection session |
| `GET` | `/poll` | Poll passive findings from the Pi |

See [`routes/detectRoutes.js`](./routes/detectRoutes.js) and [`controllers/detectController.js`](./controllers/detectController.js).

## End-to-End Flow

1. The frontend's global [`ThreatDetectionContext`](../src/context/ThreatDetectionContext.jsx) uses the detection hook in [`useSAM.js`](../src/hooks/useSAM.js). Consumers read the shared state rather than creating independent poll loops.
2. The Express controller reads the authoritative row through [`detectStateService.js`](./services/detectStateService.js).
3. `poll` calls the Pi's `/detect/poll` endpoint through [`piFetch.js`](./utils/piFetch.js), which keeps HMAC signing and Pi credentials on the server.
4. `mapPollResultsToThreatRows()` accepts the implemented FastAPI finding keys (`evil_twin`, `mac_spoofing`, and `deauthentication`) and enriches their study-defined WFVT codes from `vulnerability_threat_details`.
5. `persistThreatRows()` records event history, updates current finding state for the active scan, recomputes risk through the `compute_scan_risk` RPC with a tested JavaScript fallback, and invokes the risk pipeline for portal freshness updates.
6. The original Pi response plus normalized `threatRows` is returned to the frontend.

Threat classification and scoring are deterministic. No AI or machine-learning model is used.

## Persistence

The flow uses these database records:

- `detection_state` for the active target, scan, lifecycle status, heartbeat, and optimistic-lock version.
- `vulnerability_threat_details` for WFVT metadata and severity values.
- `vulnerability_threat_events` for event history.
- `vulnerabilities_threat` for current per-scan finding state.
- `scans` and `networks` for assessment identity and aggregate risk.

Database migrations are retained under [`migrations/`](./migrations/), including detection-state support, portal freshness, and the current risk formula.

## Configuration and Verification

The Pi base URL and HMAC secret come from environment variables documented in [`.env.example`](./.env.example). Do not hardcode operational URLs or secrets.

Relevant automated coverage includes:

- [`integration/detectController.test.js`](./__tests__/integration/detectController.test.js)
- [`unit/detectStateService.test.js`](./__tests__/unit/detectStateService.test.js)
- [`unit/threatPersistence.test.js`](./__tests__/unit/threatPersistence.test.js)
- [`unit/piFetch.test.js`](./__tests__/unit/piFetch.test.js)
- [`unit/signing.test.js`](./__tests__/unit/signing.test.js)
