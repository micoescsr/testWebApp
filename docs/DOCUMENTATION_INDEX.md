# Documentation Index

This index identifies the final implementation documentation retained for submission. Canonical documents describe the current system; supplementary documents provide feature-specific detail or academic evidence.

Last updated: 2026-08-14.

## Canonical Project Documentation

| Document | Purpose |
|---|---|
| [`PROJECT_CONTEXT_AND_PRD.md`](./PROJECT_CONTEXT_AND_PRD.md) | Implemented project scope, architecture, and product context |
| [`AUTHENTICATION_AND_AUTHORIZATION.md`](./AUTHENTICATION_AND_AUTHORIZATION.md) | Authentication, mandatory TOTP MFA, session lifecycle, and RBAC |
| [`BUILD_DEPLOYMENT_RUNTIME.md`](./BUILD_DEPLOYMENT_RUNTIME.md) | Build, environment configuration, deployment, and runtime behavior |
| [`SECURITY_AND_RISKS.md`](./SECURITY_AND_RISKS.md) | Security controls, trust boundaries, and known-risk register |
| [`TESTING_AND_QUALITY_ASSURANCE.md`](./TESTING_AND_QUALITY_ASSURANCE.md) | Automated and manual test strategy |
| [`FOLDER_STRUCTURE.md`](./FOLDER_STRUCTURE.md) | Submission repository map |
| [`scoring-refactor/WIFI_RISK_SCORE_SPEC.md`](./scoring-refactor/WIFI_RISK_SCORE_SPEC.md) | Implemented deterministic Wi-Fi risk-scoring methodology |

## Architecture and Interface References

| Document | Purpose |
|---|---|
| [`API_CONTEXT.md`](./API_CONTEXT.md) | Cross-stack request and data-flow reference |
| [`API_INTEGRATION_CONTEXT.md`](./API_INTEGRATION_CONTEXT.md) | Frontend API modules and backend endpoint integration |
| [`BACKEND_ARCHITECTURE_ANALYSIS.md`](./BACKEND_ARCHITECTURE_ANALYSIS.md) | Backend layers, processes, and data access |
| [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md) | Frontend structure, routing, and rendering strategy |
| [`COMPONENT_REFERENCE.md`](./COMPONENT_REFERENCE.md) | Frontend component inventory |
| [`PAGES_ROUTES_AND_USER_FLOWS.md`](./PAGES_ROUTES_AND_USER_FLOWS.md) | Routes and user flows |
| [`STATE_MANAGEMENT.md`](./STATE_MANAGEMENT.md) | Context, hook, and session-state behavior |
| [`UI_UX_SYSTEM_REFERENCE.md`](./UI_UX_SYSTEM_REFERENCE.md) | Implemented visual system and interaction patterns |

## Academic and Database References

| Document | Purpose |
|---|---|
| [`CAPSTONE_DOCUMENTATION.md`](./CAPSTONE_DOCUMENTATION.md) | Formal academic system summary |
| [`current_sql_schema.sql`](./current_sql_schema.sql) | Point-in-time database schema reference |
| [`metrics_views.sql`](./metrics_views.sql) | Database metrics views |
| [`scoring-refactor/WiFi_Risk_Score_Methodology.docx`](./scoring-refactor/WiFi_Risk_Score_Methodology.docx) | Human-readable risk methodology artifact |
| [`scoring-refactor/generate_risk_score_doc.py`](./scoring-refactor/generate_risk_score_doc.py) | Reproducible generator for the methodology document |

## Feature and Operations Notes

The retained files under [`feature-notes/`](./feature-notes/) document implemented accounts, audit, dashboard, device/AP orchestration, captive-portal advisories, scanning, threat detection, deployment, signing, security testing, and scoring behavior. They are supplementary to the canonical documents above.

Backend-specific references:

- [`../backend/TESTING.md`](../backend/TESTING.md) - Jest test suite and coverage guide.
- [`../backend/THREATS.md`](../backend/THREATS.md) - backend threat model.

## Retained Security Evidence

| Document | Purpose |
|---|---|
| [`../reports/security_testing_results_post_remediation.md`](../reports/security_testing_results_post_remediation.md) | Final consolidated remediation and verification report |
| [`../reports/security_xss_sqli_bruteforce.md`](../reports/security_xss_sqli_bruteforce.md) | Focused non-destructive XSS, SQL-injection, and rate-limit verification |
