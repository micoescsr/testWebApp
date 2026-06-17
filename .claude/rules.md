# Repository Rules

Engineering handbook for contributing to this repository: philosophy, workflow, conventions, and the pre-completion checklist. Pairs with **[`.claude/CLAUDE.md`](CLAUDE.md)**, which holds project context and non-negotiable repo facts (stack, architecture map, immutable constraints). Read CLAUDE.md first. This file references its facts rather than restating them.

## Engineering Philosophy

1. Prefer consistency over cleverness.
2. Preserve architecture before optimizing.
3. Make the smallest correct change.
4. Security is more important than convenience.
5. Explicit code is preferred over magical abstractions.
6. Match existing patterns before introducing new ones.
7. Optimize for maintainability by future contributors.
8. If multiple implementations exist, follow the dominant pattern — see "Dominant Patterns" below for what that means in this repo.

## Change Philosophy

- Make the smallest correct change.
- Preserve existing architecture unless explicitly asked to redesign.
- Avoid touching unrelated files.
- Prefer extending existing components over creating new ones.
- Match the dominant pattern in the repository.
- Don't refactor working code just because it could be cleaner.

## Workflow

- Backend (`backend/`) and root (frontend) are independent npm projects — `npm install` separately, never assume one's `node_modules` covers the other.
- Backend is CommonJS (`require`/`module.exports`). Frontend is ESM (`import`/`export`). Don't mix module systems within a project.
- No GitHub Actions exist (`.github/workflows` is absent). Verification today is manual (`npm test`, backend's `lint:security` PowerShell script). Don't silently add CI — confirm scope first if asked.

## Architecture Awareness

See `CLAUDE.md` → Architecture for the file/layer map (`routes/ → controllers/ → services/ + repositories/ → config/supabaseClient.js`, plus Frontend and Pi/FastAPI structure). Behavioral rules on top of that map:

- `controllers/`: orchestration, request/response shaping, try/catch → HTTP status. No direct Supabase calls for entity CRUD — go through a repository.
- `repositories/`: own row-mapping (`mapRowToProfile`-style explicit field projection) and throw on Supabase error; never swallow errors silently.
- `services/`: cross-cutting business logic that isn't tied to one entity (e.g. `detectStateService`, `dashboardService`).
- New pure-function logic goes in `backend/utils/`, not inline in a controller (see CLAUDE.md for why — coverage thresholds).
- `src/api/*Api.js`: thin wrappers over the single shared `src/api/axios.js` instance. Never create a second axios instance or duplicate the 401-refresh-queue logic.
- `src/hooks/`: wrap api calls + local state for a feature; pages/components consume hooks, not raw api modules, where a hook already exists.
- Cross-cutting state uses React Context (`NetworkContext`, `ThreatDetectionContext`, `ToastContext`) — no Redux/Zustand/MobX. Don't introduce a new state library.

## Coding Principles

- No TypeScript anywhere (no `tsconfig.json`). Don't introduce `.ts`/`.tsx` files without an explicit ask — the codebase is deliberately plain JS/JSX.
- ESLint flat config (`eslint.config.js`) allows `no-unused-vars` for names matching `^[A-Z_]` (constants) — don't disable this rule elsewhere just to silence an unused var; rename or remove it instead.
- Field allowlisting before any DB write: build an explicit `updates = {}` object from named fields (see `updateUser`, `reactivateUser` in `userController.js`), never spread `req.body` into a Supabase `.update()`/`.insert()` call.
- Self-action guards: any destructive admin action (delete, deactivate) must explicitly block acting on the actor's own account.

## Project Conventions

- Audit logging: every mutating admin action calls `logAuditEvent({req, actorId, eventName, eventStatus, entityType, entityIdUuid, oldValues, newValues, meta})` on **both** the success and failure path. The failure-path call is wrapped in `.catch(() => {})` so an audit-log failure never crashes the response — preserve this wrapping.
- Role checks: prefer `roleMiddleware` (`requireSuperadmin`) over inline `getCurrentUserRole()` + manual `if (role !== "superadmin") return res.status(403)`. The inline pattern is repeated through `userController.js` but is debt, not something to copy into new controllers — `roleMiddleware` is the only path wired to the required `AUTHORIZATION.DENIED` audit event.
- Validators live in `backend/validators/` (express-validator), separate from controller logic — don't inline ad hoc validation in a controller when a validator file pattern already exists for that route group.
- Migrations: numbered sequentially (`001_`, `002_`, …) in `backend/migrations/*.sql`, additive-only style. No down-migrations exist today — don't add destructive `DROP TABLE`/`ALTER … DROP COLUMN` without explicit user sign-off.
- Comment convention for security-motivated changes: phase/ticket-tagged inline comments (`// Phase 5-B: …`, `// AUTH-008: …`) explaining *why*, not what. Preserve this style for new hardening work; don't strip existing tags during refactors.
- Dead code left intentionally: large commented-out blocks (e.g. old `createUser` in `userController.js`) carry a note on why/where the logic moved. Don't delete these as "cleanup" — they're breadcrumbs. If you do remove one, fold the same why/where note into `docs/feature-notes/CHANGES_README.md` per existing changelog discipline.

## Refactoring

- Don't refactor working code outside the scope of the current task, even if you spot something cleaner.
- If you find an inconsistency (e.g. inline role check vs `roleMiddleware`), fix it only in the file/function you're already touching for the task — don't sweep the whole codebase uninvited. Flag the broader inconsistency to the user instead.

## Error Handling

- Global error handler in `server.js` is the last middleware, exactly 4 params `(err, req, res, next)`, with explicit special-cases (JSON parse failure, CORS rejection) before the generic 500 — don't add new special-cases above the generic fallback without keeping that ordering.
- **Known debt, not a pattern to copy**: `authController.js` and `userController.js` currently leak `error.message` to the client in several `res.status(...).json({ error: error.message })` calls. This violates the CLAUDE.md "never leak error details" rule. Don't replicate this in new code; if you touch one of these functions for an unrelated reason, consider fixing the leak as a small adjacent correction (not a separate unscoped refactor PR).

## Testing & Verification

- Jest + Supertest, split `__tests__/unit/` vs `__tests__/integration/`. Mock only at the `supabaseClient` boundary (`jest.mock`) — real Express app, routes, and middleware run in integration tests. Don't mock at the repository layer.
- Coverage thresholds in `backend/jest.config.js` are enforced only for `utils/` and `middleware/`, even though `collectCoverageFrom` also lists `controllers/services/routes`. Don't assume controller/service logic is safety-netted by coverage just because it's collected — write targeted tests for new controller logic anyway.

### Before marking a task complete, verify:
- Does this follow the existing architecture?
- Did I introduce a new pattern unnecessarily?
- Did I duplicate existing functionality?
- Did I bypass validation or middleware?
- Are security checks preserved?
- Are audit logs preserved?
- Are error messages sanitized?
- Did I modify unrelated files?
- Did I test the affected behavior?
- Would an experienced maintainer approve this change?

## Security

The canonical non-negotiable list lives in `CLAUDE.md` → Non-Negotiables (error leak prevention, zero raw SQL, CSP parity, auth status check, single axios refresh path). Don't restate it here — apply it, plus:

- CSP parity (`backend/server.js` Helmet vs `vite.config.js`) is two independently hand-maintained lists with no shared constant — treat any CSP change as touching both files, not one.
- HMAC signing format (`utils/signing.js`) must stay byte-identical to the Pi-side verifier (`docs/feature-notes/PI_SIGNING_README.md`) — treat any change here as a coordinated cross-repo change, not a local one.
- Field allowlisting and self-action guards (Coding Principles, above) are privilege-escalation/data-loss risks if skipped, not style nits — treat them as security-tier, not optional polish.

## Database

- All access via Supabase JS SDK (`config/supabaseClient.js`) — no raw SQL outside `backend/migrations/*.sql`.
- New migrations are additive and numbered next in sequence; don't renumber or edit a previously-applied migration file.
- Repository functions always project an explicit shape (`mapRowToProfile`) rather than returning raw Supabase rows — follow this when adding a new repository.

## Git Safety

- Standard Claude Code git safety applies (no force-push, no `--no-verify`, new commits not amendments, etc.) — see global instructions; nothing repo-specific overrides them.
- Update `docs/feature-notes/CHANGES_README.md` for every change, dated, with file/problem/cause/fix — established discipline for this repo, don't skip it.

## Performance

- See `CLAUDE.md` → Architecture/Known Pitfalls for the heartbeat-loop and in-memory-rate-limiter facts. Rule: don't "fix" the rate limiter's multi-instance limitation as a side effect of unrelated work — it needs a deliberate, scoped change (e.g. moving to a shared store) if ever addressed.

## Documentation

- Feature-specific docs live in `docs/feature-notes/*.md` — check for an existing note before assuming undocumented behavior; add a new note for substantial new features rather than only relying on code comments.

## Things to Avoid

- Don't add a second axios instance or duplicate the refresh-queue logic outside `src/api/axios.js`.
- Don't add inline role checks when `roleMiddleware` covers the case.
- Don't spread `req.body` directly into a Supabase write.
- Don't introduce TypeScript, Redux, or other heavy dependencies without discussion.
- Don't strip phase/ticket-tagged comments or "moved to X" breadcrumbs during cleanup.
- Don't assume `controllers/`/`services/`/`routes/` are coverage-gated — they're collected but not threshold-enforced.

## Ask Before...

- Adding any CI workflow (none exist today).
- Writing a destructive migration (`DROP`, `ALTER … DROP COLUMN`).
- Renumbering or editing an already-applied migration.
- Introducing a new frontend state-management library or TypeScript.
- Changing the HMAC canonical string format in `signing.js` (cross-repo breaking with the Pi).
- Removing intentionally-preserved dead code/comment breadcrumbs instead of just not extending them.
