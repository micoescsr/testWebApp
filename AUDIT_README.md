# Audit Logging System — Documentation

> **Last updated:** March 3, 2026  
> **Branch:** `threat-detection-test`  
> **Owner:** WiFi Security Web Application

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Audit Event Catalog](#audit-event-catalog)
7. [Security Model & Access Control](#security-model--access-control)
8. [Data Isolation (Multi-User Scoping)](#data-isolation-multi-user-scoping)
9. [Current Status & Gap Analysis](#current-status--gap-analysis)
10. [Implementation Roadmap](#implementation-roadmap)
11. [Industry Standards & Compliance](#industry-standards--compliance)
12. [API Reference](#api-reference)
13. [Testing](#testing)
14. [Troubleshooting](#troubleshooting)

---

## Overview

The audit logging system provides a **tamper-resistant, append-only trail** of all security-relevant actions performed within the WiFi Security web application. It is designed to satisfy the requirements of:

- **SOC 2 Type II** — Common Criteria CC6.1 (Logical Access), CC7.2 (System Monitoring)
- **ISO 27001** — Annex A.12.4 (Logging and Monitoring)
- **NIST SP 800-53** — AU-2 (Auditable Events), AU-3 (Content of Audit Records)
- **OWASP ASVS** — V7 (Error Handling and Logging)

### What gets logged

Every **state-changing operation** and **authentication event** is captured, including:

- User authentication (login, logout, token refresh, failed attempts)
- Account lifecycle (create, edit, activate, deactivate, delete)
- Network scanning operations (start, save, complete)
- Threat detection lifecycle (start, stop)
- Device management (AP enable/disable, configuration changes)
- Captive portal changes (announcements, terms & conditions, tips, portal sync)
- Authorization denials (403 responses)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  AccountsAudit.jsx → useAuditLogs.js → auditApi.js          │
│         (Superadmin only — role-gated page)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ GET /api/audit/logs
                           │ (Bearer JWT required)
┌──────────────────────────▼──────────────────────────────────┐
│                     Backend (Express)                         │
│                                                               │
│  ┌─ Routes ─────────────────────────────────────────────┐    │
│  │  auditRoutes.js                                       │    │
│  │    GET /logs  →  authJWT → requireSuperadmin → ctrl   │    │
│  │    GET /export → authJWT → requireSuperadmin → ctrl   │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ Controller ─────────────────────────────────────────┐    │
│  │  auditController.js                                   │    │
│  │    getAuditLogs()   — paginated, filtered, sorted     │    │
│  │    exportAuditLogs() — CSV download (planned)         │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ Repository ─────────────────────────────────────────┐    │
│  │  auditRepository.js                                   │    │
│  │    getAuditLogs()   — Supabase query + profile join   │    │
│  │    insertAuditLog() — validated insert to DB          │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ Utility ────────────────────────────────────────────┐    │
│  │  auditLogger.js                                       │    │
│  │    logAuditEvent()  — fire-and-forget wrapper         │    │
│  │    Called from controllers, middleware, routes         │    │
│  └───────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Supabase (PostgreSQL)                       │
│                                                               │
│  Table: audit_logging                                        │
│    - audit_log_id (UUID PK, auto-generated)                  │
│    - created_at (timestamptz, auto NOW())                    │
│    - actor_profile_id (UUID FK → profiles.id)                │
│    - request_id (UUID, for correlation)                      │
│    - actor_ip (inet)                                         │
│    - user_agent (text)                                       │
│    - event_name (text, e.g. 'LOGIN_SUCCESS')                 │
│    - event_status (enum: OK | FAIL | DENY)                   │
│    - entity_type (text, e.g. 'AUTH', 'USER', 'SCAN')        │
│    - entity_id_uuid / entity_id_bigint (target entity)       │
│    - old_values (JSONB — snapshot before change)             │
│    - new_values (JSONB — snapshot after change)              │
│    - meta (JSONB — additional context)                       │
└──────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Primary table: `audit_logging`

```sql
CREATE TABLE public.audit_logging (
  audit_log_id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  actor_profile_id     uuid        NOT NULL,
  request_id           uuid,
  actor_ip             inet,
  user_agent           text,
  event_name           text        NOT NULL,
  event_status         audit_event_status NOT NULL,  -- ENUM: OK | FAIL | DENY
  entity_type          text        NOT NULL,
  entity_id_uuid       uuid,
  entity_id_bigint     bigint,
  old_values           jsonb,
  new_values           jsonb,
  meta                 jsonb,

  CONSTRAINT audit_logging_pkey PRIMARY KEY (audit_log_id),
  CONSTRAINT audit_logging_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id)
);
```

### Key design decisions:

| Decision | Rationale |
|----------|-----------|
| UUID primary key | Prevents sequential ID enumeration attacks |
| FK to `profiles.id` | Ensures actor traceability; anonymous entries are not possible |
| Dual entity ID columns (uuid + bigint) | Supports both UUID-based and legacy bigint-based entities |
| JSONB `old_values` / `new_values` | Full change capture without separate diff tables |
| JSONB `meta` | Extensible context (device info, error messages, etc.) |
| `event_status` enum (OK/FAIL/DENY) | DB-enforced valid states; mapped to user-friendly labels in app |

### Legacy table: `audit_logs` (DEPRECATED)

```sql
-- This table exists but is NOT used by any code.
-- It should be dropped in a future migration.
CREATE TABLE public.audit_logs (
  audit_log_id  bigint GENERATED ALWAYS AS IDENTITY,
  ...
);
```

---

## Backend Implementation

### File Map

| File | Purpose |
|------|---------|
| `utils/auditLogger.js` | **Primary interface** — `logAuditEvent()` fire-and-forget helper |
| `repositories/auditRepository.js` | DB operations — `getAuditLogs()`, `insertAuditLog()` |
| `controllers/auditController.js` | HTTP handler — `GET /api/audit/logs` |
| `routes/auditRoutes.js` | Route + middleware wiring |
| `middleware/authMiddleware.js` | JWT verification (`authJWT`) |
| `middleware/roleMiddleware.js` | Role enforcement (`requireSuperadmin`) |

### How to log an audit event

From any controller or middleware:

```javascript
const { logAuditEvent } = require("../utils/auditLogger");

// Inside an async handler:
await logAuditEvent({
  req,                              // Express request (for IP + user-agent)
  actorId: req.user.id,             // UUID of the acting user (required)
  eventName: "SCAN_START",          // What happened
  eventStatus: "SUCCESS",           // SUCCESS | FAILED | DENIED
  entityType: "SCAN",               // Category
  entityIdUuid: scanId,             // Target entity (optional)
  entityIdBigint: null,             // For bigint PKs (optional)
  oldValues: { status: "IDLE" },    // Before snapshot (optional)
  newValues: { status: "RUNNING" }, // After snapshot (optional)
  meta: { network_id: "..." },     // Extra context (optional)
});
```

### Safety guarantees:

- **Never throws** — audit failures are caught and logged to console, never breaking the primary operation.
- **Graceful degradation** — if `actorId` is missing (e.g., system process), the event is skipped with a console warning.
- **Status mapping** — accepts friendly labels (`SUCCESS`, `FAILED`, `DENIED`) and auto-maps to DB enum (`OK`, `FAIL`, `DENY`).
- **IP normalization** — strips IPv6-mapped prefix (`::ffff:`) for Postgres `inet` compatibility.

---

## Frontend Implementation

### File Map

| File | Purpose |
|------|---------|
| `src/api/auditApi.js` | API client — `getAuditLogs({ page, limit, search, status })` |
| `src/hooks/useAuditLogs.js` | React hook — pagination, debounced search, status filter |
| `src/components/accounts/AuditLogsTable.jsx` | Table component with expandable detail rows |
| `src/pages/AccountsAudit/AccountsAudit.jsx` | Page with Accounts + Audit Logs tabs |

### Features:

- **Pagination** — 25 rows/page, server-side
- **Search** — free-text, 300ms debounce, searches event_name + entity_type
- **Status filter** — SUCCESS / FAILED / all
- **Expandable rows** — click to see old→new value diff, IP, entity details
- **Module badges** — AUTH, ACCOUNTS, SCANS, NETWORK, DEVICE, PORTAL, SYSTEM
- **Actor display** — shows username > full name > email > "System"
- **Role guard** — non-superadmin users are redirected to `/dashboard`

---

## Audit Event Catalog

### Authentication Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `LOGIN_SUCCESS` | OK | AUTH | Successful password login | `authController.login` |
| `LOGIN_FAILED` | FAIL | AUTH | Wrong credentials | `authController.login` |
| `LOGIN_TEMP_EXPIRED` | FAIL | AUTH | Temp password expired on login | `authController.login` |
| `LOGOUT` | OK | AUTH | User logout | **⚠️ NOT YET IMPLEMENTED** |
| `TOKEN_REFRESH` | OK/FAIL | AUTH | Silent token refresh | **⚠️ NOT YET IMPLEMENTED** |

### Account Lifecycle Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `USER_CREATE` | OK/FAIL | USER | New user created by superadmin | `userController` |
| `USER_UPDATE` | OK | USER | Profile fields changed | `userController` |
| `USER_DELETE` | OK | USER | Account deleted | `userController` |
| `USER_ACTIVATE` | OK | USER | Account activated + temp password issued | `userController` |
| `USER_DEACTIVATE` | OK | USER | Account deactivated + data archived | `userController` |

### Scanning Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `SCAN_START` | OK/FAIL | SCAN | Vulnerability scan initiated | `rasPiController` |
| `SCAN_SAVE` | OK | SCAN | Scan results persisted | `rasPiController` |

### Detection Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `DETECTION_START` | OK | DETECTION | Threat detection started | **⚠️ NOT YET IMPLEMENTED** |
| `DETECTION_STOP` | OK | DETECTION | Threat detection stopped | **⚠️ NOT YET IMPLEMENTED** |

### Device Management Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `AP_ENABLE` | OK/FAIL | DEVICE | Access point enabled | `deviceMgmtRoutes` |
| `AP_DISABLE` | OK/FAIL | DEVICE | Access point disabled | `deviceMgmtRoutes` |
| `DEVICE_CONFIG_UPDATE` | OK | DEVICE | Configuration changed | `deviceMgmtRoutes` |

### Captive Portal Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `ANNOUNCEMENT_PUBLISH` | OK | PORTAL | New announcement published | **⚠️ NOT YET IMPLEMENTED** |
| `TERMS_PUBLISH` | OK | PORTAL | Terms & conditions updated | **⚠️ NOT YET IMPLEMENTED** |
| `TIPS_UPDATE` | OK | PORTAL | Security tips updated | **⚠️ NOT YET IMPLEMENTED** |
| `PORTAL_SYNC` | OK | PORTAL | Portal synced to device | **⚠️ NOT YET IMPLEMENTED** |

### Authorization Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `AUTHORIZATION_DENIED` | DENY | AUTH | Non-superadmin tried restricted endpoint | **⚠️ NOT YET IMPLEMENTED** |

---

## Security Model & Access Control

### Audit Log Access

| Role | Read Logs | Write Logs | Export | Delete |
|------|-----------|------------|--------|--------|
| **Superadmin** | ✅ All logs | ✅ (automatic via actions) | ✅ (planned) | ❌ Never |
| **Admin** | ❌ No access | ✅ (automatic via actions) | ❌ | ❌ Never |
| **Unauthenticated** | ❌ | ❌ | ❌ | ❌ |

### Enforcement layers:

1. **Route middleware**: `authJWT` → `requireSuperadmin` on all `/api/audit/*` routes
2. **Frontend guard**: `AccountsAudit.jsx` redirects non-superadmins to `/dashboard`
3. **Database RLS** (planned): `INSERT`-only policy on `audit_logging` — no UPDATE/DELETE even for service role

### Immutability (planned):

```sql
-- Supabase RLS: audit logs are append-only
CREATE POLICY "audit_insert_only" ON public.audit_logging
  FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE policies = denied by default with RLS enabled
ALTER TABLE public.audit_logging ENABLE ROW LEVEL SECURITY;
```

---

## Data Isolation (Multi-User Scoping)

The application has **3 data sources** with different access rules:

### 1. Audit Logs (`audit_logging`)

| User Type | Access |
|-----------|--------|
| Superadmin | ✅ See ALL logs from all users |
| Admin | ❌ Cannot access audit log endpoints at all |

**Enforcement:** `requireSuperadmin` middleware on `/api/audit/logs`.

### 2. Vulnerability Scan History (`/api/history/vulnerabilities`)

| User Type | Access (Current) | Access (Target) |
|-----------|-----------------|-----------------|
| Superadmin | ⚠️ All (no auth) | ✅ All scans |
| Admin | ⚠️ All (no auth) | ✅ **Own scans only** |
| Unauthenticated | 🔴 All (no auth!) | ❌ Blocked |

**Current problem:** These endpoints are defined inline in `server.js` with **zero authentication middleware**. Anyone can call them.

**Target fix:** Move to a protected router, filter by `requested_by_profile_id` (from `vulnerability_scans` table) or by `network_memberships` association.

### 3. Threat Detection History (`/api/history/threats`)

| User Type | Access (Current) | Access (Target) |
|-----------|-----------------|-----------------|
| Superadmin | ⚠️ All (no auth) | ✅ All detections |
| Admin | ⚠️ All (no auth) | ✅ **Own detections only** |
| Unauthenticated | 🔴 All (no auth!) | ❌ Blocked |

**Same problem & fix as vulnerability history above.**

### How user-scoping will work:

```
Request → authJWT (extract req.user.id) → Controller:
  1. Lookup user role from profiles table
  2. If superadmin → return ALL records (no filter)
  3. If admin → filter scans by:
     a. vulnerability_scans.requested_by_profile_id = req.user.id
     b. OR scans linked to networks where user has network_memberships
  4. Return only matching records
```

---

## Current Status & Gap Analysis

### ✅ Complete

- [x] Database schema (`audit_logging` table with rich fields)
- [x] Repository layer (paginated query + insert with validation)
- [x] Fire-and-forget audit logger utility
- [x] Controller + route for reading logs (superadmin-gated)
- [x] Frontend: API client, hook, table component, page
- [x] Auth events logged (login success/fail/temp-expired)
- [x] User lifecycle events logged (create/update/delete/activate/deactivate)
- [x] Scan events logged (start/save)
- [x] Device management events logged (AP enable/disable, config changes)

### 🔴 Critical Gaps

- [ ] **History endpoints have NO authentication** — anyone can read all scan/threat data
- [ ] **No user-scoping** on history data — admins see all users' data
- [ ] **Captive portal POST routes have no auth** — public write access
- [ ] **No audit log immutability** — logs can be modified/deleted via service role

### ⚠️ Important Gaps

- [ ] Logout event not logged
- [ ] Token refresh event not logged
- [ ] Detection start/stop not logged
- [ ] Captive portal changes not logged
- [ ] Authorization denials (403) not logged
- [ ] `request_id` (correlation ID) never populated
- [ ] No audit log export (CSV/PDF)
- [ ] No date range filter on audit queries
- [ ] No retention policy / auto-purge
- [ ] Legacy `audit_logs` table still exists (unused, confusing)

---

## Implementation Roadmap

### Phase 1 — Security Fixes (Priority: CRITICAL)

| Task | Description | Files to Change |
|------|-------------|-----------------|
| 1.1 | Add `authJWT` to history endpoints; move to proper router | New: `routes/historyRoutes.js`, `controllers/historyController.js`; Edit: `server.js` |
| 1.2 | User-scope history queries (admin=own, superadmin=all) | `controllers/historyController.js` |
| 1.3 | Add `authJWT` to captive portal write routes | `routes/captivePortalRoutes.js` |
| 1.4 | Audit log immutability via Supabase RLS | SQL migration |

### Phase 2 — Audit Coverage (Priority: HIGH)

| Task | Description | Files to Change |
|------|-------------|-----------------|
| 2.1 | Log captive portal events (publish, sync) | `controllers/captivePortalController.js` |
| 2.2 | Log detection lifecycle (start, stop) | `controllers/detectController.js` |
| 2.3 | Log LOGOUT event | `controllers/authController.js` |
| 2.4 | Log TOKEN_REFRESH event | `controllers/authController.js` |
| 2.5 | Log AUTHORIZATION_DENIED in `requireSuperadmin` | `middleware/roleMiddleware.js` |
| 2.6 | Add request_id middleware (UUID per request) | New: `middleware/requestIdMiddleware.js`; Edit: `server.js` |

### Phase 3 — Export & Compliance (Priority: MEDIUM)

| Task | Description | Files to Change |
|------|-------------|-----------------|
| 3.1 | CSV export endpoint (`GET /api/audit/export`) | `controllers/auditController.js`, `routes/auditRoutes.js` |
| 3.2 | Date range filter on audit queries | `repositories/auditRepository.js` |
| 3.3 | Retention policy (auto-purge > 365 days) | SQL cron / Supabase edge function |

### Phase 4 — Cleanup (Priority: LOW)

| Task | Description |
|------|-------------|
| 4.1 | Drop legacy `audit_logs` table |
| 4.2 | Add `profile_id` UUID FK to `scans` table (replace weak `user_id` smallint) |

---

## API Reference

### GET /api/audit/logs

**Auth:** JWT + Superadmin role required

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | 1-based page number |
| `limit` | number | 25 | Rows per page (max 100) |
| `search` | string | "" | Free-text search (event_name, entity_type) |
| `status` | string | "" | Filter: `SUCCESS`, `FAILED`, `DENIED`, or empty for all |
| `sort` | string | "created_at" | Sort column (whitelisted: created_at, event_name, event_status, entity_type) |
| `dir` | string | "desc" | Sort direction: `asc` or `desc` |

**Response:**

```json
{
  "logs": [
    {
      "id": "uuid",
      "createdAt": "2026-03-03T10:00:00Z",
      "eventName": "LOGIN_SUCCESS",
      "eventStatus": "SUCCESS",
      "entityType": "AUTH",
      "entityIdUuid": "user-uuid",
      "entityIdBigint": null,
      "oldValues": null,
      "newValues": null,
      "meta": null,
      "actorIp": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "actor": {
        "id": "user-uuid",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "username": "johndoe"
      }
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 25
}
```

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| 401 | `{ "error": "Missing token" }` | No JWT provided |
| 401 | `{ "error": "Invalid or expired token" }` | Bad/expired JWT |
| 403 | `{ "error": "Superadmin access required" }` | Non-superadmin user |
| 500 | `{ "error": "Failed to fetch audit logs" }` | Server error |

### GET /api/audit/export (PLANNED)

**Auth:** JWT + Superadmin role required

**Query Parameters:** Same as `/logs` plus:

| Param | Type | Description |
|-------|------|-------------|
| `format` | string | `csv` (default) or `xlsx` |
| `startDate` | ISO string | Filter from date |
| `endDate` | ISO string | Filter to date |

**Response:** File download with `Content-Disposition: attachment` header.

---

## Testing

### Existing test coverage:

- Unit tests: `backend/__tests__/unit/` (exportFormatters, normalization, scoring, sorting)
- Integration tests: `backend/__tests__/integration/` (auth, authorization, deviceMgmt, scanIngestion)

### Needed tests:

| Test | Type | Priority |
|------|------|----------|
| `auditRepository.insertAuditLog` — validates required fields | Unit | HIGH |
| `auditRepository.insertAuditLog` — rejects invalid event_status | Unit | HIGH |
| `auditRepository.getAuditLogs` — pagination bounds | Unit | MEDIUM |
| `auditController.getAuditLogs` — response shape | Integration | HIGH |
| `auditRoutes` — 401 without JWT | Integration | HIGH |
| `auditRoutes` — 403 for non-superadmin | Integration | HIGH |
| `logAuditEvent` — never throws on error | Unit | HIGH |
| History endpoints — user-scoping | Integration | CRITICAL |

### Running tests:

```bash
cd backend
npm test                    # Run all tests
npm test -- --coverage      # With coverage report
npm test -- __tests__/unit/auditRepository.test.js  # Single file
```

---

## Troubleshooting

### Audit logs not appearing

1. **Check actor ID exists in `profiles`** — FK constraint requires valid `actor_profile_id`
2. **Check console for `[auditLogger] Skipping audit log — no actorId`** — means `req.user.id` was not available
3. **Check console for `[auditRepository] insertAuditLog error`** — DB constraint violation

### "Failed to fetch audit logs" on frontend

1. Verify user has `superadmin` role in `profiles` table
2. Check JWT is being sent (`Authorization: Bearer ...` header)
3. Check CORS — frontend must be on `http://localhost:5173`

### Common DB errors

| Error | Cause | Fix |
|-------|-------|-----|
| `violates foreign key constraint "audit_logging_actor_profile_id_fkey"` | Actor UUID doesn't exist in `profiles` | Ensure user has a profile row before logging |
| `invalid input value for enum audit_event_status` | Wrong status value | Use only `OK`, `FAIL`, or `DENY` |
| `violates check constraint` on entity IDs | Both entity_id columns are null | Pass at least `entityIdUuid` (logger auto-falls back to actorId) |

---

## Appendix: Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (for admin queries) |
| `SUPABASE_ANON_KEY` | Yes | Anon key (for auth endpoints) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` or `development` |

---

## Appendix: File Reference

```
backend/
├── controllers/
│   └── auditController.js       # GET /api/audit/logs handler
├── middleware/
│   ├── authMiddleware.js         # authJWT — JWKS-based JWT verification
│   ├── roleMiddleware.js         # requireSuperadmin — role + status check
│   └── statusMiddleware.js       # requireActiveProfile — account status check
├── repositories/
│   └── auditRepository.js       # DB operations for audit_logging table
├── routes/
│   └── auditRoutes.js           # Route wiring with auth + role guards
├── utils/
│   └── auditLogger.js           # logAuditEvent() — fire-and-forget helper
│
src/
├── api/
│   └── auditApi.js              # Frontend API client
├── hooks/
│   └── useAuditLogs.js          # React hook for audit log state
├── components/
│   └── accounts/
│       └── AuditLogsTable.jsx   # Table UI with expandable rows
└── pages/
    └── AccountsAudit/
        └── AccountsAudit.jsx    # Page (tabs: Accounts + Audit Logs)
```
