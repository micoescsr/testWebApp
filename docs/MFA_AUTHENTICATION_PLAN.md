# MFA (TOTP) Authentication — Design & Implementation Plan

## Context

Why-PII? is a security-assessment tool for public Wi-Fi risk (rogue APs, evil
twins, captive-portal credential interception demos). Its own admin/superadmin
accounts are high-value targets — compromising one exposes audit logs, device
controls, and user management. Password-only auth is the weakest link in an
otherwise hardened stack (Helmet, CSP, JWKS verification, HttpOnly refresh
cookies, in-memory access tokens).

**Decision:**
- MFA (TOTP/authenticator app) becomes **mandatory for ALL accounts** (admin +
  superadmin).
- **Single pass** — build schema, backend enforcement, and frontend
  enroll/challenge flows together in one branch, no multi-week staged rollout.

Approach: use **Supabase Auth's native MFA API**
(`auth.mfa.enroll/challenge/verify/listFactors/unenroll`) entirely client-side.
Supabase manages factors in `auth.mfa_factors` — no new TOTP secrets/libraries
on the backend. The JWT `aal` claim (`aal1`/`aal2`) becomes the enforcement
signal, read via the existing JWKS-based `authJWT` middleware
(`backend/middleware/authMiddleware.js:33-44`, currently ignores `payload.aal`).

---

## Phase 0 — Pre-flight checks (do first, no code yet)

1. Confirm Supabase project has **TOTP MFA enabled**: Authentication > Providers
   > Multi-Factor Authentication > "Authenticator App" toggle ON. This is a
   dashboard setting — if off, `mfa.enroll()` will fail at runtime regardless of
   code.
2. Confirm JWT payload actually includes `aal` for this project — enroll a test
   factor on a throwaway user, decode the resulting access token, verify
   `aal: "aal2"` appears after `mfa.verify()`. If absent, MFA must be enabled
   project-wide first (Supabase only emits `aal` once any factor exists for the
   project/user).
3. Confirm `supabase.auth.mfa.*` calls work on the frontend client given
   `persistSession: false` once `setSession()` primes the in-memory session —
   same pattern already used by `src/pages/Auth/ForceResetPassword.jsx:61-83`.

---

## Phase 1 — Schema change

### `profiles` table — add `mfa_enrolled boolean NOT NULL DEFAULT false`

- New migration file (e.g. `docs/migrations/2026XXXX_add_mfa_enrolled.sql`):
  `ALTER TABLE public.profiles ADD COLUMN mfa_enrolled boolean NOT NULL DEFAULT false;`
- Update `docs/current_sql_schema.sql` profiles block (lines 131-144) to match.
- **Advisory only** — used for fast UI checks (Profile page, Accounts table,
  forced-enrollment gate). Kept in sync by backend on enroll/unenroll. Actual
  enforcement is the JWT `aal` claim, so a stale flag can't bypass security —
  worst case it mis-renders UI until next sync.
- `backend/repositories/userRepository.js` — add `mfa_enrolled` to
  `mapRowToProfile()` (default `false` if null).

---

## Phase 2 — Backend: AAL claim, enforcement middleware, sync/recovery endpoints

### 2.1 `backend/middleware/authMiddleware.js`

In both `authJWT` (lines 39-44) and `optionalAuthJWT` (lines 92-97), add:
```js
aal: payload.aal || "aal1",
```
to the `req.user` object. Purely additive — existing consumers unaffected.

### 2.2 New file: `backend/middleware/mfaMiddleware.js`

Export `requireAAL2`:
```js
exports.requireAAL2 = async (req, res, next) => {
  if (req.user?.aal === "aal2") return next();
  return res.status(403).json({
    error: "This action requires multi-factor authentication (AAL2).",
    code: "MFA_REQUIRED",
  });
};
```
- Must run after `authJWT` (needs `req.user.aal`).
- Audit-log a denial event (reason: `aal_insufficient`), following
  `backend/middleware/roleMiddleware.js` pattern for `requireSuperadmin`
  denials.

### 2.3 Apply `requireAAL2` broadly

Since MFA is mandatory for everyone, gate **all `authJWT`-protected routes**
that mutate data or expose sensitive info — i.e. add `requireAAL2` right after
`authJWT, requireActiveProfile` across:
- `backend/routes/userRoutes.js` — all routes (profile updates,
  activate/deactivate/reactivate, list profiles)
- `backend/routes/auditRoutes.js` — `/logs`, `/export`, `/archive` (already
  superadmin-gated, confirmed all three use `authJWT, requireActiveProfile,
  requireSuperadmin`)
- `backend/routes/deviceRoutes.js`, `backend/routes/samRoutes.js`,
  `backend/routes/captivePortalRoutes.js`, `backend/routes/detectRoutes.js`,
  `backend/routes/historyRoutes.js`, `backend/routes/rasPiRoutes.js`,
  `backend/routes/dashboardRoutes.js` — same treatment (all `authJWT`-protected
  per the route protection map in `docs/AUTHENTICATION_AND_AUTHORIZATION.md`).

Exemptions (must NOT require AAL2, since user is establishing 2nd factor or
these are pre-MFA auth steps):
- `/api/auth/login`, `/api/auth/set-refresh`, `/api/auth/refresh`,
  `/api/auth/logout`, `/api/auth/clear-force-reset` — unchanged.
- New `/api/auth/mfa/*` enrollment endpoints (2.4) — enrollment itself happens
  at `aal1`.
- `GET /api/webapp/users/profiles/me` — needed during the forced-enrollment
  gate (frontend must read `mfa_enrolled` status at `aal1` to know whether to
  redirect to `/mfa-setup`). Keep this route AAL2-exempt.

Middleware order: `authJWT, requireActiveProfile, requireAAL2, <role checks>,
<validators>, controller`.

### 2.4 New controller: `backend/controllers/mfaController.js`

- `POST /api/auth/mfa/sync-status` (`authJWT, requireActiveProfile` — no AAL2
  required). Body: `{ enrolled: boolean }`. Backend re-derives truth via
  `supabaseAdmin.auth.admin.mfa.listFactors({ userId: req.user.id })` if
  available in the installed `@supabase/supabase-js` Admin API; otherwise
  trusts the frontend-supplied factor list from
  `supabase.auth.mfa.listFactors()` and sets
  `mfa_enrolled = factors.some(f => f.status === 'verified')`. Updates
  `profiles.mfa_enrolled`. Audit log `USER.MFA_ENROLLED` /
  `USER.MFA_UNENROLLED`.

- `POST /api/auth/mfa/admin-unenroll/:id` (`authJWT, requireActiveProfile,
  requireAAL2, requireSuperadmin, validateUUID('id')`) — recovery for lost
  devices. Uses `supabaseAdmin.auth.admin.mfa.listFactors/deleteFactor` if the
  Admin API supports it; if not, sets `profiles.mfa_enrolled = false` +
  audit-logs `USER.MFA_RESET`, and documents that the superadmin must also
  remove the factor via Supabase Dashboard (Auth > Users > [user] > Remove MFA
  factor) as a manual fallback. Response: `{ ok: true, message: "MFA factors
  removed. User must re-enroll on next login." }`.

### 2.5 New route file: `backend/routes/mfaRoutes.js`

Mount at `/api/auth/mfa` in `backend/server.js` alongside `authRoutes`. Routes:
- `POST /api/auth/mfa/sync-status` -> `authJWT, requireActiveProfile, mfaController.syncStatus`
- `POST /api/auth/mfa/admin-unenroll/:id` -> `authJWT, requireActiveProfile, requireAAL2, requireSuperadmin, validateUUID('id'), mfaController.adminUnenroll`

Optional: light rate limiter (`mfaLimiter`, ~20/15min) on `sync-status` in
`backend/middleware/rateLimiter.js`, following existing `loginLimiter` pattern.

---

## Phase 3 — Frontend: Login flow + AAL2 challenge

### 3.1 `src/pages/Login/Login.jsx`

After step 1 (`signInWithPassword`, lines 22-31) succeeds and `session` is
extracted (line 33), BEFORE `setAccessToken` (line 37):

- Call `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` — requires session,
  so prime via `supabase.auth.setSession({ access_token: session.access_token,
  refresh_token: session.refresh_token })` first (real refresh_token available
  here, unlike `ForceResetPassword.jsx`'s dummy-token case).
- If `nextLevel === "aal2" && currentLevel === "aal1"` → MFA challenge
  required:
  - `supabase.auth.mfa.listFactors()` → get verified TOTP factor
    (`data.totp[0]`).
  - Render `MFAChallenge` component (3.2) instead of proceeding.
  - On `mfa.verify()` success → returns new session with `aal: "aal2"` — use
    THIS session's tokens for the remaining steps (`setAccessToken`,
    `set-refresh`).
- If no challenge needed (shouldn't normally happen once MFA is mandatory, but
  handle gracefully — e.g. brand-new account that hasn't enrolled yet) →
  proceed with original session; the forced `/mfa-setup` gate (3.3) will catch
  it.
- Steps 4-6 (profile status check, `must_change_password` check, redirect)
  unchanged.

### 3.2 New component: `src/pages/Auth/MFAChallenge.jsx`

- Props: `factorId`, `onVerified(session)`, `onCancel()` (calls
  `supabase.auth.signOut()` to drop the `aal1` session, returns to login form).
- UI: "Enter the 6-digit code from your authenticator app" + 6-digit numeric
  input (auto-submit at 6 digits) + Verify button + cancel/back link. Reuse
  `src/pages/Auth/Auth.css` classes (`auth-page`, `auth-card`, `auth-title`,
  `auth-form`, `error-text`) for visual consistency with `ForgotPassword.jsx`.
- On mount: `supabase.auth.mfa.challenge({ factorId })` → store `challengeId`.
- On submit: `supabase.auth.mfa.verify({ factorId, challengeId, code })`.
- If challenge expired (~5min) on verify failure → auto re-`challenge()` for a
  fresh `challengeId`, let user retry.

### 3.3 `src/App.jsx` — forced `/mfa-setup` gate for everyone

- During bootstrap (after `auth/refresh` succeeds), fetch
  `webapp/users/profiles/me` (mirrors `Login.jsx` step 4) and store
  `{ role, mfaEnrolled, status }` in app state.
- New route: `<Route path="/mfa-setup" element={isAuthenticated ? <MFASetup
  mode="forced" /> : <Navigate to="/login" replace />} />` next to
  `/force-reset-password`.
- In the protected `/*` route tree: if `isAuthenticated && mfaEnrolled ===
  false` → `<Navigate to="/mfa-setup" replace />` instead of rendering
  Sidebar/main layout (mirrors existing `mustReset` handling in
  `Login.jsx:83-86`, but as a persistent gate since a user could land on
  `/dashboard` directly after a session refresh).

---

## Phase 4 — Frontend: Enrollment flow

### 4.1 New component: `src/pages/Auth/MFASetup.jsx`

Two modes via prop:
- `mode="forced"` — full-page route `/mfa-setup`, no sidebar, no skip/cancel
  (cancel = logout). Used by the App.jsx gate (3.3) for any user without a
  verified factor.
- `mode="self-service"` — embedded in Profile page (4.2) for users who already
  have MFA and want to re-enroll (e.g. new device) — unenroll old factor
  first, then enroll new one.

Flow (both modes):
1. Prime session via `setSession()` (same pattern as
   `ForceResetPassword.jsx:61-83`), required because `persistSession: false`.
2. `supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator App" })`
   → returns `{ id: factorId, totp: { qr_code, secret, uri } }`.
3. Display QR (`<img src={totp.qr_code}>`, it's a data URI) + `secret` as text
   with copy-to-clipboard fallback for manual entry.
4. User enters 6-digit code → `mfa.challenge({ factorId })` →
   `mfa.verify({ factorId, challengeId, code })`.
5. On success:
   - `verify()` returns new session with `aal: "aal2"` —
     `setAccessToken(newSession.access_token)` +
     `api.post("auth/set-refresh", { refresh_token: newSession.refresh_token })`
     so the CURRENT session immediately reflects AAL2 (avoids being bounced
     back by `requireAAL2` on the very next action).
   - `POST /api/auth/mfa/sync-status` with `{ enrolled: true }`.
   - `mode="forced"` → `window.location.replace("/dashboard")`.
   - `mode="self-service"` → success message, refresh `mfa_enrolled` via
     `useProfile`.
6. Abandoned enrollment cleanup: "Start over" button calls
   `mfa.unenroll({ factorId })` for the unverified factor before a fresh
   `enroll()` (Supabase enforces a max factor count).

### 4.2 `src/pages/Profile/Profile.jsx` — MFA section

- New "Two-Factor Authentication" card:
  - If `mfaEnrolled === true`: "Enabled" badge + "Re-enroll (new device)"
    button → opens `MFASetup` (mode="self-service") which unenrolls old factor
    then re-enrolls. No "Disable" option since MFA is mandatory for everyone.
  - If `mfaEnrolled === false` (shouldn't normally be reachable due to the
    forced gate, but handle defensively): prompt to complete setup, link to
    `/mfa-setup`.
- `src/hooks/useProfile.js` — map `mfa_enrolled` → `mfaEnrolled` (mirrors
  existing camelCase mapping for `firstName`/`lastName`).

### 4.3 New shared component: `src/components/auth/TotpQrDisplay.jsx`

Presentational: takes `qrCodeSvg` (data URI) + `secret`, renders QR image +
masked/revealable secret + copy button. Used by `MFASetup.jsx`.

---

## Phase 5 — Recovery (admin-assisted reset)

- Covered by `POST /api/auth/mfa/admin-unenroll/:id` (2.4).
- `src/pages/AccountsAudit/AccountsAudit.jsx` +
  `src/components/accounts/AccountsTable.jsx` — add a "Reset MFA" per-row
  action (any user, since MFA is mandatory for all roles now), calling
  `adminUnenrollMfa(id)` (new function in `src/api/userApi.js`). Follow
  existing `activateUserWithTemp`/`deactivateUser` action + confirmation-modal
  pattern (`AccountsAuditModal`). On success: "MFA has been reset for this
  user. They will be prompted to re-enroll on next login."
- No native recovery codes in Supabase TOTP — document in
  `docs/AUTHENTICATION_AND_AUTHORIZATION.md` that recovery is always
  admin-assisted.
- Edge case: sole superadmin loses device with no other superadmin available →
  document "break glass" procedure: Supabase Dashboard > Authentication >
  Users > select user > remove MFA factor manually. Document only, no UI.

---

## Phase 6 — Testing

### Backend (Jest)
- `backend/__tests__/unit/mfaMiddleware.test.js` (new): `requireAAL2` allows
  `aal2`, rejects `aal1`/`undefined` with 403 + `code: "MFA_REQUIRED"`. Verify
  audit log call (mock `auditRepository`, follow `auditLogger.test.js`
  pattern).
- `backend/__tests__/integration/authorization.test.js` — extend: mock
  `jwtVerify` to return `aal: "aal1"` vs `"aal2"`, hit an AAL2-protected test
  route added to `backend/__tests__/helpers/testApp.js`, assert 403/200
  accordingly. No `otplib` needed backend-side — backend never verifies TOTP
  codes, only the `aal` claim.
- `backend/__tests__/integration/mfaController.test.js` (new): `sync-status`
  updates `mfa_enrolled` + audit log; `admin-unenroll/:id` — 403 for
  non-superadmin, 200 + `USER.MFA_RESET` audit + `mfa_enrolled=false` for
  superadmin.
- `backend/__tests__/integration/auth.test.js` — no changes; `/api/auth/login`
  itself is unchanged (MFA challenge happens client-side against Supabase
  GoTrue).

### E2E (Playwright)
- Add `otplib` as a **frontend devDependency only** (`npm install -D otplib`)
  — generates valid TOTP codes from a known secret for test automation.
- `e2e/mfa-enrollment.spec.js`: login as test user (no MFA — pre-Phase-6 seed
  data must NOT have `mfa_enrolled`), land on forced `/mfa-setup`, scrape
  `secret` via `data-testid="totp-secret"` on `MFASetup.jsx`, compute code
  with `otplib`, submit, assert redirect to `/dashboard`.
- `e2e/mfa-login-challenge.spec.js`: pre-seeded user with TOTP already enrolled
  (secret in env var `TEST_TOTP_SECRET`), login, assert `MFAChallenge` screen,
  compute code, submit, assert dashboard loads.
- `e2e/helpers/auth.js` — add `loginWithMfa(page, email, password, totpSecret)`
  wrapping `login()` + challenge handling.
- Update existing Playwright fixtures/seed data: since MFA is mandatory, any
  existing E2E flows that log in must now either (a) use `loginWithMfa`, or
  (b) the seeded test accounts need MFA pre-enrolled via Supabase Admin API in
  test setup, with secrets available to the test runner.

### Manual checklist (add to `docs/TESTING_AND_QUALITY_ASSURANCE.md`)
- Fresh account login → forced to `/mfa-setup` → scan QR → verify → reaches
  dashboard.
- Logout/login again → MFA challenge appears → correct code → dashboard.
- Wrong code 3x → error shown, no account lockout (only challenge retry).
- `aal1` token directly against an AAL2-gated route (curl) → 403
  `MFA_REQUIRED`.
- Superadmin resets another user's MFA → that user forced through
  `/mfa-setup` again on next login.
- Re-enroll (new device) via Profile → old factor replaced, AAL2 still
  enforced.

---

## File-by-file change list

### New files
- `backend/middleware/mfaMiddleware.js` — `requireAAL2`
- `backend/controllers/mfaController.js` — `syncStatus`, `adminUnenroll`
- `backend/routes/mfaRoutes.js` — mounts under `/api/auth/mfa`
- `backend/__tests__/unit/mfaMiddleware.test.js`
- `backend/__tests__/integration/mfaController.test.js`
- `docs/migrations/<timestamp>_add_mfa_enrolled.sql`
- `src/pages/Auth/MFAChallenge.jsx`
- `src/pages/Auth/MFASetup.jsx`
- `src/components/auth/TotpQrDisplay.jsx`
- `e2e/mfa-enrollment.spec.js`
- `e2e/mfa-login-challenge.spec.js`

### Modified files
- `docs/current_sql_schema.sql` — add `mfa_enrolled` to `profiles`
- `backend/middleware/authMiddleware.js` — add `aal` to `req.user`
- `backend/repositories/userRepository.js` — map `mfa_enrolled`
- `backend/routes/userRoutes.js`, `auditRoutes.js`, `deviceRoutes.js`,
  `samRoutes.js`, `captivePortalRoutes.js`, `detectRoutes.js`,
  `historyRoutes.js`, `rasPiRoutes.js`, `dashboardRoutes.js` — add
  `requireAAL2` after `authJWT, requireActiveProfile` (except `GET
  /webapp/users/profiles/me`, which stays AAL2-exempt)
- `backend/server.js` — mount `mfaRoutes`
- `backend/middleware/rateLimiter.js` — optional `mfaLimiter`
- `src/pages/Login/Login.jsx` — AAL2 check + conditional `MFAChallenge` render
- `src/pages/Profile/Profile.jsx` — MFA section (re-enroll)
- `src/hooks/useProfile.js` — map `mfaEnrolled`
- `src/App.jsx` — fetch profile during bootstrap, forced `/mfa-setup` gate for
  ALL authenticated users without `mfaEnrolled`, new route
- `src/pages/Auth/Auth.css` — QR display layout additions if needed
- `e2e/helpers/auth.js` — `loginWithMfa` helper
- `package.json` (frontend) — `otplib` devDependency
- `docs/AUTHENTICATION_AND_AUTHORIZATION.md` — document MFA architecture, AAL2
  enforcement, recovery/break-glass, Supabase dashboard prerequisite
- `docs/TESTING_AND_QUALITY_ASSURANCE.md` — manual MFA checklist

---

## Open questions to verify during implementation

1. Exact `@supabase/supabase-js` v2.90/v2.93 Admin API surface for
   `auth.admin.mfa.listFactors`/`deleteFactor` (per-user) — needed for
   `admin-unenroll`. Fallback: Dashboard-only manual removal + audit-log
   endpoint.
2. Confirm `aal` claim present in issued JWTs (Phase 0.2) — if absent, check
   Supabase project Auth settings.
3. Migration path for **existing accounts**: on first deploy, all existing
   users have `mfa_enrolled = false` → everyone gets forced to `/mfa-setup` on
   next login. This is acceptable (per "mandatory for everyone"), and the
   AAL2 route-gating (2.3) should not be flipped on until the enrollment UI
   (Phase 3-4) is deployed and reachable — otherwise existing users with
   `aal1` tokens get 403'd on routes before they can even reach `/mfa-setup`
   (mitigated since `/mfa-setup` page itself + `GET profiles/me` are
   AAL2-exempt, so the gate redirect always works).

---

## Verification

1. Run backend: `cd backend && npm test` — new/extended Jest suites pass.
2. Run frontend dev server + backend, manually walk through:
   - Fresh login (no MFA enrolled) → redirected to `/mfa-setup` → scan QR with
     real authenticator app → verify code → reach `/dashboard`.
   - Logout → login again → `MFAChallenge` screen → enter code → dashboard.
   - Attempt a superadmin action (e.g. user list) with an `aal1` token via
     curl → expect 403 `MFA_REQUIRED`.
   - Superadmin "Reset MFA" on another account → that account forced to
     `/mfa-setup` again on next login.
3. `npx playwright test e2e/mfa-enrollment.spec.js e2e/mfa-login-challenge.spec.js`
   (requires test Supabase project with MFA enabled + seed data adjustments).
