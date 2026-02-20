# Threat Detection (Polling) — End-to-end

This document explains the threat-detection polling flow implemented in the codebase, how the backend proxies and processes poll responses from the FastAPI service on the Pi, and where results are persisted.

**Primary backend polling endpoint**

- `GET /api/detect/poll` — defined in [backend/server.js](backend/server.js#L81). This endpoint proxies to the FastAPI `detect/poll` endpoint on the machine defined by `FASTAPI_BASE`.

**Frontend caller**

- The frontend invokes the backend poll at: [src/hooks/useSAM.js](src/hooks/useSAM.js#L291) (fetch to `http://localhost:3000/api/detect/poll`).

How the flow works (high level)

1. Frontend requests polling: calls backend `GET /api/detect/poll`.
2. Backend proxies the request to FastAPI: `${FASTAPI_BASE}/detect/poll?max_items=<n>`.
3. FastAPI responds with a JSON payload containing a `results` array of detection cycles.
4. Backend maps FastAPI results to local threat rows via `loadThreatDefinitions()` and `mapPollResultsToThreatRows()`.
5. Backend optionally persists mapped threat rows into Supabase tables via `persistThreatRows()` which looks up the most recent `scan_id` for a target BSSID and inserts rows into `vulnerabilities_threat`.
6. Backend returns the original FastAPI response augmented with `threatRows` to the frontend.

Key backend logic and where to find it

- Proxy endpoint: [backend/server.js](backend/server.js#L81) — see `app.get('/api/detect/poll', ...)`.
- Loading threat definitions: `loadThreatDefinitions(supabaseClient)` — reads `vulnerability_threat_details` to map vt_code → metadata.
- Mapping results: `mapPollResultsToThreatRows(results, defsByCode)` — produces a normalized array of threat rows (id/name/severity/score/status/occurrences/sessions/raw).
- Persistence orchestration: `persistThreatRows(threatRows, targetBssid, supabaseClient)` — finds latest `scan_id` for the target BSSID and inserts rows into `vulnerabilities_threat`.
- Helpers: `findLatestScanIdForBssid(targetBssid, supabaseClient)` — finds networks by BSSID then recent `scans` for that network.

Supabase tables referenced

- `vulnerability_threat_details` — catalog of threat/vulnerability codes, names, CVSS scores, severity ratings.
- `vulnerabilities_threat` — per-scan findings persisted by the backend.
- `scans` — stores scan runs (linked to `networks`).
- `networks` — stores access point metadata (bssid, ssid, etc.).

Expected FastAPI `detect/poll` response (example)

```json
{
  "running": true,
  "results": [
    {
      "bssid": "AA:BB:CC:DD:EE:FF",
      "detection_cycle_start": "2026-02-18T12:00:00Z",
      "findings": {
        "evil_twin": {
          "id": "WFVT-006",
          "status": "DETECTED",
          "details": { "first_seen_epoch": 1676726400, "last_seen_epoch": 1676726460 },
          "value": "Open"
        },
        "deauthentication": null,
        "mac_spoofing": { }
      }
    }
  ]
}
```

Notes on the mapping logic

- `mapPollResultsToThreatRows` looks for specific finding keys like `evil_twin`, `mac_spoofing`, `deauthentication`. For each detected finding it:
  - reads the `id` (vt_code) and looks up metadata in `vulnerability_threat_details`
  - builds a grouped object per `vt_code` with aggregated occurrences, status (DETECTED/CLEARED), sessions array and raw results attached

- `loadThreatDefinitions()` returns a Map keyed by `vt_code` (e.g., `WFVT-006`) used to populate name, score and severity when mapping.

Persistence behavior

- `persistThreatRows` will: find the latest `scan_id` for the target BSSID (via `findLatestScanIdForBssid`) and insert rows into `vulnerabilities_threat`.
- When inserting it queries `vulnerability_threat_details` to obtain `vt_detail_id` and `vt_kind`.

Where to change the FastAPI target

- `FASTAPI_BASE` is declared in [backend/server.js](backend/server.js) (and in some controllers as `process.env.FASTAPI_BASE`). Update the environment variable or the constant to point to the Pi/FastAPI instance used for detection.

Example curl request to backend poll (local)

```bash
curl "http://localhost:PORT/api/detect/poll?max_items=50"
```

Troubleshooting & verification

- If `threatRows` is empty but FastAPI returns results: inspect `vulnerability_threat_details` to ensure vt_codes present in FastAPI results are catalogued.
- If persistence is not happening: confirm `findLatestScanIdForBssid` finds a `network` and recent `scan` for the `bssid`—otherwise persistence is skipped.
- Check logs in `backend/server.js` — the poll handler logs mapped rows and warnings when no network/scan is found.

Next steps (suggestions)

- Add additional finding keys in `mapPollResultsToThreatRows` if FastAPI adds more detection categories.
- Add an audit trail table (e.g., `vulnerability_threat_events`) and update `persistThreatRows` to optionally insert events; currently no code references `vulnerability_threat_events` in the repository.
- Add unit tests for `mapPollResultsToThreatRows` to verify aggregation semantics.

References (code)

- Poll handler: [backend/server.js](backend/server.js#L81)
- Mapping & persistence helpers: [backend/server.js](backend/server.js#L120)
- Frontend caller: [src/hooks/useSAM.js](src/hooks/useSAM.js#L291)
