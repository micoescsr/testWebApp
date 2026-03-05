# Accounts & Audit — End-to-End Flow

> Last updated: Mar 5, 2026 — Added UI-010 (Two-Step Reactivation Flow)

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
| `email`                | text        | Email address (anonymized on deactivation) |
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
             │                            │
             │◄──reactivate (btn) ────────┘ (choose Active or On Hold)
             │                            ▲
             └──deactivate (btn) ─────────┘
```

> **Important:** The `inactive` status is NOT available in the status dropdown. It can only be reached via the **Deactivate Account** button. Reactivation from inactive is done exclusively via the **Reactivate Account** button — the status dropdown is disabled while the account is deactivated.

### Status Meanings

| Status     | Login | Data    | Description                                    |
|------------|-------|---------|------------------------------------------------|
| `active`   | ✅    | Full    | Normal operational state                       |
| `on_hold`  | ❌    | Full    | Suspended — data preserved, login blocked      |
| `inactive` | ❌    | Anonymized | Deactivated — PII stripped, profile archived in audit logs |

### Status Transitions

| From → To     | How it happens                  | Password behavior                                  |
|---------------|----------------------------------|----------------------------------------------------|
| active → on_hold  | Superadmin edits status (dropdown) | Password preserved                             |
| active → inactive | Superadmin clicks **Deactivate Account** button | PII anonymized (email set to placeholder), `must_change_password` cleared     |
| on_hold → active  | Superadmin edits status (dropdown) | Admin chooses: keep existing PW *or* issue temp PW |
| on_hold → inactive | Superadmin clicks **Deactivate Account** button | PII anonymized (email set to placeholder)     |
| inactive → active | Superadmin clicks **Reactivate Account** button | Admin chooses: keep existing PW *or* issue temp PW. Status dropdown is disabled — only the Reactivate button works. |
| inactive → on_hold | Superadmin clicks **Reactivate Account** button (selects On Hold) | Password preserved. Status dropdown is disabled — only the Reactivate button works. |

> **Key change (UI-009):** The `inactive` option was removed from the status dropdown entirely. Transitions *to* inactive are done via the **Deactivate Account** button, and transitions *from* inactive are done via the **Reactivate Account** button. This prevents accidental status changes and ensures proper audit logging for each action.

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
   - Reversible via the Reactivate Account button
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
      - email = "deactivated_{id_prefix}@removed.local"
   c. Logs USER_DEACTIVATE audit event:
      - old_values = full archived profile snapshot
      - new_values = the anonymized values
      - meta = { anonymized: true, archived: true, reason: "..." }
   d. Returns { message, profile, archived: true }
5. User list refreshes — deactivated user shows anonymized info
```

### Reactivation Flow (Two-Step)

```
Step 1 — Edit & Save Profile Details
1. Superadmin opens deactivated user → sees yellow banner with two-step instructions
2. Admin edits the form fields (first name, last name, email, username, role)
   — PII was anonymized during deactivation, so the admin fills in the real values
3. Clicks "Save Details" button in the form footer
4. Confirm modal: "Are you sure you want to save the updated profile details
   for this deactivated account? The account will remain inactive..."
5. Superadmin confirms → Backend: PUT /profiles/:id (edits only, status stays inactive)
6. UserForm reopens with a green success banner:
   "✓ Profile details saved successfully. You can now click Reactivate Account..."

Step 2 — Reactivate & Issue Temp Password
7. Admin clicks "Reactivate Account" button in the form footer
8. Confirm modal appears with green panel:
   - Shows a preview of the profile details that will be applied
   - Choose target status: Active or On Hold (dropdown)
   - If Active: checkbox to optionally issue a temp password
   - Summary of what will happen (status change, profile update, audit logging)
9. Superadmin confirms
10. Frontend: POST /profiles/:id/reactivate with body:
    - targetStatus (active | on_hold)
    - issueTempPassword (boolean)
    - profileUpdates { first_name, last_name, username, email, role }
11. Backend:
    a. Validates account is currently inactive
    b. Merges profile field updates into the status-change payload
    c. Updates profile in a single write:
       - status = targetStatus (active or on_hold)
       - first_name, last_name, username, email, role (from profileUpdates)
       - must_change_password = true/false (depending on temp PW choice)
       - temp_expires_at = now+24h or null
    d. If temp PW: generates crypto-random password, updates Supabase auth (password + email)
    e. If email changed (without temp PW): updates Supabase auth email separately
    f. Logs USER_REACTIVATE audit event:
       - old_values = deactivated profile (anonymized)
       - new_values = all fields written (status + profile fields + temp PW flags)
       - meta = { targetStatus, tempPasswordIssued, reactivatedFrom, profileFieldsUpdated[] }
    g. Returns { message, profile, tempPassword?, tempExpiresAt? }
12. If temp PW was issued: Temp Password modal appears
13. User list refreshes — reactivated user shows new status with restored PII
```

> **Note:** The two-step flow allows the admin to verify that profile details are correctly saved before proceeding with the actual reactivation. In step 1, the "Save Details" button calls the regular `PUT /profiles/:id` endpoint, keeping the status as `inactive`. After confirmation, the UserForm reopens with a green banner indicating success and prompting the admin to proceed with step 2. The admin can still edit details further before clicking "Reactivate Account".

### Why Archive?

- **Compliance**: The full profile data (name, email, username, role) is preserved in `audit_logging.old_values` as a JSONB snapshot
- **Reversibility**: A superadmin can reactivate the account and restore profile details in a single operation
- **Security**: Login is immediately blocked, PII is anonymized in the active database (email set to a placeholder), but audit trail is untouched

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
| `USER_REACTIVATE`   | Reactivated from inactive            | OK/FAIL  | old (deactivated) + new  |
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
| `src/components/accounts/UserForm.jsx` | Add/Edit user form with role, status, deactivate/reactivate |
| `src/components/accounts/AccountsTable.jsx` | User list table |
| `src/components/accounts/AuditLogsTable.jsx` | Audit logs table with expand/collapse |
| `src/components/modals/AccountsAuditModal/AccountsAuditModal.jsx` | Modal wrapper |
| `src/components/common/Modal/BaseModal.jsx` | Base modal (overlay close control) |
| `src/api/userApi.js` | API calls: updateUser, activateUserWithTemp, deactivateUser, reactivateUser |
| `src/api/authApi.js` | API calls: login, refresh, logout |

### Modal Modes

| Mode        | Trigger                    | Confirm button       | Action on confirm                   |
|-------------|----------------------------|----------------------|--------------------------------------|
| `add`       | "Add a New User" button    | "Confirm"            | Create user (not yet wired)          |
| `edit`      | Click user row → Edit      | "Confirm"            | PUT /profiles/:id + optional temp PW. For inactive users: saves detail edits only (status stays inactive), then reopens UserForm for step 2. |
| `delete`    | Click Delete in form       | "Confirm" (red)      | DELETE /profiles/:id                 |
| `deactivate`| Click "Deactivate Account" | "Deactivate" (red)   | POST /profiles/:id/deactivate        |
| `reactivate`| Click "Reactivate Account" | "Reactivate" (green) | POST /profiles/:id/reactivate (step 2 of two-step flow) |

### Key UX Behaviors

- **Outside-click protection**: Modal overlay click is disabled during processing (`isProcessing` state)
- **Activation checkbox**: When changing from non-active → active, a checkbox appears: "Issue a temporary password"
- **Temp PW modal**: Cannot be dismissed by clicking outside — must click Close
- **Inactive users**: Shown with a yellow banner (two-step instructions); status dropdown is **disabled** showing "Deactivated — Account is inactive"; "Deactivate Account" button is replaced by a green "Reactivate Account" button; "Save Details" button is enabled for editing profile fields while keeping the account inactive
- **Two-step reactivation flow**: For inactive users, the admin first saves profile detail edits via the "Save Details" button (Step 1), then the form reopens with a green success banner prompting the admin to click "Reactivate Account" (Step 2) to restore login access and optionally issue a temp password
- **Reactivate flow**: Clicking "Reactivate Account" opens a dedicated confirm modal where the admin chooses the target status (Active or On Hold) and optionally issues a temp password
- **Status dropdown**: Only contains `Active` and `On Hold` — the `Inactive` status is never directly selectable via dropdown
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
| POST   | `/profiles/:id/reactivate`    | JWT  | Superadmin | Reactivate from inactive + optional temp PW |

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

### UI-009 — Separate Deactivate / Reactivate Account Buttons
- **Before**: Inactive status was partially handled via the dropdown (it was removed from options in UI-006, but reactivation still relied on the dropdown to change from inactive → active/on_hold via the normal edit flow)
- **After**:
  - **Status dropdown** only contains **Active** and **On Hold** — the `Inactive` value is never a selectable option
  - **When account is inactive**: the status dropdown is **disabled** and shows "Deactivated — Account is inactive" as a grayed-out annotation. The "Save Changes" button is also disabled with a tooltip.
  - **Deactivate Account** button (red, tertiary style) shown for active/on_hold users → opens a red confirmation panel
  - **Reactivate Account** button (green, solid style) shown for inactive users → opens a green confirmation panel with:
    - Target status selector (Active or On Hold)
    - Temp password checkbox (only when targeting Active)
    - Summary of what the reactivation will do
  - **Profile editing during reactivation**: The admin edits the form fields (name, email, username, role) **before** clicking Reactivate. The button captures the current form state and includes it in the confirmation. All profile updates are applied atomically with the status change.
  - **New backend endpoint**: `POST /profiles/:id/reactivate` — accepts `{ targetStatus, issueTempPassword, profileUpdates }`, validates the account is inactive, merges profile field updates (first_name, last_name, username, email, role) with the status change, optionally issues a temp password, updates Supabase auth (password + email), and logs a `USER_REACTIVATE` audit event with full before/after snapshots and `profileFieldsUpdated` in meta
  - **Activation state handled independently**: The deactivation/reactivation flow is completely separate from operational status changes (active ↔ on_hold), ensuring proper audit trails for each type of action

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

### BUG FIX — Deactivation Failing for Active / On Hold Accounts
- **Problem**: Deactivating an active or on_hold account would silently fail. The confirm modal closed but the account was never deactivated. No error was shown to the user.
- **Root cause**: The `deactivateUser` backend controller set `email = null` during PII anonymization, but the `profiles.email` database column has a `NOT NULL` constraint. The Supabase update threw a constraint violation error, which was caught silently on the frontend (logged to console only).
- **Fix (backend — `userController.js`)**: Changed the anonymized email from `null` to a placeholder: `deactivated_{id_prefix}@removed.local`. This satisfies the NOT NULL constraint while still removing real PII.
- **Fix (backend — `userRepository.js`)**: Updated `mapRowToProfile` to include `must_change_password` and `temp_expires_at` fields so deactivation archival captures the full profile snapshot in audit logs.
- **Fix (frontend — `useUsers.js`)**: Updated the user formatter to pass through `must_change_password` and `temp_expires_at` fields so the UserForm reset slot state indicator displays correctly.

### UI-010 — Two-Step Reactivation Flow (Edit Details Before Temp Password)
- **Before**: When reactivating an inactive account, the admin edited profile details and clicked "Reactivate Account" in a single step. The "Save Changes" button was disabled for inactive users, meaning profile edits could only be submitted alongside the reactivation. The admin had no way to verify that profile details were saved correctly before proceeding with the temp password issuance.
- **After**: The reactivation flow is now a clear two-step process:
  - **Step 1 — Save Details**: The "Save Changes" button is replaced with "Save Details" for inactive users and is now **enabled**. Clicking it opens a confirm modal with a message clarifying that the account will remain inactive. After confirmation, the profile details are saved via `PUT /profiles/:id` (status stays `inactive`), and the UserForm reopens with a **green success banner** ("✓ Profile details saved successfully") prompting the admin to proceed to step 2.
  - **Step 2 — Reactivate Account**: The admin clicks "Reactivate Account" → the existing reactivation confirm modal appears (target status selector, temp PW checkbox). The profile updates from step 1 are already persisted, so the reactivation only needs to handle the status change and optional temp password.
  - **Yellow banner (pre-save)**: Shows two-step instructions — "Step 1: Update details → Save Details. Step 2: Click Reactivate Account."
  - **Green banner (post-save)**: Shows success message — "✓ Profile details saved successfully. You can now click Reactivate Account..."
  - **Status helper text updated**: "Save your detail edits first, then use Reactivate Account to restore access."
  - **New state**: `detailsSavedForReactivation` boolean tracks whether step 1 is complete, controls banner color/content
  - **New prop**: `detailsSaved` passed to `UserForm` to drive the banner UI
- **Files changed**: `UserForm.jsx`, `AccountsAudit.jsx`

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
| 5 | **Frontend error toasts** | `confirmAction` catches errors but only logs them to console. No user-visible toast/notification on failure. |
| 6 | **Reactivation PII restoration** | When reactivating a deactivated account, the admin needs to manually re-enter the user's name/email/username since they were anonymized. No auto-restore from audit archive. |
| 7 | **Deactivate Supabase Auth session** | `deactivateUser` sets `status = inactive` in profiles but does NOT revoke the Supabase Auth session. If the user has a valid JWT, they could still hit APIs until the token expires (up to 1h). Consider calling `supabaseAdmin.auth.admin.signOut(id)` or updating the auth user to disabled. |
| 8 | **Audit log search** | The search input and status filter exist in the UI but need verification that they work with the new event types and columns. |
| 9 | **Pagination UX** | Audit logs pagination exists but total count might not account for new event types in filtering. |
| 10 | **Rate limiting on login** | No rate limiting on `POST /api/auth/login`. Brute-force protection relies entirely on Supabase's built-in limits. |

### Low Priority / Nice to Have

| # | Item | Description |
|---|------|-------------|
| 11 | **Bulk deactivation** | No way to deactivate multiple accounts at once. |
| 12 | **Audit log export** | `exportFormatters.js` exists in utils but isn't wired to the audit page. |
| 13 | **Temp PW expiry configuration** | Currently hardcoded to 24 hours. Should be configurable via env var or admin settings. |
| 14 | **Email notifications** | No email sent when account is deactivated, activated, or temp PW issued. |
| 15 | **Soft-delete vs hard-delete clarity** | Deactivate = soft-delete (anonymize + inactive). Delete = hard-delete (removed from Supabase Auth). The UI should make this distinction clearer. |
| 16 | **Confirm modal for non-status edits** | Currently the AUTH-008 checkbox only appears when status changes to active. Normal edits (just name/role changes) don't have their own validation warnings. |
| 17 | **Role-based route protection** | User routes rely on controller-level `getCurrentUserRole()` checks instead of using the `requireSuperadmin` middleware on the routes. Consider moving to middleware for consistency. |
| 18 | **Profile `updated_at` timestamps** | Verify the `updated_at` column auto-updates on profile changes (Supabase trigger or manual). |

---

## File Reference

```
Backend
├── controllers/
│   ├── authController.js       ← Login, refresh, logout, temp PW expiry check
│   └── userController.js       ← CRUD, activate-with-temp, deactivate, reactivate
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
│   │   ├── UserForm.jsx        ← Add/Edit form, deactivate/reactivate buttons, reset slot state
│   │   ├── AccountsTable.jsx   ← User list
│   │   └── AuditLogsTable.jsx  ← Audit logs with expand, target, details
│   ├── modals/
│   │   └── AccountsAuditModal/ ← Modal wrapper (disableOverlayClose)
│   └── common/
│       └── Modal/BaseModal.jsx ← Base modal component
└── api/
    ├── userApi.js              ← updateUser, activateUserWithTemp, deactivateUser, reactivateUser
    └── authApi.js              ← login, refresh, logout
```
