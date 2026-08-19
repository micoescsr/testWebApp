# Why-PII? — Wi-Fi Security Assessment Tool

**Why-PII?** is a full-stack web application that assesses the security of public Wi-Fi access points in communal spaces (cafés, libraries, co-working areas) using a Raspberry Pi microcontroller as a field probe.

## Overview

Public Wi-Fi networks in shared spaces often lack basic protections — no encryption, no client isolation, and no monitoring — leaving users vulnerable to packet sniffing, evil-twin attacks, and session hijacking. **Why-PII?** addresses this by combining a remotely controlled Raspberry Pi with a cloud-hosted dashboard that lets administrators:

- **Scan** nearby wireless networks and catalogue their security posture (encryption type, signal strength, client count).
- **Publish security advisories** through a controlled captive portal without requesting credentials or collecting personal information.
- **Detect supported Wi-Fi threats in real time** — the Pi passively monitors wireless metadata and pushes rule-based alerts to the dashboard.
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
| **Captive Portal Advisories** | Controlled AP + portal that presents assessment-based security guidance without credential entry |
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
# Frontend unit tests
npm test

# Backend unit/integration tests (from the repository root)
cd backend
npm test
npm run test:coverage

# E2E tests (run from the repository root; requires a configured test environment)
cd ..
npm run test:e2e
npm run test:e2e:headed
```

---

## Scope and Security Model

- Assessment is passive-only: the system observes wireless metadata and does not capture packet payloads or authentication handshakes, deauthenticate clients, brute-force networks, or exploit assessed access points.
- Threat classification and risk scoring are deterministic and rule-based; the system does not use AI or machine learning for detection.
- The captive portal presents simplified security guidance derived from assessment results. It does not request or store visitor credentials or personal information.
- Protected web routes use JWT authentication, mandatory TOTP MFA, role checks, rate limiting, input validation, and audit logging.
- Express-to-Pi control requests are HMAC-signed, and secrets are supplied only through environment variables.

See [`SECURITY_AND_RISKS.md`](docs/SECURITY_AND_RISKS.md) for the current security model and risk register.

---

## Documentation Index

| Document                                                                  | Covers                                              |
|---------------------------------------------------------------------------|------------------------------------------------------|
| [`DOCUMENTATION_INDEX.md`](docs/DOCUMENTATION_INDEX.md) | Complete documentation map |
| [`PROJECT_CONTEXT_AND_PRD.md`](docs/PROJECT_CONTEXT_AND_PRD.md) | Implemented scope and product context |
| [`AUTHENTICATION_AND_AUTHORIZATION.md`](docs/AUTHENTICATION_AND_AUTHORIZATION.md) | Authentication, MFA, and RBAC |
| [`BUILD_DEPLOYMENT_RUNTIME.md`](docs/BUILD_DEPLOYMENT_RUNTIME.md) | Build, configuration, and deployment |
| [`SECURITY_AND_RISKS.md`](docs/SECURITY_AND_RISKS.md) | Security model and risk register |
| [`TESTING_AND_QUALITY_ASSURANCE.md`](docs/TESTING_AND_QUALITY_ASSURANCE.md) | Automated and manual test guidance |
| [`WIFI_RISK_SCORE_SPEC.md`](docs/scoring-refactor/WIFI_RISK_SCORE_SPEC.md) | Implemented risk-scoring methodology |
| [`backend/TESTING.md`](backend/TESTING.md) | Backend test guide |
| [`backend/THREATS.md`](backend/THREATS.md) | Backend threat model |
