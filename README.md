# Why-PII? — Wi-Fi Security Assessment Tool

**Why-PII?** is a full-stack web application that assesses the security of public Wi-Fi access points in communal spaces (cafés, libraries, co-working areas) using a Raspberry Pi microcontroller as a field probe.

## Overview

Public Wi-Fi networks in shared spaces often lack basic protections — no encryption, no client isolation, and no monitoring — leaving users vulnerable to packet sniffing, evil-twin attacks, and session hijacking. **Why-PII?** addresses this by combining a remotely controlled Raspberry Pi with a cloud-hosted dashboard that lets administrators:

- **Scan** nearby wireless networks and catalogue their security posture (encryption type, signal strength, client count).
- **Deploy a captive portal** on a controlled access point to demonstrate how credentials can be intercepted over unsecured connections.
- **Detect threats in real time** — the Pi runs continuous monitoring and pushes alerts (rogue APs, deauth floods, ARP spoofing) to the dashboard.
- **Score and track** each assessed network over time with a structured vulnerability history and exportable reports.
- **Manage users and audit trails** — role-based access (admin / superadmin) with full audit logging of every action.

The browser never communicates with the Pi directly; the Express backend acts as a secure relay, signing every command with HMAC and routing traffic through a Tailscale Funnel tunnel.

---

## Key Features

| Feature | Description |
|---|---|
| **Network Scanning** | Discover and profile nearby Wi-Fi networks via the Raspberry Pi |
| **Threat Detection** | Real-time monitoring with live dashboard indicators and alert badges |
| **Security Scoring** | Quantitative risk scoring per network with historical trend charts |
| **Captive Portal Demo** | Controlled AP + portal to illustrate credential interception risks |
| **Device Management** | Remote Raspberry Pi administration (AP control, service status, logs) |
| **User & Role Management** | Admin / superadmin roles, account CRUD, password policies |
| **Audit Logging** | Immutable, append-only audit trail with archival support |
| **Session Persistence** | JWT access tokens (in-memory) + HttpOnly refresh cookies for seamless sessions |

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
npm start             # Express on http://localhost:3000
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

The project is undergoing a phased security hardening process documented in [`SECURITY_HARDENING_PLAN.md`](docs/feature-notes/SECURITY_HARDENING_PLAN.md).

### Current Security Posture: 8/10

| Phase | Name                        | Status       | Key Items                                                      |
|-------|-----------------------------|--------------|----------------------------------------------------------------|
| 0     | Secrets Remediation         | **Done**     | Pi secrets generated, `CONTROL_SIGNING_SECRET` in env (unified HMAC auth for all Pi endpoints) |
| 1     | P0 Infrastructure           | **Done**     | `trust proxy`, Helmet/CSP, rate limiting, env validation, CORS/cookies (`CROSS_ORIGIN_COOKIES`) |
| 2     | Route Auth Lockdown         | **Done**     | `authJWT` + `requireActiveProfile` mounted on all 11 protected route groups; `requireSuperadmin` on audit |
| 3     | Bug Fixes & Info Disclosure | **Partial**  | `rasPiController` audit-log leaks sealed (generic `SCAN_TRIGGER_ERROR` / `SCAN_SAVE_ERROR` codes); residual `err.message` remains in `detectController` audit meta |
| 4     | Deployment Readiness        | **Partial**  | CORS via env, `VITE_API_BASE_URL` in axios; `deviceApi.js` still hardcoded |
| 4.5   | Pi Connectivity Readiness   | Not started  | Funnel URL stability, nginx binding, timeouts, Idempotency-Key |
| 5     | Optional Polish             | **Done**     | UUID validation middleware on device/user/rasPi routes; dead `userValidators.js` removed |
| 6     | Testing Deliverables        | **Done**     | 11 integration + 16 unit Jest suites, Playwright E2E, coverage reports |

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
| [`SECURITY_HARDENING_PLAN.md`](docs/feature-notes/SECURITY_HARDENING_PLAN.md) | Full phased security plan, audit findings, risk notes |
| [`SECURITY_AND_RISKS.md`](docs/SECURITY_AND_RISKS.md)                     | Architectural security model & risk register         |
| [`DEVICE_MANAGEMENT_README.md`](docs/feature-notes/DEVICE_MANAGEMENT_README.md) | Device management feature (AP, portal, scans)   |
| [`AP_ENABLE_PORTAL_README.md`](docs/feature-notes/AP_ENABLE_PORTAL_README.md) | Access Point & captive portal flow                |
| [`ACCOUNTS_FLOW_README.md`](docs/feature-notes/ACCOUNTS_FLOW_README.md)   | User account management flow                         |
| [`AUDIT_README.md`](docs/feature-notes/AUDIT_README.md)                   | Audit logging system                                 |
| [`SESSION_PERSISTENCE_README.md`](docs/feature-notes/SESSION_PERSISTENCE_README.md) | Session persistence & token refresh         |
| [`SAM_CHANGES_README.md`](docs/feature-notes/SAM_CHANGES_README.md)       | Security Assessment Management changes               |
| [`HISTORY_CHANGES_README.md`](docs/feature-notes/HISTORY_CHANGES_README.md) | History/vulnerability tracking changes             |
| [`CHANGES_README.md`](docs/feature-notes/CHANGES_README.md)               | General changelog                                    |
| [`scanREADME.md`](docs/feature-notes/scanREADME.md)                       | Scan workflow                                        |
| [`threatsREADME.md`](docs/feature-notes/threatsREADME.md)                 | Threat detection system                              |
| [`clearListREADME.md`](docs/feature-notes/clearListREADME.md)             | Clear list functionality                             |
| [`PRD_STATUS.md`](docs/feature-notes/PRD_STATUS.md)                       | Whitebox assessment PRD & remediation tracker        |
| [`backend/TESTING.md`](backend/TESTING.md)                               | Backend test guide                                   |
| [`backend/THREATS.md`](backend/THREATS.md)                                | Backend threat model                                 |

---

## Recent UI Changes

The threat detection system now features a **global detection state provider** with a single polling loop, **sidebar status indicators** (green = monitoring, blue = starting, red = failed), a **compact status pill** on the SAM page, and **dismissible out-of-range banners**. See [`CHANGES_README.md`](CHANGES_README.md) for full details.
