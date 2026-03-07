# Accounts & Audit — End-to-End Flow

> Last updated: March 6, 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Model](#data-model)
3. [Roles & Permissions](#roles--permissions)
4. [Account Lifecycle](#account-lifecycle)
5. [Authentication Flow](#authentication-flow)
6. [Temporary Password Flow](#temporary-password-flow)
7. [Deactivation & Archival Flow](#deactivation--archival-flow)
8. [Audit Logging](#audit-logging)
9. [Frontend — Accounts & Audit Page](#frontend--accounts--audit-page)
10. [API Reference](#api-reference)
11. [What Was Improved](#what-was-improved)
12. [What's Still Missing / TODO](#whats-still-missing--todo)

---

## Architecture Overview

```
┌─────────────────────────┐
│   React Frontend (Vite) │
│   src/pages/             │
│   AccountsAudit.jsx      │
│         │                │
│   src/api/userApi.js ────┼──► HTTP (Bearer JWT)
│   src/api/authApi.js ────┼──► HTTP
└─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Express Backend         │
│  backend/server.js       │
│         │                │
│  Middleware Chain:        │
│   authMiddleware.js ─────┼──► JWKS JWT verification (Supabase P-256)
│   roleMiddleware.js ─────┼──► Superadmin role check
│   statusMiddleware.js ───┼──► Active profile check
│         │                │
│  Controllers:            │
│   authController.js      │
│   userController.js      │
│         │                │
│  Repositories:           │
│   userRepository.js      │
│   auditRepository.js     │
└─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Supabase                │
│  ├── auth.users          │   Supabase Auth (passwords, sessions)
│  ├── profiles            │   App data (role, status, name, etc.)
│  └── audit_logging       │   Compliance audit trail
└─────────────────────────┘
```

---

## Data Model

### `profiles` table

| Column                 | Type        | Description                                        |
|------------------------|-------------|----------------------------------------------------|
| `id`                   | UUID (PK)   | Matches `auth.users.id` (FK)                      |
| `first_name`           | text        | User's first name                                  |
| `last_name`            | text        | User's last name                                   |
| `username`             | text        | Unique username                                    |
| `email`                | text        | Email address (anonymized on deactivation — set to placeholder due to NOT NULL constraint) |
| `role`                 | text        | `superadmin` · `admin` · `user`                    |
| `status`               | text        | `active` · `on_hold` · `inactive`                  |
| `must_change_password` | boolean     | True when a temp password has been issued          |
| `temp_expires_at`      | timestamptz | When the temp password expires (24h window)        |
| `created_at`           | timestamptz | Row creation time                                  |
| `updated_at`           | timestamptz | Last update time                                   |

### `audit_logging` table

| Column              | Type                         | Description                                |
|---------------------|------------------------------|--------------------------------------------|
| `audit_log_id`      | bigint (PK)                  | Auto-increment                             |
| `created_at`        | timestamptz                  | When the event occurred                    |
| `actor_profile_id`  | UUID (FK → profiles)         | Who performed the action                   |
| `event_name`        | text                         | e.g. `USER_UPDATE`, `LOGIN_SUCCESS`        |
| `event_status`      | enum (`OK`·`FAIL`·`DENY`)   | Outcome of the action                      |
| `entity_type`       | text                         | e.g. `USER`, `AUTH`                        |
| `entity_id_uuid`    | UUID                         | Target entity ID                           |
| `entity_id_bigint`  | bigint                       | Target entity ID (integer variant)         |
| `old_values`        | jsonb                        | Snapshot before change                     |
| `new_values`        | jsonb                        | Snapshot after change                      |
| `meta`              | jsonb                        | Extra context (reason, anonymized, etc.)   |
| `actor_ip`          | text                         | IP address of the actor                    |
| `user_agent`        | text                         | Browser user-agent string                  |

---

## Roles & Permissions

| Role         | Can access dashboard | Can manage users | Can view audit logs | Can deactivate accounts |
|--------------|---------------------|------------------|---------------------|------------------------|
| `superadmin` | ✅                  | ✅               | ✅                  | ✅                     |
| `admin`      | ✅                  | ❌               | ❌                  | ❌                     |
| `user`       | ✅                  | ❌               | ❌                  | ❌                     |

> **Legacy note:** The `staff` role was removed from the UI. Any existing profiles with `role = 'staff'` are displayed as `user` in the frontend, but a DB migration should be run to clean them up (see [TODO](#whats-still-missing--todo)).

---

## Account Lifecycle

```
                    ┌──────────────┐
  Superadmin        │  CREATE      │   Supabase auth.admin.createUser()
  creates user ────►│  (active)    │   Profile row auto-created via trigger
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │  ACTIVE  │ │ ON_HOLD  │ │  INACTIVE    │
        │ Can log  │ │ Login    │ │ Login blocked │
        │ in       │ │ blocked  │ │ PII anonymized│
        └────┬─────┘ └────┬─────┘ └──────┬───────┘
             │             │              │
             │◄──edit──────┘              │
             │◄──activate (+ opt temp pw)─┘
             │                            ▲
             └──deactivate (archive) ─────┘
```

### Status Meanings

| Status     | Login | Data    | Description                                    |
|------------|-------|---------|------------------------------------------------|
| `active`   | ✅    | Full    | Normal operational state                       |
| `on_hold`  | ❌    | Full    | Suspended — data preserved, login blocked      |
| `inactive` | ❌    | Anonymized | Deactivated — PII stripped, profile archived in audit logs |

### Status Transitions

| From → To     | How it happens                  | Password behavior                                  |
|---------------|----------------------------------|----------------------------------------------------|
| active → on_hold  | Superadmin edits status      | Password preserved                                 |
| active → inactive | Superadmin clicks Deactivate | PII anonymized, auth password **scrambled** (unrecoverable), `must_change_password` cleared |
| on_hold → active  | Superadmin edits status      | Admin chooses: keep existing PW *or* issue temp PW |
| on_hold → inactive | Superadmin clicks Deactivate | PII anonymized, auth password **scrambled** (unrecoverable) |
| inactive → active | Superadmin clicks Reactivate | Temp password **always** issued (old password was scrambled on deactivation) |
| inactive → on_hold | Superadmin clicks Reactivate | Password preserved (scrambled — admin must later activate to active to issue temp PW) |

---

## Authentication Flow

### Normal Login

```
Frontend                    Backend                         Supabase
   │                           │                               │
   │  POST /api/auth/login     │                               │
   │  { email, password }      │                               │
   │──────────────────────────►│                               │
   │                           │  POST /auth/v1/token          │
   │                           │  (with ANON key)              │
   │                           │──────────────────────────────►│
   │                           │◄──────────────────────────────│
   │                           │                               │
   │                           │  Check profiles table:        │
   │                           │  - must_change_password?       │
   │                           │  - temp_expires_at expired?    │
   │                           │                               │
   │  { token, user }         │   (or mustChangePassword flag) │
   │◄──────────────────────────│                               │
   │                           │                               │
   │  POST /api/auth/set-refresh                               │
   │  { refresh_token }        │                               │
   │──────────────────────────►│  Sets HttpOnly sb_refresh     │
   │                           │  cookie (30d, lax, /api/auth) │
   │◄──────────────────────────│                               │
```

### Login Blocked Scenarios

| Scenario                      | HTTP    | Error code               | User sees                              |
|-------------------------------|---------|--------------------------|----------------------------------------|
| Wrong credentials             | 401     | —                        | "Invalid login credentials"            |
| Account on_hold               | 403     | —                        | "Account is not active" (statusMiddleware) |
| Account inactive              | 403     | —                        | "Account is not active" (statusMiddleware) |
| Temp password expired         | 401     | `TEMP_PASSWORD_EXPIRED`  | "Temporary password has expired..."    |

### Token Refresh

```
Frontend                    Backend                         Supabase
   │                           │                               │
   │  POST /api/auth/refresh   │                               │
   │  (HttpOnly cookie sent)   │                               │
   │──────────────────────────►│                               │
   │                           │  POST /auth/v1/token          │
   │                           │  grant_type=refresh_token     │
   │                           │──────────────────────────────►│
   │                           │◄──────────────────────────────│
   │                           │                               │
   │                           │  Rotate sb_refresh cookie     │
   │  { access_token }         │                               │
   │◄──────────────────────────│                               │
```

---

## Temporary Password Flow

When a superadmin activates a user from `on_hold` or `inactive` and chooses to issue a temp password:

```
1. Superadmin edits user → changes status to "active" → Save
2. Confirm modal appears with checkbox:
   ☑ "Issue a temporary password (forces password reset on first login)"
3. Superadmin confirms
4. Backend: POST /profiles/:id/activate-with-temp
   a. Updates profile: status=active, must_change_password=true, temp_expires_at=now+24h
   b. Generates crypto-random temp password (base64url, 32 bytes)
   c. Updates Supabase auth password via admin API
   d. Logs USER_ACTIVATE audit event
   e. Returns { tempPassword, tempExpiresAt }
5. Frontend shows Temp Password modal:
   - Displays the temp password + Copy button
   - Shows "Expires at: [datetime] (Xh Xm remaining)"
   - Outside click disabled (must click Close)
6. User logs in with temp PW
   a. Backend checks temp_expires_at — if expired → blocks with TEMP_PASSWORD_EXPIRED
   b. If valid → returns { token, mustChangePassword: true, tempExpiresAt }
   c. Frontend should redirect to password change page (⚠ NOT YET IMPLEMENTED)
```

### Temp Password States (shown in UserForm)

| State         | Condition                                          | Color   | Label                                 |
|---------------|----------------------------------------------------|---------|---------------------------------------|
| `none`        | `!must_change_password && !temp_expires_at`        | Gray    | "No pending reset"                    |
| `temp_issued` | `must_change_password && temp_expires_at > now`    | Amber   | "Temp PW issued (expires in Xh Xm)"  |
| `expired`     | `must_change_password && temp_expires_at <= now`   | Red     | "Temp PW expired"                     |
| `temp_used`   | `must_change_password && !temp_expires_at`         | Blue    | "Password change required"            |

---

## Deactivation & Archival Flow

```
1. Superadmin opens user → clicks "Deactivate Account"
2. Confirm modal appears with red warning panel:
   - Status set to Inactive — login immediately blocked
   - Personal info (name, email, username) anonymized
   - Original profile data archived in audit logs for compliance
   - Audit history preserved and linked to this account
   - Reversible by setting status back to Active/On Hold
3. Superadmin confirms
4. Backend: POST /profiles/:id/deactivate
   a. Captures full profile snapshot (archivedProfile)
   b. Updates profile:
      - status = "inactive"
      - must_change_password = false
      - temp_expires_at = null
      - first_name = "Deactivated"
      - last_name = "User"
      - username = "deactivated_{id_prefix}"
      - email = "deactivated_{id_prefix}@deactivated.local"
   c. **Scrambles Supabase Auth password** — replaces the user's password with a
      crypto-random value (64 bytes, base64url). This makes the old password
      permanently unrecoverable, even if the account is later reactivated.
   d. Logs USER_DEACTIVATE audit event:
      - old_values = full archived profile snapshot
      - new_values = the anonymized values
      - meta = { anonymized: true, archived: true, reason: "..." }
   e. Returns { message, profile, archived: true }
5. User list refreshes — deactivated user shows anonymized info
```

### Why Archive?

- **Compliance**: The full profile data (name, email, username, role) is preserved in `audit_logging.old_values` as a JSONB snapshot
- **Reversibility**: A superadmin can edit the account back to active/on_hold, but the PII will need to be manually re-entered
- **Security**: Login is immediately blocked, PII is stripped from the active database, **auth password is scrambled** so the old password is permanently unrecoverable, and the audit trail is untouched
- **Reactivation safety**: Because the password is scrambled on deactivation, reactivating to "active" status **always** generates a new temporary password — there is no option to "keep existing password"

---

## Audit Logging

### Event Types

| Event Name          | Trigger                              | Status   | Archived Data            |
|---------------------|--------------------------------------|----------|--------------------------|
| `LOGIN_SUCCESS`     | Successful login                     | OK       | —                        |
| `LOGIN_FAILED`      | Wrong credentials                    | FAIL     | email, reason            |
| `LOGIN_TEMP_EXPIRED`| Login with expired temp PW           | FAIL     | email, temp_expires_at   |
| `USER_CREATE`       | New user created                     | OK/FAIL  | new profile              |
| `USER_UPDATE`       | Profile edited                       | OK/FAIL  | old + new values         |
| `USER_ACTIVATE`     | Activated with temp PW               | OK/FAIL  | new status + flags       |
| `USER_DEACTIVATE`   | Deactivated + archived               | OK/FAIL  | full old profile + new   |
| `USER_DELETE`       | User hard-deleted                    | OK/FAIL  | old profile              |

### Audit Table UI (8 columns)

| Column   | Source                                     |
|----------|--------------------------------------------|
| USER     | Actor (who performed the action)           |
| EVENT    | Human-readable event name                  |
| TARGET   | Who/what was affected (from old/new values)|
| DETAILS  | One-line change summary (inline)           |
| DATE     | Date portion of timestamp                  |
| TIME     | Time portion of timestamp                  |
| MODULE   | Category badge (AUTH, ACCOUNTS, SYSTEM...) |
| STATUS   | OK / FAIL / DENY badge                     |

Rows are expandable — clicking shows IP, entity ID, and a full field-by-field diff of old → new values.

---

## Frontend — Accounts & Audit Page

### File Map

| File | Purpose |
|------|---------|
| `src/pages/AccountsAudit/AccountsAudit.jsx` | Main page — tabs, modals, state management |
| `src/components/accounts/UserForm.jsx` | Add/Edit user form with role, status, deactivate |
| `src/components/accounts/AccountsTable.jsx` | User list table |
| `src/components/accounts/AuditLogsTable.jsx` | Audit logs table with expand/collapse + export modal |
| `src/components/modals/AccountsAuditModal/AccountsAuditModal.jsx` | Modal wrapper |
| `src/components/common/Modal/BaseModal.jsx` | Base modal (overlay close control) |
| `src/api/userApi.js` | API calls: updateUser, activateUserWithTemp, deactivateUser |
| `src/api/authApi.js` | API calls: login, refresh, logout |
| `src/hooks/useSessionState.js` | Session-storage-backed useState for tab persistence |

### Tab Persistence

The active tab (Accounts vs Audit Logs) is persisted across page refreshes using `useSessionState` with key `wf:accountsAuditTab`. When a user is on the Audit Logs tab and refreshes the page, they remain on the Audit Logs tab instead of being reset to the default Accounts tab.

### Modal Modes

| Mode        | Trigger                    | Confirm button     | Action on confirm                   |
|-------------|----------------------------|--------------------|--------------------------------------|
| `add`       | "Add a New User" button    | "Confirm"          | Create user (not yet wired)          |
| `edit`      | Click user row → Edit      | "Confirm"          | PUT /profiles/:id + optional temp PW |
| `delete`    | Click Delete in form       | "Confirm" (red)    | DELETE /profiles/:id                 |
| `deactivate`| Click "Deactivate Account" | "Deactivate" (red) | POST /profiles/:id/deactivate        |

### Key UX Behaviors

- **Outside-click protection**: Modal overlay click is disabled during processing (`isProcessing` state)
- **Activation checkbox**: When changing from non-active → active, a checkbox appears: "Issue a temporary password"
- **Temp PW modal**: Cannot be dismissed by clicking outside — must click Close
- **Inactive users**: Shown with a yellow banner, "Deactivate Account" button is hidden, status dropdown shows a note
- **Legacy staff migration**: If a user has `role = 'staff'`, the form displays it as `user`

---

## API Reference

### Auth Routes (`/api/auth/`)

| Method | Path                  | Auth Required | Description                   |
|--------|-----------------------|---------------|-------------------------------|
| POST   | `/login`              | No            | Login with email + password   |
| POST   | `/set-refresh`        | No            | Store refresh token in cookie |
| POST   | `/refresh`            | No (cookie)   | Exchange cookie for new JWT   |
| POST   | `/logout`             | No            | Clear refresh cookie          |

### User Routes (`/api/webapp/users/`)

| Method | Path                          | Auth | Role       | Description                        |
|--------|-------------------------------|------|------------|------------------------------------|
| GET    | `/profiles/me`                | JWT  | Any        | Get current user's profile         |
| GET    | `/profiles`                   | JWT  | Superadmin | List all profiles                  |
| PUT    | `/profiles/:id`               | JWT  | Superadmin | Update user profile                |
| DELETE | `/profiles/:id`               | JWT  | Superadmin | Hard-delete user                   |
| POST   | `/profiles/:id/activate-with-temp` | JWT | Superadmin | Activate + issue temp PW     |
| POST   | `/profiles/:id/deactivate`    | JWT  | Superadmin | Deactivate + archive profile |

---

## What Was Improved

These changes were implemented across tickets AUTH-007, AUTH-008, UI-001 through UI-003, UI-006, and UI-007.

### UI-001 — Status Text Clarity
- **Before**: Status dropdown showed raw values (`active`, `on_hold`)
- **After**: Shows descriptive labels — "Active — Can log in normally" / "On Hold — Login suspended, data preserved"
- **Plus**: Dynamic helper text below the dropdown explains what the selected status means

### UI-002 — Remove Legacy "staff" Role
- **Before**: Role dropdown included `staff` as an option
- **After**: Dropdown only shows `superadmin`, `admin`, `user`
- **Migration**: Frontend auto-converts `staff` → `user` in the form `useEffect`

### UI-003 — Reset Slot State Machine
- **Before**: No visibility into temp password state
- **After**: `getResetSlotState()` function derives state from `must_change_password` + `temp_expires_at` → shows color-coded labels (gray/amber/red/blue) in the UserForm footer

### UI-006 — Remove "inactive" from Status Dropdown
- **Before**: Admins could set status to "inactive" via dropdown (unintended)
- **After**: Dropdown only has `active` and `on_hold`; inactive users get a yellow warning banner instead. Deactivation is a separate intentional action.

### UI-007 — Modal Outside-Click Protection
- **Before**: Clicking outside the modal during a save/deactivate operation would close it and lose progress
- **After**: `BaseModal` has `disableOverlayClose` prop; the confirm modal disables overlay close and buttons while `isProcessing` is true

### AUTH-007 — Temp Password Expiry Visibility
- **Before**: No way to know if a temp password was expired
- **After**:
  - Backend login checks `temp_expires_at` — blocks with `TEMP_PASSWORD_EXPIRED` if expired
  - Activation response returns `tempExpiresAt`
  - Temp PW modal shows "Expires at [datetime] (Xh Xm remaining)"
  - UserForm shows temp state label (e.g., "Temp PW expired" in red)

### AUTH-008 — Activation Password Choice
- **Before**: Activating a user from on_hold/inactive always forced a temp password, even if the admin just wanted to reactivate with the existing password
- **After**: Confirm modal shows a checkbox — admin explicitly chooses whether to issue a temp PW. If unchecked, `must_change_password` and `temp_expires_at` are cleared so the existing password stays valid.

### Deactivation & Archival (Reset Slot redesign)
- **Before**: "Reset Slot" button was vague and confusing
- **After**: Replaced with "Deactivate Account" button with a full confirmation flow:
  - Red warning panel listing consequences
  - Backend archives full profile snapshot in audit log `old_values`
  - PII (name, email, username) anonymized in the live database
  - Self-deactivation blocked

### Audit Log Table Improvements
- **Before**: 6 columns (USER, EVENT, DATE, TIME, MODULE, STATUS)
- **After**: 8 columns — added **TARGET** (who was affected) and **DETAILS** (one-line change summary)
- New event name mappings: `USER_DEACTIVATE`, `LOGIN_TEMP_EXPIRED`, `USER_RESET_SLOT`
- Inline change summaries (e.g., "role: admin → user, status: on_hold → active")

### SEC-001 — Deactivation Password Scramble (March 6, 2026)
- **Before**: Deactivating a user only set `status = inactive` and anonymized PII. The Supabase Auth password was left intact, meaning if the account was later reactivated the admin could choose to "keep existing password" — the old credentials survived deactivation.
- **After**: On deactivation, the backend now **scrambles the Supabase Auth password** with a crypto-random 64-byte value (`crypto.randomBytes(64).toString("base64url")`). The old password is permanently destroyed and can never be used again, even if the account is reactivated.
- **Files changed**: `backend/controllers/userController.js` → `deactivateUser()`

### SEC-002 — Mandatory Temp Password on Reactivation (March 6, 2026)
- **Before**: When reactivating a deactivated account to "active" status, the confirm modal showed a checkbox letting the admin choose whether to issue a temporary password. The admin could uncheck it to "keep existing password," but after deactivation the old password was scrambled (see SEC-001), so this option was misleading and would leave the user unable to log in.
- **After**:
  - **Frontend**: The temp password checkbox is removed from the reactivation confirm modal. An info box now explains: *"For security, the old password cannot be recovered after deactivation. A new temporary password will be generated and must be given to the user."*
  - **Backend**: The `reactivateUser()` controller now **always** generates a temp password when `targetStatus === "active"`, regardless of the `issueTempPassword` flag sent by the frontend. This enforces the security policy at the API level.
  - The `reactivateIssueTempPw` state variable was removed from the frontend (no longer needed).
- **Files changed**: `backend/controllers/userController.js` → `reactivateUser()`, `src/pages/AccountsAudit/AccountsAudit.jsx`

### BUG-001 — Deactivate Button Fix in Edit Modal (March 6, 2026)
- **Before**: Clicking "Deactivate Account" in the Edit User modal's UserForm could silently fail. The `confirmAction` function would catch API errors but only log them to `console.error` — no user-visible feedback. Additionally, the cleanup code (closing modals, clearing state) ran unconditionally even when the API call failed, causing the modal to close without any indication of failure.
- **After**:
  - `handleDeactivate()` now validates that the user object has an `id` before proceeding, falling back to `selectedUser` if needed.
  - `confirmAction()` uses an `actionSucceeded` flag — modals and state are only cleaned up on success. On failure, an `alert()` displays the error message so the admin knows something went wrong.
  - Optional chaining (`selectedUser?.id`) used for null safety in the deactivate and reactivate branches.
- **Files changed**: `src/pages/AccountsAudit/AccountsAudit.jsx`

---

## What's Still Missing / TODO

### High Priority

| # | Item | Description | Impact |
|---|------|-------------|--------|
| 1 | **Password change page/modal** | Backend returns `mustChangePassword: true` on login, but the frontend does NOT have a password change screen yet. Users with temp passwords can log in but are never prompted to set a new one. | Users stay on temp passwords forever — security risk |
| 2 | **DB migration: staff → user** | Frontend maps `staff` → `user` visually, but the database still has `role = 'staff'` on old accounts. Need to run: `UPDATE profiles SET role = 'user' WHERE role = 'staff';` | Backend role checks may not handle `staff` correctly |
| 3 | **Create User flow** | The "Add a New User" (modal mode `add`) form opens but `confirmAction` has no create handler — the `createUser` controller is commented out. | Superadmins can't create users through the UI |
| 4 | **Delete User flow** | The delete modal mode exists but `confirmAction` has no `delete` handler wired up. The backend endpoint exists. | Delete button opens confirm but nothing happens on confirm |

### Medium Priority

| # | Item | Description |
|---|------|-------------|
| 5 | **Frontend error toasts** | ~~`confirmAction` catches errors but only logs them to console. No user-visible toast/notification on failure.~~ **PARTIAL** — `alert()` now shows error messages on failure. A proper toast library (e.g., react-hot-toast) would be better UX. |
| 6 | **Reactivation PII restoration** | When reactivating a deactivated account, the admin needs to manually re-enter the user's name/email/username since they were anonymized. No auto-restore from audit archive. |
| 7 | **Deactivate Supabase Auth session** | ~~`deactivateUser` sets `status = inactive` in profiles but does NOT revoke the Supabase Auth session.~~ **PARTIAL** — The auth password is now scrambled on deactivation, which prevents future logins. However, if the user has a valid JWT, they could still hit APIs until the token expires (up to 1h). Consider also calling `supabaseAdmin.auth.admin.signOut(id)`. |
| 8 | **Audit log search** | The search input and status filter exist in the UI but need verification that they work with the new event types and columns. |
| 9 | **Pagination UX** | Audit logs pagination exists but total count might not account for new event types in filtering. |
| 10 | **Rate limiting on login** | ~~No rate limiting on `POST /api/auth/login`.~~ **DONE** — `loginLimiter` (10 req/15min) applied via `rateLimiter.js`. |

### Low Priority / Nice to Have

| # | Item | Description |
|---|------|-------------|
| 11 | **Bulk deactivation** | No way to deactivate multiple accounts at once. |
| 12 | **Audit log export** | `exportFormatters.js` exists in utils but isn't wired to the audit page. |
| 13 | **Temp PW expiry configuration** | Currently hardcoded to 24 hours. Should be configurable via env var or admin settings. |
| 14 | **Email notifications** | No email sent when account is deactivated, activated, or temp PW issued. |
| 15 | **Soft-delete vs hard-delete clarity** | Deactivate = soft-delete (anonymize + inactive). Delete = hard-delete (removed from Supabase Auth). The UI should make this distinction clearer. |
| 16 | **Confirm modal for non-status edits** | Currently the AUTH-008 checkbox only appears when status changes to active. Normal edits (just name/role changes) don't have their own validation warnings. |
| 17 | **Role-based route protection** | ~~User routes rely on controller-level checks instead of middleware.~~ **DONE** — `authJWT` middleware applied to all user routes in `userRoutes.js`. |
| 18 | **Profile `updated_at` timestamps** | Verify the `updated_at` column auto-updates on profile changes (Supabase trigger or manual). |

---

## File Reference

```
Backend
├── controllers/
│   ├── authController.js       ← Login, refresh, logout, temp PW expiry check
│   └── userController.js       ← CRUD, activate-with-temp, deactivate
├── middleware/
│   ├── authMiddleware.js       ← JWKS JWT verification
│   ├── roleMiddleware.js       ← requireSuperadmin (active + superadmin check)
│   └── statusMiddleware.js     ← requireActiveProfile
├── repositories/
│   ├── userRepository.js       ← Supabase queries for profiles
│   └── auditRepository.js      ← Supabase queries for audit_logging
├── routes/
│   └── userRoutes.js           ← Express routes for /profiles/*
└── utils/
    └── auditLogger.js          ← Fire-and-forget audit insert helper

Frontend
├── pages/
│   └── AccountsAudit/
│       └── AccountsAudit.jsx   ← Main page, modals, state management
├── components/
│   ├── accounts/
│   │   ├── UserForm.jsx        ← Add/Edit form, deactivate button, reset slot state
│   │   ├── AccountsTable.jsx   ← User list
│   │   └── AuditLogsTable.jsx  ← Audit logs with expand, target, details
│   ├── modals/
│   │   └── AccountsAuditModal/ ← Modal wrapper (disableOverlayClose)
│   └── common/
│       └── Modal/BaseModal.jsx ← Base modal component
└── api/
    ├── userApi.js              ← updateUser, activateUserWithTemp, deactivateUser
    └── authApi.js              ← login, refresh, logout
```
