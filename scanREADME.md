# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

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
