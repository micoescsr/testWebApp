## Scan API

This project exposes backend endpoints used by the frontend to trigger vulnerability scans, persist scan results, and fetch vulnerability history.

- **Trigger scan (frontend → backend → FastAPI on Pi)**: `POST /api/rasPi/scan`
	- Payload: `{ ssid: string, bssid: string, channel: number }`
	- Behavior: Handled by `rasPiController.triggerScan` which proxies the request to the FastAPI `/scan` endpoint on the configured `FASTAPI_BASE`.
	- Frontend call: `src/api/rasPiApi.js` -> `triggerScan(network)` posts to `/rasPi/scan`.

- **Save network + scan + findings**: `POST /api/rasPi/networks`
	- Payload: `{ ssid, bssid, channel, city?, province?, notes?, scan? }` where `scan` is the JSON returned from FastAPI containing `findings`.
	- Behavior: Handled by `rasPiController.saveNetworkMetadataScan` which upserts `networks`, inserts a `scans` row and persists findings into `vulnerabilities_threat` (links to `vulnerability_threat_details`).

- **Get access point details**: `GET /api/rasPi/networks` (handled by `rasPiController.getAccessPointDetails`)

- **Alternate proxy endpoint**: `POST /api/rasPi_scan/trigger_scan`
	- This route (in `backend/routes/scanRoutes.js`) also proxies to the Pi FastAPI and is mounted at `/api/rasPi_scan/trigger_scan`.

- **History endpoints (backend)**:
	- `GET /api/history/vulnerabilities` — returns previous scans summarized with associated vulnerability counts (reads from `scans` and `vulnerabilities_threat`).
	- `GET /api/history/threats` — similar for detected threats.

Persistence tables referenced in the code: `networks`, `scans`, `vulnerabilities_threat`, `vulnerability_threat_details`.

Quick curl examples:

```bash
# Trigger a scan (proxy to FastAPI)
curl -X POST "http://localhost:PORT/api/rasPi/scan" \
	-H "Content-Type: application/json" \
	-d '{"ssid":"MyNet","bssid":"AA:BB:CC:DD:EE:FF","channel":6}'

# Save network + scan results (example)
curl -X POST "http://localhost:PORT/api/rasPi/networks" \
	-H "Content-Type: application/json" \
	-d '{"ssid":"MyNet","bssid":"AA:BB:CC:DD:EE:FF","channel":6,"scan":{...}}'
```

See the handler implementations in `backend/routes/rasPiRoutes.js` and `backend/controllers/rasPiController.js` for details.
