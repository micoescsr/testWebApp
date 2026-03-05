# Why-PII? — Web-based Security Assessment Tool

A Web-based Security Assessment Tool using Microcontroller applied to Unsecured Wi-Fi Access Point in Communal Public Places.

---

## Tech Stack

| Layer     | Technology                                                        |
|-----------|-------------------------------------------------------------------|
| Frontend  | React 19 (Vite), React Router 7, Recharts, Axios                 |
| Backend   | Express 5, Node.js                                                |
| Database  | PostgreSQL via Supabase (SDK — zero raw SQL)                      |
| Auth      | JWKS JWT (in-memory access token) + HttpOnly refresh cookie       |
| Hardware  | Raspberry Pi (FastAPI), Tailscale Funnel for remote connectivity  |
| Hosting   | Railway (frontend: `serve -s dist`, backend: Express)             |
| Testing   | Jest (backend unit/integration), Playwright (E2E), Burp/ZAP (security) |

---

## Project Structure

```
whypii/
├── src/                    # React frontend (Vite)
│   ├── api/                # Axios instance + API helpers
│   ├── components/         # Reusable UI components
│   ├── context/            # React context providers (auth, threat detection)
│   ├── hooks/              # Custom React hooks
│   ├── layouts/            # Sidebar, page layouts
│   ├── pages/              # Route-level page components
│   └── lib/                # Utilities
├── backend/                # Express.js API server
│   ├── controllers/        # Route handlers
│   ├── services/           # Business logic
│   ├── repositories/       # Supabase data access
│   ├── middleware/         # Auth, roles, rate limiting, request ID
│   ├── routes/             # Express route definitions
│   ├── validators/         # Input validation
│   ├── utils/              # Shared utilities
│   └── __tests__/          # Jest test suites
├── e2e/                    # Playwright E2E tests
└── public/                 # Static assets
```

---

## Architecture

```
Browser (React SPA)
    │
    │  HTTPS / cookies
    ▼
Railway (Express API)
    │
    ├──→ Supabase (PostgreSQL + Auth)
    │
    └──→ Tailscale Funnel (public HTTPS)
              │
              ▼
         Raspberry Pi
         ├── nginx (127.0.0.1:9000 — gateway)
         └── FastAPI (scanning, AP control, detection)
```

- **Express is the only caller of the Pi.** The browser never talks to the Pi directly.
- **Tailscale Funnel** exposes the Pi because Railway cannot join a tailnet.
- **HMAC signing** authenticates Express→Pi commands; **nginx rate limits** protect availability.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (with service role key)
- Raspberry Pi with FastAPI + nginx (for device features)

### Frontend

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

### Backend

```bash
cd backend
npm install
cp .env.example .env  # Fill in Supabase keys, JWT secret, etc.
npm start             # Express on http://localhost:3001
```

### Tests

```bash
# Backend unit/integration tests
cd backend
npm test
npm run test:coverage

# E2E tests (Playwright)
npm run test:e2e
npm run test:e2e:headed
```

---

## Security Hardening

The project is undergoing a phased security hardening process documented in [`SECURITY_HARDENING_PLAN.md`](SECURITY_HARDENING_PLAN.md).

### Current Security Posture: 8/10

| Phase | Name                        | Status       | Key Items                                                      |
|-------|-----------------------------|--------------|----------------------------------------------------------------|
| 0     | Secrets Remediation         | **Done**     | Pi secrets generated, `PORTAL_PATCH_TOKEN` + `CONTROL_SIGNING_SECRET` in env |
| 1     | P0 Infrastructure           | **Done**     | `trust proxy`, Helmet/CSP, rate limiting, env validation, CORS/cookies (`CROSS_ORIGIN_COOKIES`) |
| 2     | Route Auth Lockdown         | **Done**     | `authJWT` on all 9 route groups, `requireSuperadmin` on audit  |
| 3     | Bug Fixes & Info Disclosure | **Partial**  | Most leaks sealed; residual `err.message` in rasPi/auth/user/detect controllers |
| 4     | Deployment Readiness        | **Partial**  | CORS via env, `VITE_API_BASE_URL` in axios; `deviceApi.js` still hardcoded |
| 4.5   | Pi Connectivity Readiness   | Not started  | Funnel URL stability, nginx binding, timeouts, Idempotency-Key |
| 5     | Optional Polish             | **Done**     | UUID validation middleware on device/user/rasPi routes          |
| 6     | Testing Deliverables        | **Done**     | Jest unit + integration tests, Playwright E2E, coverage reports |

### Deployment Watchlist Items

1. **CSP `connect-src`** — auto-configured per environment; Railway + Supabase domains added in prod
2. **CORS / cookies** — set `CROSS_ORIGIN_COOKIES=true` on Railway backend for `SameSite=None; Secure`
3. **Multi-instance** — in-memory rate limiter resets on restart; Redis required if Railway auto-scales
4. **`deviceApi.js` hardcoded URL** — still uses `localhost:3000`; should use shared axios instance
5. **Funnel ports** — Funnel only listens on 443/8443/10000; nginx 9000 is internal only

---

## Documentation Index

| Document                                                                  | Covers                                              |
|---------------------------------------------------------------------------|------------------------------------------------------|
| [`SECURITY_HARDENING_PLAN.md`](SECURITY_HARDENING_PLAN.md)               | Full phased security plan, audit findings, risk notes |
| [`DEVICE_MANAGEMENT_README.md`](DEVICE_MANAGEMENT_README.md)             | Device management feature (AP, portal, scans)        |
| [`AP_ENABLE_PORTAL_README.md`](AP_ENABLE_PORTAL_README.md)               | Access Point & captive portal flow                   |
| [`ACCOUNTS_FLOW_README.md`](ACCOUNTS_FLOW_README.md)                     | User account management flow                         |
| [`AUDIT_README.md`](AUDIT_README.md)                                     | Audit logging system                                 |
| [`SESSION_PERSISTENCE_README.md`](SESSION_PERSISTENCE_README.md)         | Session persistence & token refresh                  |
| [`SAM_CHANGES_README.md`](SAM_CHANGES_README.md)                         | Security Assessment Management changes               |
| [`HISTORY_CHANGES_README.md`](HISTORY_CHANGES_README.md)                 | History/vulnerability tracking changes               |
| [`CHANGES_README.md`](CHANGES_README.md)                                 | General changelog                                    |
| [`scanREADME.md`](scanREADME.md)                                         | Scan workflow                                        |
| [`threatsREADME.md`](threatsREADME.md)                                   | Threat detection system                              |
| [`clearListREADME.md`](clearListREADME.md)                               | Clear list functionality                             |
| [`backend/TESTING.md`](backend/TESTING.md)                               | Backend test guide                                   |
| [`backend/THREATS.md`](backend/THREATS.md)                                | Backend threat model                                 |

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
