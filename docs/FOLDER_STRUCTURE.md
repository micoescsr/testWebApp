# Folder Structure

Monorepo, two independent npm projects: root = frontend, `backend/` = Express API. Install deps separately in each.

```
testWebApp/
├── src/                        # Frontend (React/Vite)
│   ├── api/                    # Axios-based API modules (one per backend resource)
│   │   ├── axios.js             #   shared instance, 401 refresh-queue logic lives here only
│   │   ├── authApi.js, userApi.js, deviceApi.js, dashboardApi.js,
│   │   │   samApi.js, samHistoryApi.js, auditApi.js, detectApi.js, rasPiApi.js
│   ├── components/              # Shared/presentational components, grouped by feature
│   │   ├── accounts/ auth/ common/ dashboard/ device/ history/ modals/ profile/ sam/
│   ├── pages/                   # Route-level views, one folder per route group
│   │   ├── AccountsAudit/ Auth/ Dashboard/ DeviceManagement/ History/
│   │   │   Login/ Profile/ SAM/ TestAuth/   (TestAuth = dev-only QA harness, excluded from prod build)
│   ├── context/                 # React context providers
│   │   ├── NetworkContext.jsx
│   │   ├── ThreatDetectionContext.jsx   # wraps entire authenticated route tree, single global poll loop
│   │   └── ToastContext.jsx
│   ├── hooks/                   # Custom hooks (data fetching, pagination, table controls, etc.)
│   ├── lib/
│   │   └── supabaseClient.js
│   ├── utils/                   # Frontend pure helpers
│   ├── data/                    # Static/seed data for UI
│   ├── assets/                  # Images, icons, static assets
│   └── layouts/                 # Page layout wrappers
│
├── backend/                     # Express API (separate npm project)
│   ├── server.js                 # entrypoint; global error handler (never leaks err.message/stack)
│   ├── routes/                   # URL → controller wiring
│   ├── controllers/              # Request/response handling
│   ├── services/                  # Business logic (apJobStore, authService, dashboardService, detectStateService)
│   ├── repositories/              # DB access layer (Supabase JS SDK only — zero raw SQL)
│   ├── utils/                     # Pure functions — fully unit-tested, coverage-enforced
│   │   ├── scoring.js / riskPipeline.js   # bucketize(score), version bump, portal auto-patch cooldown
│   │   ├── signing.js / piFetch.js         # HMAC-SHA256 request signing to Pi
│   │   └── normalization.js, sorting.js, exportFormatters.js, reportAggregations.js, ...
│   ├── middleware/                 # authMiddleware, mfaMiddleware, roleMiddleware, rateLimiter, statusMiddleware, ...
│   ├── config/                     # envValidation.js, supabaseClient.js
│   ├── migrations/                 # *.sql migration files
│   ├── seeds/                      # DB seed scripts
│   ├── scripts/                    # One-off/maintenance scripts
│   ├── validators/                 # Request payload validation
│   ├── __tests__/                  # unit/, integration/, fixtures/, helpers/
│   ├── jest.config.js
│   └── package.json
│
├── e2e/                          # Playwright end-to-end tests + helpers/
├── public/                       # Static assets served as-is
├── docs/                         # Project documentation (see docs/DOCUMENTATION_INDEX.md)
│   ├── feature-notes/             # Per-feature design/implementation notes
│   ├── scoring-refactor/
│   └── superpowers/plans/
├── patches/                       # Dependency patches
├── qa-results/, reports/, test-results/   # Generated test/QA artifacts (not source)
│
├── .claude/                       # Claude Code config: CLAUDE.md, rules.md, skills/, worktrees/
├── .agents/skills/                 # Portable/marketplace skill packs (tool-agnostic, outside .claude/)
├── .vscode/
├── .vite-cache/
│
├── vite.config.js                 # CSP headers here must stay in sync with backend/server.js (Helmet)
├── eslint.config.js
├── playwright.config.js
├── package.json / package-lock.json     # frontend deps
└── index.html
```

## Key layering rule (backend)

`routes/` → `controllers/` → `services/` + `repositories/` → `config/supabaseClient.js`

New pure-function logic goes in `backend/utils/` (unit-tested, coverage-enforced). Most scoring/formatting bugs belong there, not in controllers.

See [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) for full architecture rules and non-negotiables, and [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md) for the full docs map.
