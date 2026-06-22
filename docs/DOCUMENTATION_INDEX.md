# Documentation Index

> **Purpose:** Primary entry point for all documentation in `docs/`. Every file is
> categorized by purpose, audience, canonical status, and last-verified date.
> **Last Updated:** 2026-06-22

**Canonical status legend:**
- **canonical** — authoritative, current source of truth for its topic
- **supplementary** — useful detail/history, not the primary reference
- **superseded** — kept for historical reference only; do not treat as current

---

## Project

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`PROJECT_CONTEXT_AND_PRD.md`](./PROJECT_CONTEXT_AND_PRD.md) | High-level project overview, tech stack, repo map, reading order, doc index | New contributors, stakeholders | canonical | 2026-06-22 | All docs (links out) |
| [`CAPSTONE_DOCUMENTATION.md`](./CAPSTONE_DOCUMENTATION.md) | Formal academic write-up of the entire system | Academic reviewers | supplementary | 2026-06-02 (unverified against current MFA/risk-trend work) | PROJECT_CONTEXT_AND_PRD |
| [`feature-notes/PRD_STATUS.md`](./feature-notes/PRD_STATUS.md) | PRD completion/status tracking | Project team | supplementary | needs verification | PROJECT_CONTEXT_AND_PRD |
| [`feature-notes/RASPI_PROJECT_CONTEXT_AND_PRD.md`](./feature-notes/RASPI_PROJECT_CONTEXT_AND_PRD.md) | Pi-side project context/PRD | Pi/firmware contributors | supplementary | needs verification | PROJECT_CONTEXT_AND_PRD |
| [`DOCUMENTATION_INDEX.md`](./DOCUMENTATION_INDEX.md) | This file — categorized index of all docs | Everyone | canonical | 2026-06-22 | — |

## Architecture

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md) | Frontend folder structure, component architecture, routing, layouts, hooks | Frontend devs | canonical | 2026-06-22 | COMPONENT_REFERENCE, PAGES_ROUTES_AND_USER_FLOWS |
| [`API_CONTEXT.md`](./API_CONTEXT.md) | Cross-stack data flow (frontend/backend/DB) | Full-stack devs | supplementary | 2026-06-01 (not verified against MFA work in this pass) | API_INTEGRATION_CONTEXT |

## Frontend

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`COMPONENT_REFERENCE.md`](./COMPONENT_REFERENCE.md) | Full component inventory: purpose, props, dependencies, state | Frontend devs | canonical | 2026-06-22 | FRONTEND_ARCHITECTURE |
| [`PAGES_ROUTES_AND_USER_FLOWS.md`](./PAGES_ROUTES_AND_USER_FLOWS.md) | Every page/route, nav flow, auth flow, user journeys | Frontend devs, QA | canonical | 2026-06-22 | AUTHENTICATION_AND_AUTHORIZATION |
| [`STATE_MANAGEMENT.md`](./STATE_MANAGEMENT.md) | Contexts, hooks, global/shared/auth state | Frontend devs | canonical | 2026-06-22 | FRONTEND_ARCHITECTURE |
| [`UI_UX_SYSTEM_REFERENCE.md`](./UI_UX_SYSTEM_REFERENCE.md) | Current implemented UI: design system, layouts, patterns, MFA screens | Frontend/design | canonical | 2026-06-22 | COMPONENT_REFERENCE |

## Backend

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`BUILD_DEPLOYMENT_RUNTIME.md`](./BUILD_DEPLOYMENT_RUNTIME.md) | Build process, deployment, env vars, CI/CD | DevOps, backend devs | supplementary | needs verification | feature-notes/RAILWAY_DEPLOY_GUIDE |
| [`feature-notes/DASHBOARD_README.md`](./feature-notes/DASHBOARD_README.md) | Dashboard endpoint/service implementation notes | Backend devs | supplementary | needs verification | PAGES_ROUTES_AND_USER_FLOWS |
| [`feature-notes/DEVICE_MANAGEMENT_README.md`](./feature-notes/DEVICE_MANAGEMENT_README.md) | Device management endpoint/service notes | Backend devs | supplementary | needs verification | PAGES_ROUTES_AND_USER_FLOWS |
| [`feature-notes/ASYNC_AP_README.md`](./feature-notes/ASYNC_AP_README.md) | Async AP job lifecycle implementation notes | Backend devs | supplementary | needs verification | feature-notes/AP_ENABLE_PORTAL_README |
| [`feature-notes/AP_ENABLE_PORTAL_README.md`](./feature-notes/AP_ENABLE_PORTAL_README.md) | AP enable/captive portal implementation notes | Backend devs | supplementary | needs verification | feature-notes/ASYNC_AP_README |
| [`feature-notes/CAPTIVE_PORTAL_TIPS_README.md`](./feature-notes/CAPTIVE_PORTAL_TIPS_README.md) | Captive portal tips feature notes | Backend devs | supplementary | needs verification | feature-notes/AP_ENABLE_PORTAL_README |
| [`feature-notes/scanREADME.md`](./feature-notes/scanREADME.md) | Scan trigger/persistence implementation notes | Backend devs | supplementary | needs verification | feature-notes/CHANGES_README |
| [`feature-notes/threatsREADME.md`](./feature-notes/threatsREADME.md) | Threat detection implementation notes | Backend devs | supplementary | needs verification | feature-notes/CHANGES_README |
| [`feature-notes/clearListREADME.md`](./feature-notes/clearListREADME.md) | Vulnerability "clear list" feature notes | Backend/frontend devs | supplementary | needs verification | feature-notes/CHANGES_README |
| [`feature-notes/HISTORY_CHANGES_README.md`](./feature-notes/HISTORY_CHANGES_README.md) | History page/endpoint changelog | Backend/frontend devs | supplementary | needs verification | feature-notes/CHANGES_README |
| [`feature-notes/SESSION_PERSISTENCE_README.md`](./feature-notes/SESSION_PERSISTENCE_README.md) | sessionStorage persistence implementation notes | Frontend devs | supplementary | needs verification | STATE_MANAGEMENT |
| [`feature-notes/EXPORT_README.md`](./feature-notes/EXPORT_README.md) | PDF report export implementation notes | Frontend devs | supplementary | needs verification | feature-notes/SAM_EXPORT_IMPLEMENTATION_PLAN |
| [`feature-notes/SAM_EXPORT_IMPLEMENTATION_PLAN.md`](./feature-notes/SAM_EXPORT_IMPLEMENTATION_PLAN.md) | SAM export live-data wiring plan | Backend/frontend devs | supplementary | needs verification | feature-notes/CHANGES_README, feature-notes/EXPORT_README |
| [`feature-notes/SAM_CHANGES_README.md`](./feature-notes/SAM_CHANGES_README.md) | SAM page changelog | Frontend devs | supplementary | needs verification | feature-notes/CHANGES_README |
| [`feature-notes/AUDIT_README.md`](./feature-notes/AUDIT_README.md) | Audit logging implementation notes | Backend devs | supplementary | needs verification | ACCOUNTS_FLOW_README |
| [`feature-notes/CHANGES_README.md`](./feature-notes/CHANGES_README.md) | Consolidated file-level changelog across sessions (includes MFA merge, risk-trend reporting) | All devs | canonical (as changelog) | 2026-06-22 | ACCOUNTS_FLOW_README, AUTHENTICATION_AND_AUTHORIZATION |

## API

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`API_INTEGRATION_CONTEXT.md`](./API_INTEGRATION_CONTEXT.md) | Every frontend API module, backend endpoints, auth/refresh flow, MFA endpoints | Full-stack devs | canonical | 2026-06-22 | FRONTEND_ARCHITECTURE, AUTHENTICATION_AND_AUTHORIZATION |
| [`feature-notes/API_PY_AND_PUBLIC_PROXY_CONTEXT.md`](./feature-notes/API_PY_AND_PUBLIC_PROXY_CONTEXT.md) | Pi-side FastAPI + public proxy context | Pi/backend devs | supplementary | needs verification | API_INTEGRATION_CONTEXT |

## Authentication

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`AUTHENTICATION_AND_AUTHORIZATION.md`](./AUTHENTICATION_AND_AUTHORIZATION.md) | Auth flows, token lifecycle, route protection, RBAC, **§11 mandatory TOTP MFA/AAL2 (authoritative)** | All devs | canonical | 2026-06-22 (§11), earlier sections need re-verification date | All docs cross-link here for MFA |
| [`MFA_AUTHENTICATION_PLAN.md`](./MFA_AUTHENTICATION_PLAN.md) | Pre-implementation MFA design/planning doc | Historical reference | **superseded** by AUTHENTICATION_AND_AUTHORIZATION §11 | 2026-06-22 (banner added) | AUTHENTICATION_AND_AUTHORIZATION |
| [`feature-notes/ACCOUNTS_FLOW_README.md`](./feature-notes/ACCOUNTS_FLOW_README.md) | Accounts/audit end-to-end flow incl. Reset MFA action | Backend/frontend devs | canonical (accounts domain) | 2026-06-22 | AUTHENTICATION_AND_AUTHORIZATION, CHANGES_README |

## Hardware

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`feature-notes/PI_SIGNING_README.md`](./feature-notes/PI_SIGNING_README.md) | HMAC signing scheme for Pi communication | Backend/Pi devs | canonical (signing domain) | needs verification | SECURITY_AND_RISKS |
| [`feature-notes/RASPI_PROJECT_CONTEXT_AND_PRD.md`](./feature-notes/RASPI_PROJECT_CONTEXT_AND_PRD.md) | Raspberry Pi project context | Pi/firmware devs | supplementary | needs verification | PROJECT_CONTEXT_AND_PRD |
| [`feature-notes/API_PY_AND_PUBLIC_PROXY_CONTEXT.md`](./feature-notes/API_PY_AND_PUBLIC_PROXY_CONTEXT.md) | FastAPI (Pi-side) + proxy context | Pi/backend devs | supplementary | needs verification | API_INTEGRATION_CONTEXT |

## Security

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`SECURITY_AND_RISKS.md`](./SECURITY_AND_RISKS.md) | XSS/CSRF/token risks, API security, MFA/AAL2 posture, known risks | Security reviewers, devs | canonical | 2026-06-22 | AUTHENTICATION_AND_AUTHORIZATION §11 |
| [`feature-notes/SECURITY_HARDENING_PLAN.md`](./feature-notes/SECURITY_HARDENING_PLAN.md) | Phased security hardening plan/progress | Security reviewers | supplementary | needs verification | SECURITY_AND_RISKS |
| [`feature-notes/SECURITY_HEADERS_FRONTEND.md`](./feature-notes/SECURITY_HEADERS_FRONTEND.md) | CSP/header remediation record (ZAP findings) | Frontend/security devs | supplementary | needs verification | SECURITY_AND_RISKS |

## Deployment

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`BUILD_DEPLOYMENT_RUNTIME.md`](./BUILD_DEPLOYMENT_RUNTIME.md) | Build/deploy process, env vars | DevOps | supplementary | needs verification | feature-notes/RAILWAY_DEPLOY_GUIDE |
| [`feature-notes/RAILWAY_DEPLOY_GUIDE.md`](./feature-notes/RAILWAY_DEPLOY_GUIDE.md) | Railway deployment steps | DevOps | supplementary | needs verification | BUILD_DEPLOYMENT_RUNTIME |

## Feature Notes

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`feature-notes/CHANGES_README.md`](./feature-notes/CHANGES_README.md) | Consolidated file-level changelog | All devs | canonical (changelog) | 2026-06-22 | All feature-notes |
| [`feature-notes/FRONTEND_AUDIT_PLAN.md`](./feature-notes/FRONTEND_AUDIT_PLAN.md) | Plan for a frontend documentation audit | Doc maintainers | supplementary | needs verification | This index |
| [`feature-notes/INTEGRATION_TESTING_README.md`](./feature-notes/INTEGRATION_TESTING_README.md) | Integration testing notes | QA/backend devs | supplementary | needs verification | TESTING_AND_QUALITY_ASSURANCE |
| [`feature-notes/UNIT_TESTING_README.md`](./feature-notes/UNIT_TESTING_README.md) | Unit testing notes | QA/backend devs | supplementary | needs verification | TESTING_AND_QUALITY_ASSURANCE |
| [`feature-notes/TESTING_DELIVERABLES.md`](./feature-notes/TESTING_DELIVERABLES.md) | Testing deliverables tracking | QA | supplementary | needs verification | TESTING_AND_QUALITY_ASSURANCE |
| [`feature-notes/SCORING_REFACTOR_CHANGES.md`](./feature-notes/SCORING_REFACTOR_CHANGES.md) | Risk-scoring refactor changelog | Backend devs | supplementary | needs verification | scoring-refactor/WIFI_RISK_SCORE_SPEC |

## Historical Documents

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`wifi_risk_scoring_review.md`](./wifi_risk_scoring_review.md) | Original risk-scoring review/critique | Historical reference | **superseded** by `scoring-refactor/WIFI_RISK_SCORE_SPEC.md` | already cross-linked, no change needed | scoring-refactor/WIFI_RISK_SCORE_SPEC |
| [`scoring-refactor/README.md`](./scoring-refactor/README.md) | Scoring refactor folder overview | Backend devs | supplementary | needs verification | scoring-refactor/WIFI_RISK_SCORE_SPEC |
| [`scoring-refactor/WIFI_RISK_SCORE_SPEC.md`](./scoring-refactor/WIFI_RISK_SCORE_SPEC.md) | Noisy-OR risk scoring spec (implemented) | Backend devs | canonical (scoring domain) | needs verification | wifi_risk_scoring_review |
| [`scoring-refactor/generate_risk_score_doc.py`](./scoring-refactor/generate_risk_score_doc.py) | Script generating the methodology .docx | Backend devs | supplementary | needs verification | scoring-refactor/WIFI_RISK_SCORE_SPEC |
| [`scoring-refactor/WiFi_Risk_Score_Methodology.docx`](./scoring-refactor/WiFi_Risk_Score_Methodology.docx) | Generated methodology document | Stakeholders | supplementary | needs verification | scoring-refactor/WIFI_RISK_SCORE_SPEC |
| [`MFA_AUTHENTICATION_PLAN.md`](./MFA_AUTHENTICATION_PLAN.md) | Pre-implementation MFA design plan | Historical reference | **superseded** by AUTHENTICATION_AND_AUTHORIZATION §11 | 2026-06-22 (banner added) | AUTHENTICATION_AND_AUTHORIZATION |
| [`feature-notes/PRD_STATUS.md`](./feature-notes/PRD_STATUS.md) | Older PRD status snapshot | Historical reference | supplementary | needs verification | PROJECT_CONTEXT_AND_PRD |
| [`superpowers/plans/2026-06-16-docs-audit-and-claude-md-update.md`](./superpowers/plans/2026-06-16-docs-audit-and-claude-md-update.md) | Plan for a prior docs-audit pass | Doc maintainers | supplementary (planning artifact) | 2026-06-16 | This index |
| [`current_sql_schema.sql`](./current_sql_schema.sql) | Database schema dump | Backend devs | supplementary (point-in-time dump) | 2026-06-12 per `CHANGES_README.md` | metrics_views.sql |
| [`metrics_views.sql`](./metrics_views.sql) | DB metrics views | Backend devs | supplementary | needs verification | current_sql_schema.sql |

---

## Testing & QA (cross-cutting)

| Document | Purpose | Audience | Status | Last Verified | Related |
|----------|---------|----------|--------|----------------|---------|
| [`TESTING_AND_QUALITY_ASSURANCE.md`](./TESTING_AND_QUALITY_ASSURANCE.md) | Test architecture, coverage, QA — **§8 MFA manual checklist (authoritative)** | QA, devs | canonical | 2026-06-22 (per audit, §8 confirmed accurate) | AUTHENTICATION_AND_AUTHORIZATION |

---

## Notes on this index

- Files under `feature-notes/` marked "needs verification" were not individually re-read against current code during this pass — their purpose/category is inferred from filename and prior context. Re-verify opportunistically when next touching the related feature.
- `CAPSTONE_DOCUMENTATION.md` (academic write-up, dated 2026-06-02) was **not** updated for MFA or risk-trend reporting in this pass — flagged as a gap, see audit report.
- This index should be updated whenever a new doc is added to `docs/` or an existing doc's canonical status changes.
