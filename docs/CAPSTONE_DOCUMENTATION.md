# Capstone Documentation — Why-PII? Wi-Fi Security Assessment Tool

> **Project Title:** Why-PII? — Wi-Fi Security Assessment Web Application  
> **Platform:** Full-Stack Web Application (React SPA + Express API + Raspberry Pi)  
> **Domain:** Cybersecurity / Network Security Assessment  
> **Generated:** 2026-06-02

---

## 1. Abstract

Why-PII? is a full-stack web application designed to assess the security posture of public Wi-Fi access points in communal spaces such as cafés, libraries, and co-working areas. The system combines a remotely controlled Raspberry Pi field probe with a cloud-hosted dashboard, enabling network administrators to scan wireless networks, detect real-time threats, generate CVSS-based risk scores, and produce exportable security assessment reports.

The application implements a three-tier architecture: a React single-page application (frontend), an Express.js API server (backend), and a FastAPI-powered Raspberry Pi (hardware probe). Communication between the backend and the Pi is secured via HMAC-signed requests routed through a Tailscale Funnel tunnel, ensuring the Pi never exposes endpoints directly to the browser.

---

## 2. Problem Statement

Public Wi-Fi networks in shared spaces frequently lack fundamental security controls:

- **No encryption** — traffic transmitted in cleartext
- **No client isolation** — users on the same network can intercept each other's traffic
- **No monitoring** — rogue access points and active attacks go undetected
- **No assessment** — administrators lack tools to quantify and track wireless security risk

These gaps expose users to packet sniffing, evil-twin attacks, deauthentication floods, and session hijacking. Why-PII? addresses this by providing a structured, repeatable assessment framework with real-time threat detection capabilities.

---

## 3. System Objectives

| Objective | Implementation |
|-----------|---------------|
| Passive Wi-Fi scanning | Raspberry Pi captures IEEE 802.11 management frames without joining networks |
| Vulnerability assessment | Rule-based scoring using CVSS base scores for detected misconfigurations |
| Real-time threat detection | Continuous monitoring for rogue APs, deauthentication attacks, evil twins |
| Risk scoring | Quantitative risk percentages (0–100%) with classification bands |
| Captive portal advisories | Controlled AP with assessment-based security guidance; no credential or personal-data collection |
| Report generation | Exportable PDF reports with charts, findings, and NIST/OWASP recommendations |
| Multi-user management | Role-based access control (admin/superadmin) with audit logging |
| Historical tracking | Vulnerability and threat history across scans |

---

## 4. System Architecture

### 4.1 High-Level Architecture

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

### 4.2 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React, Vite, React Router, Recharts, Axios | 19.2, 7.2, 7.11, 3.6, 1.13 |
| Backend | Express, Node.js, Supabase SDK | 5.2, 18+, 2.90 |
| Database | PostgreSQL via Supabase | — |
| Authentication | Supabase Auth, JWT (JWKS), HttpOnly cookies | — |
| Hardware | Raspberry Pi, FastAPI, nginx | — |
| Tunnel | Tailscale Funnel | — |
| Hosting | Railway | — |
| Testing | Jest, Playwright, Supertest | 30.2, 1.58, 7.2 |

### 4.3 Frontend Architecture

The frontend follows a **hook-driven, service-layer architecture**:

- **Pages** are thin route-level components that compose hooks and sub-components
- **Hooks** encapsulate data fetching, state management, and business logic
- **API modules** provide service functions wrapping a shared Axios instance
- **Context providers** share global state (network selection, threat detection)
- **Components** are presentation-only, receiving data via props

### 4.4 Backend Architecture

The backend follows **MVC with service/repository layers**:

```
routes/ → controllers/ → services/ → repositories/ → Supabase SDK → PostgreSQL
                                   → utils/piFetch → Raspberry Pi (HMAC-signed)
```

### 4.5 Authentication Architecture

| Component | Mechanism |
|-----------|-----------|
| Client-side auth | Supabase JS `signInWithPassword()` |
| Access token | In-memory module variable (prevents XSS theft from storage) |
| Refresh token | HttpOnly cookie (prevents JS access) |
| Token refresh | Auto via Axios 401 interceptor → `POST /auth/refresh` |
| JWT verification | JWKS-based (Supabase public key endpoint) |
| Session bootstrap | `POST /auth/refresh` on protected page load |

---

## 5. Database Schema

The system uses 16 primary tables in PostgreSQL (Supabase):

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts with roles, statuses, force-reset flags |
| `networks` | Scanned Wi-Fi networks with risk scores and AP state |
| `network_memberships` | User-to-network role assignments |
| `scans` | Scan records with risk scores |
| `vulnerability_scans` | Detailed vulnerability scan records with idempotency |
| `vulnerabilities_threat` | Individual vulnerability/threat findings per scan |
| `vulnerability_threat_details` | Master catalog of vulnerability/threat definitions |
| `vulnerability_threat_events` | Time-series event log for findings |
| `vulnerability_threat_recommendations` | Remediation recommendations per finding |
| `detection_state` | Singleton row tracking real-time detection lifecycle |
| `scan_locks` | Concurrent scan prevention |
| `audit_logging` | Immutable audit trail with old/new values |
| `audit_logging_archive` | Archived audit records |
| `captive_portal` | Portal configuration per network |
| `captive_portal_announcements` | Portal announcement content |
| `captive_portal_tips` | Security tips for portal |
| `terms_conditions` | Terms and conditions versions |
| `wifi_risk_scale` | Risk classification reference data |
| `dashboard` | Dashboard configuration per network |
| `report` | Report generation records |
| `raspAP_configuration` | Access point configuration per network |

---

## 6. Feature Modules

### 6.1 Dashboard Module

**Purpose:** Aggregated and per-network security overview with interactive charts.

| Component | Function |
|-----------|----------|
| `Dashboard.jsx` | Page orchestrator |
| `useDashboard` | Data fetching and view mode management |
| `SummarySection` | Aggregated risk charts (Recharts) |
| `NetworkSection` | Per-network detail charts |
| `DashboardHeader` | View mode and scan selector |

**Data sources:** `GET /dashboard/summary`, `GET /dashboard/network/{id}`

### 6.2 Security Assessment Management (SAM)

**Purpose:** Vulnerability scanning, threat detection, and report generation.

| Component | Function |
|-----------|----------|
| `SAM.jsx` | Main feature page (18,949 bytes — largest) |
| `useSAM` | Networks, vulnerabilities, threats, detection lifecycle (607 lines) |
| `VulnerabilitiesTable` | Filterable, sortable, paginated vulnerability listing |
| `ThreatsTable` | Live threat monitoring table |
| `SAMSidebar` | Network selection and scan controls |
| `ExportDropdown` | PDF report export (overall + per-network) |

**Key algorithms:**
- **Threat accumulation:** `mergeThreats()` de-duplicates by ID, merges sessions by `firstSeen`, updates live fields
- **Session mapping:** `mapThreatRowsToParentSessions()` normalizes backend data into parent/session hierarchy
- **Severity derivation:** CVSS score → `CRITICAL (≥9)`, `HIGH (≥7)`, `MEDIUM (≥4)`, `LOW (<4)`

### 6.3 Device Management

**Purpose:** Raspberry Pi access point control and captive portal management.

| Component | Function |
|-----------|----------|
| `DeviceManagement.jsx` | Page with AP controls |
| `useDevice` | Complex async job orchestration (1,207 lines — most complex hook) |
| `AccessPointPanel` | AP toggle UI with progress |

**Key patterns:**
- **Async job cascade:** Submit toggle → poll job → poll live state → confirm → refresh DB
- **Timeout reconciliation:** On 502/503/504 gateway errors, schedules checks at 3s, 10s, 20s, 35s, 50s, 60s
- **State persistence:** Job ID/status in `sessionStorage` survives page refresh

### 6.4 Accounts & Audit

**Purpose:** Superadmin-only user management and audit trail.

| Component | Function |
|-----------|----------|
| `AccountsAudit.jsx` | Tabbed page (25,081 bytes) |
| `UserForm` | User editing with role/status management |
| `AuditLogsTable` | Server-paginated, searchable, exportable |

**Features:** Activate with temp password, deactivate (with optional anonymization), reactivate, CSV export with rate limiting.

### 6.5 Captive Portal

**Purpose:** Controlled access point with configurable portal content.

| Content Type | Management |
|-------------|------------|
| Announcements | Create, view history, per-network |
| Terms & Conditions | Versioned, per-network |
| Security Tips | Ordered list, per-network |
| Risk Classification | Synced from assessment data |

### 6.6 Report Generation

**Purpose:** Exportable PDF security assessment reports.

| Report Type | Content |
|-------------|---------|
| Overall (all networks) | Executive summary, risk distribution, network comparison, remediation plan |
| Per-network | Network summary, observed findings, detailed impact, recommendations, risk trend |

**Technology:** HTML templates with inline CSS + Plotly.js CDN for charts → `window.print()` for PDF.

---

## 7. Security Implementation

### 7.1 Security Layers

| Layer | Implementation |
|-------|---------------|
| Transport | HTTPS (Railway + Tailscale) |
| Authentication | JWT + HttpOnly refresh cookies |
| Authorization | RBAC (admin/superadmin) + per-route middleware |
| API Protection | Helmet CSP, CORS whitelist, rate limiting |
| Input Validation | `express-validator` schemas |
| Pi Communication | HMAC-signed requests |
| Data Protection | Supabase SDK (no raw SQL), audit logging |
| Error Handling | Global error handler (no stack traces leaked) |

### 7.2 Security Hardening Status

| Phase | Status | Description |
|:---:|:------:|-------------|
| 0 | ✅ | Secrets remediation, HMAC auth |
| 1 | ✅ | Helmet, CSP, rate limiting, env validation |
| 2 | ✅ | JWT auth on all routes, role middleware |
| 3 | ⚠️ | Most info leaks sealed, some residual |
| 4 | ⚠️ | CORS/env done, `deviceApi.js` hardcoded |
| 5 | ✅ | UUID validation middleware |
| 6 | ✅ | Jest + Playwright tests |

---

## 8. Risk Scoring Model

### Scoring Methodology

| Aspect | Approach |
|--------|----------|
| Impact | CVSS base scores |
| Likelihood | Binary presence (detected = 100%) |
| Mapping | Rule-based (predefined lookup table) |
| AI/ML | Not used |

### Risk Classification Bands

| Band | Range | UI Color |
|------|-------|----------|
| None | 0% | Green `#4caf50` |
| Low | 1–39% | Orange `#ff9800` |
| Medium | 40–69% | Yellow `#fbc02d` |
| High | 70–89% | Dark orange `#f57c00` |
| Critical | 90–100% | Red `#d32f2f` |

### Scanning Methodology

- **Passive-only:** Listens for IEEE 802.11 management frames (beacons, probe responses, authentication, association, deauthentication)
- **No transmission:** Does not send data or attempt to join networks
- **No exploitation:** Does not attempt to exploit any weakness
- **Time-limited:** Scan duration per network is bounded

---

## 9. Testing Strategy

| Test Type | Tool | Scope | Status |
|-----------|------|-------|:------:|
| Backend Unit | Jest | Controllers, services, utils | ✅ |
| Backend Integration | Jest + Supertest | API endpoints | ✅ |
| E2E | Playwright (Chromium) | Full user flows | ✅ |
| Frontend Unit | None | Hooks, components | ❌ Gap |
| Security | Burp/ZAP | API, auth, injection | Manual |
| Lint | ESLint | Code style | ✅ |
| Security Lint | Custom PS1 script | Backend security patterns | ✅ |

---

## 10. User Roles and Permissions

| Permission | admin | superadmin |
|------------|:-----:|:----------:|
| View Dashboard | ✓ | ✓ |
| Run Security Assessments | ✓ | ✓ |
| Manage Device/AP | ✓ | ✓ |
| View Scan History | ✓ | ✓ |
| View/Edit Profile | ✓ | ✓ |
| Manage User Accounts | ✗ | ✓ |
| View Audit Logs | ✗ | ✓ |
| Export Audit Logs | ✗ | ✓ |
| Issue Temp Passwords | ✗ | ✓ |
| Activate/Deactivate Users | ✗ | ✓ |

---

## 11. Application Routes

| Route | Component | Auth | Purpose |
|-------|-----------|:----:|---------|
| `/login` | Login | ✗ | User authentication |
| `/forgot-password` | ForgotPassword | ✗ | Password reset request |
| `/reset-password` | ResetPassword | ✗ | Set new password |
| `/force-reset-password` | ForceResetPassword | ✓ | Mandatory password change |
| `/dashboard` | Dashboard | ✓ | Security overview |
| `/security-assessment` | SAM | ✓ | Assessment & detection |
| `/device-management` | DeviceManagement | ✓ | AP & portal management |
| `/accounts-audit` | AccountsAudit | ✓* | User & audit management |
| `/history` | History | ✓ | Historical scan data |
| `/profile` | Profile | ✓ | User profile |

\* Superadmin only

---

## 12. API Endpoint Summary

| Group | Endpoints | Auth | Purpose |
|-------|:---------:|:----:|---------|
| Auth | 5 | Mixed | Login, logout, refresh, set-refresh, clear-force-reset |
| WebApp | 7 | ✓ | User profiles, vulnerability data |
| Dashboard | 4 | ✓ | Summary, per-network, network lists, scan lists |
| RasPi | 4 | ✓ | Network listing, scanning, AP signal |
| SAM | 4 | ✓ | Threat/vulnerability definitions and details |
| Device | 6 | ✓ | AP toggle, job polling, live state, portal updates |
| Captive Portal | 11 | ✓ | Announcements, tips, terms, risk, sync |
| Detect | 4 | ✓ | Start, stop, status, poll |
| History | 2 | ✓ | Vulnerability/threat history |
| Audit | 2 | ✓* | Audit logs, CSV export |
| Health | 1 | ✗ | Uptime check |
| Internal | 1 | Token | Pi smoke test |

---

## 13. Limitations and Future Work

### Current Limitations

1. **Passive scanning only** — cannot detect all attack types or misconfigurations
2. **Single Pi support** — architecture assumes one Raspberry Pi device
3. **No AI/ML** — risk scoring is rule-based only
4. **No frontend unit tests** — React component/hook testing is a gap
5. **In-memory rate limiter** — not shared across server instances
6. **No self-registration** — users must be created by superadmin
7. **No real-time notifications** — no WebSocket/push notifications (polling only)

### Recommended Future Work

1. **WebSocket integration** — Replace polling with real-time push for threat detection
2. **Multi-device support** — Support multiple Raspberry Pi probes
3. **Frontend testing** — Add Vitest + React Testing Library for hooks and components
4. **Redis rate limiter** — Replace in-memory store for multi-instance deployments
5. **Machine learning** — Anomaly detection for threat identification
6. **Mobile app** — Native mobile client for field assessments
7. **Automated remediation** — Trigger configuration changes based on findings
8. **Compliance mapping** — Map findings to NIST 800-153, PCI DSS, ISO 27001

---

## 14. Documentation Cross-References

| Document | Content |
|----------|---------|
| [PROJECT_CONTEXT_AND_PRD.md](./PROJECT_CONTEXT_AND_PRD.md) | Full project overview and tech stack |
| [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) | Frontend patterns and folder structure |
| [PAGES_ROUTES_AND_USER_FLOWS.md](./PAGES_ROUTES_AND_USER_FLOWS.md) | Route inventory and user flow diagrams |
| [COMPONENT_REFERENCE.md](./COMPONENT_REFERENCE.md) | Component inventory with props |
| [API_INTEGRATION_CONTEXT.md](./API_INTEGRATION_CONTEXT.md) | API client, endpoints, interceptors |
| [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) | Context, hooks, persistence strategy |
| [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md) | Auth flows, tokens, RBAC |
| [BUILD_DEPLOYMENT_RUNTIME.md](./BUILD_DEPLOYMENT_RUNTIME.md) | Build, deploy, environment config |
| [SECURITY_AND_RISKS.md](./SECURITY_AND_RISKS.md) | Security posture and known risks |
| [UI_UX_SYSTEM_REFERENCE.md](./UI_UX_SYSTEM_REFERENCE.md) | Design system and accessibility |
| [TESTING_AND_QUALITY_ASSURANCE.md](./TESTING_AND_QUALITY_ASSURANCE.md) | Test strategy and QA checklist |
| `SECURITY_HARDENING_PLAN.md` (root) | Full security hardening plan |
| `current_sql_schema.sql` (root) | Complete database schema |
| `README.md` (root) | Project README |
