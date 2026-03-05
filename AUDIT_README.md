# Audit Logging System â€” Documentation

> **Last updated:** March 5, 2026  
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
9. [Retention & Archival](#retention--archival)
10. [CSV Export](#csv-export)
11. [Industry Standards & Compliance](#industry-standards--compliance)
12. [API Reference](#api-reference)
13. [Testing](#testing)
14. [Troubleshooting](#troubleshooting)
15. [Implementation Status](#implementation-status)

---

## Overview

The audit logging system provides a **tamper-resistant, append-only trail** of all security-relevant actions performed within the WiFi Security web application. It is designed to satisfy the requirements of:

- **SOC 2 Type II** â€” Common Criteria CC6.1 (Logical Access), CC7.2 (System Monitoring)
- **ISO 27001** â€” Annex A.12.4 (Logging and Monitoring)
- **NIST SP 800-53** â€” AU-2 (Auditable Events), AU-3 (Content of Audit Records)
- **OWASP ASVS** â€” V7 (Error Handling and Logging)

### What gets logged

Every **state-changing operation** and **authentication event** is captured, including:

- User authentication (login, logout, token refresh, failed attempts)
- Account lifecycle (create, edit, activate, deactivate, delete)
- Network scanning operations (start, save, complete)
- Threat detection lifecycle (start, stop)
- Device management (AP enable/disable, configuration changes)
- Captive portal changes (announcements, terms & conditions, tips, portal sync)
- Authorization denials (403 responses)
- System operations (audit export, audit archival)

### Event Naming Convention

All events use **structured dot-notation** (e.g., `AUTH.LOGIN`, `USER.CREATE`, `SCAN.START`). Legacy underscore names (e.g., `LOGIN_SUCCESS`) are automatically migrated to dot-notation at write time via `EVENT_NAME_MIGRATION` in `auditLogger.js`.

---

## Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        Frontend                              â”‚
â”‚  AccountsAudit.jsx â†’ useAuditLogs.js â†’ auditApi.js          â”‚
â”‚         (Superadmin only â€” role-gated page)                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚ GET /api/audit/logs
                           â”‚ GET /api/audit/export
                           â”‚ (Bearer JWT required)
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                     Backend (Express)                         â”‚
â”‚                                                               â”‚
â”‚  â”Œâ”€ Middleware (global) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  requestIdMiddleware.js                               â”‚    â”‚
â”‚  â”‚    Generates UUID v4 per request â†’ req.requestId      â”‚    â”‚
â”‚  â”‚    Reuses client x-request-id header if provided      â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                               â”‚
â”‚  â”Œâ”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  auditRoutes.js                                       â”‚    â”‚
â”‚  â”‚    GET  /logs    â†’ authJWT â†’ requireSuperadmin â†’ ctrl â”‚    â”‚
â”‚  â”‚    GET  /export  â†’ authJWT â†’ requireSuperadmin â†’ ctrl â”‚    â”‚
â”‚  â”‚    POST /archive â†’ authJWT â†’ requireSuperadmin â†’ ctrl â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                               â”‚
â”‚  â”Œâ”€ Controller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  auditController.js                                   â”‚    â”‚
â”‚  â”‚    getAuditLogs()     â€” paginated, filtered, sorted   â”‚    â”‚
â”‚  â”‚    exportAuditLogs()  â€” CSV file download             â”‚    â”‚
â”‚  â”‚    archiveAuditLogs() â€” move >7-day logs to archive   â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                               â”‚
â”‚  â”Œâ”€ Repository â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  auditRepository.js                                   â”‚    â”‚
â”‚  â”‚    getAuditLogs()        â€” Supabase query + join      â”‚    â”‚
â”‚  â”‚    getArchivedAuditLogs() â€” query archive table       â”‚    â”‚
â”‚  â”‚    getAuditLogsForExport() â€” up to 10k rows for CSV   â”‚    â”‚
â”‚  â”‚    archiveOldLogs(7)     â€” retention + archival       â”‚    â”‚
â”‚  â”‚    insertAuditLog()      â€” validated insert to DB     â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                               â”‚
â”‚  â”Œâ”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  auditLogger.js                                       â”‚    â”‚
â”‚  â”‚    logAuditEvent()       â€” fire-and-forget wrapper    â”‚    â”‚
â”‚  â”‚    normalizeEventName()  â€” dot-notation migration     â”‚    â”‚
â”‚  â”‚    EVENT_NAME_MIGRATION  â€” oldâ†’new name map           â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                               â”‚
â”‚  â”Œâ”€ Consumers (log audit events) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  authController.js       â€” AUTH.*                     â”‚    â”‚
â”‚  â”‚  userController.js       â€” USER.*                     â”‚    â”‚
â”‚  â”‚  rasPiController.js      â€” SCAN.*                     â”‚    â”‚
â”‚  â”‚  detectController.js     â€” DETECTION.*                â”‚    â”‚
â”‚  â”‚  captivePortalController â€” PORTAL.*                   â”‚    â”‚
â”‚  â”‚  deviceMgmtRoutes.js     â€” DEVICE.*                   â”‚    â”‚
â”‚  â”‚  roleMiddleware.js       â€” AUTHORIZATION.DENIED       â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   Supabase (PostgreSQL)                       â”‚
â”‚                                                               â”‚
â”‚  Table: audit_logging (active â€” 7-day retention)             â”‚
â”‚  Table: audit_logging_archive (historical â€” long-term)       â”‚
â”‚    Both tables share identical schema:                        â”‚
â”‚    - audit_log_id (UUID PK)                                  â”‚
â”‚    - created_at (timestamptz)                                â”‚
â”‚    - actor_profile_id (UUID FK â†’ profiles on active only)    â”‚
â”‚    - request_id (UUID, correlation ID)                       â”‚
â”‚    - actor_ip (inet), user_agent (text)                      â”‚
â”‚    - event_name (text, dot-notation)                         â”‚
â”‚    - event_status (enum: OK | FAIL | DENY)                   â”‚
â”‚    - entity_type, entity_id_uuid, entity_id_bigint           â”‚
â”‚    - old_values, new_values, meta (JSONB)                    â”‚
â”‚                                                               â”‚
â”‚  Immutability: DB triggers block UPDATE on both tables       â”‚
â”‚                DB triggers block DELETE on archive table      â”‚
â”‚  Indexes: created_at, actor_profile_id, event_name           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Database Schema

### Active table: `audit_logging`

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

### Archive table: `audit_logging_archive`

Identical structure **without** the FK to `profiles` (so archived logs survive profile purges):

```sql
CREATE TABLE public.audit_logging_archive (
  audit_log_id         uuid        NOT NULL,
  created_at           timestamptz NOT NULL,
  actor_profile_id     uuid        NOT NULL,
  request_id           uuid,
  actor_ip             inet,
  user_agent           text,
  event_name           text        NOT NULL,
  event_status         audit_event_status NOT NULL,
  entity_type          text        NOT NULL,
  entity_id_uuid       uuid,
  entity_id_bigint     bigint,
  old_values           jsonb,
  new_values           jsonb,
  meta                 jsonb,
  archived_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_logging_archive_pkey PRIMARY KEY (audit_log_id)
);
```

### Immutability (DB triggers)

```sql
-- Blocks UPDATE on both audit_logging and audit_logging_archive
-- Blocks DELETE on audit_logging_archive (archive is permanent)
CREATE FUNCTION prevent_audit_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable â€” % operations are not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
```

### Indexes

```sql
-- Active table
CREATE INDEX idx_audit_logging_created_at ON audit_logging(created_at DESC);
CREATE INDEX idx_audit_logging_actor ON audit_logging(actor_profile_id);
CREATE INDEX idx_audit_logging_event ON audit_logging(event_name);

-- Archive table
CREATE INDEX idx_audit_archive_created_at ON audit_logging_archive(created_at DESC);
CREATE INDEX idx_audit_archive_actor ON audit_logging_archive(actor_profile_id);
CREATE INDEX idx_audit_archive_event ON audit_logging_archive(event_name);
```

### Migration file

`backend/migrations/001_audit_archive_and_immutability.sql` â€” run this in the Supabase SQL Editor to set up archive table, triggers, indexes, and RLS.

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| UUID primary key | Prevents sequential ID enumeration attacks |
| FK to `profiles.id` (active only) | Ensures actor traceability; archive drops FK so logs survive profile purges |
| Dual entity ID columns (uuid + bigint) | Supports both UUID-based and legacy bigint-based entities. Check constraint enforces exactly one is set. |
| JSONB `old_values` / `new_values` | Full change capture without separate diff tables |
| JSONB `meta` | Extensible context (device info, error messages, etc.) |
| `event_status` enum (OK/FAIL/DENY) | DB-enforced valid states; mapped to user-friendly labels in app |
| `request_id` | Correlates all audit events within a single HTTP request |
| 7-day active retention | Keeps the active table small and fast; older logs move to archive |
| DB-level immutability triggers | Even the service role cannot UPDATE audit logs |

---

## Backend Implementation

### File Map

| File | Purpose |
|------|---------|
| `utils/auditLogger.js` | **Primary interface** â€” `logAuditEvent()`, `normalizeEventName()`, `EVENT_NAME_MIGRATION` |
| `repositories/auditRepository.js` | DB operations â€” queries, insert, archive, export |
| `controllers/auditController.js` | HTTP handlers â€” GET logs, GET export (CSV), POST archive |
| `routes/auditRoutes.js` | Route + middleware wiring (superadmin-only) |
| `middleware/requestIdMiddleware.js` | Generates UUID per request for correlation |
| `middleware/authMiddleware.js` | `authJWT` (strict) + `optionalAuthJWT` (best-effort for logout) |
| `middleware/roleMiddleware.js` | `requireSuperadmin` â€” role check + AUTHORIZATION.DENIED logging |

### How to log an audit event

From any controller or middleware:

```javascript
const { logAuditEvent } = require("../utils/auditLogger");

// Inside an async handler:
await logAuditEvent({
  req,                                    // Express request (IP, user-agent, requestId)
  actorId: req.user.id,                   // UUID of the acting user (required)
  eventName: "SCAN.START",               // Dot-notation preferred (old names auto-migrated)
  eventStatus: "SUCCESS",                 // SUCCESS | FAILED | DENIED â†’ auto-mapped to OK | FAIL | DENY
  entityType: "SCAN",                     // Category
  entityIdUuid: scanId,                   // Target entity UUID (optional)
  entityIdBigint: null,                   // Target entity bigint PK (optional)
  oldValues: { status: "IDLE" },          // Before snapshot (optional)
  newValues: { status: "RUNNING" },       // After snapshot (optional)
  meta: { network_id: "..." },           // Extra context (optional)
});
```

> **⚠️ Entity ID constraint:** The DB enforces `audit_logging_entity_id_oneof` — exactly **one** of `entityIdUuid` or `entityIdBigint` must be set, not both. If neither is provided, the logger auto-falls back to `actorId` as `entity_id_uuid`. If `entityIdBigint` is provided, `entity_id_uuid` is left null automatically.

### Event Name Migration

Old callers using underscore names (e.g., `LOGIN_SUCCESS`, `SCAN_TRIGGER`) continue to work â€” `normalizeEventName()` transparently converts them to dot-notation before storage:

```javascript
// Automatic migration examples:
"LOGIN_SUCCESS"      â†’ "AUTH.LOGIN"
"LOGIN_FAILED"       â†’ "AUTH.LOGIN_FAILED"
"SCAN_TRIGGER"       â†’ "SCAN.START"
"STOP_DETECTION"     â†’ "DETECTION.STOP"
"AP_ENABLE_REQUEST"  â†’ "DEVICE.AP_ENABLE"
```

### Safety guarantees

- **Never throws** â€” audit failures are caught and logged to console, never breaking the primary operation.
- **Graceful degradation** â€” if `actorId` is missing, the event is skipped with a console warning.- **Entity ID one-of** — respects the `audit_logging_entity_id_oneof` check constraint: when `entityIdBigint` is provided, `entity_id_uuid` is set to null; when neither is provided, falls back to `actorId` as uuid.- **Status mapping** â€” accepts friendly labels (`SUCCESS`, `FAILED`, `DENIED`) and auto-maps to DB enum (`OK`, `FAIL`, `DENY`).
- **IP normalization** â€” strips IPv6-mapped prefix (`::ffff:`) for Postgres `inet` compatibility.
- **Request correlation** â€” picks up `req.requestId` from `requestIdMiddleware` automatically.

---

## Frontend Implementation

### File Map

| File | Purpose |
|------|---------|
| `src/api/auditApi.js` | API client — `getAuditLogs()` + `exportAuditLogs()` (blob response) |
| `src/hooks/useAuditLogs.js` | React hook — pagination, debounced search, status/date filters, CSV export with rate limiting |
| `src/components/accounts/AuditLogsTable.jsx` | Table with expandable rows, Export CSV button, and export confirmation dialog |
| `src/pages/AccountsAudit/AccountsAudit.jsx` | Page with Accounts + Audit Logs tabs, date range filter inputs |
| `src/pages/AccountsAudit/AccountsAudit.css` | Styles including export bar, export button, and confirmation overlay |

### Features

- **Pagination** — 25 rows/page, server-side
- **Search** — free-text, 300ms debounce, searches event_name + entity_type
- **Status filter** — SUCCESS / FAILED / all
- **Date range filter** — From/To date pickers filter audit logs by `created_at`
- **Expandable rows** — click to see old→new value diff, IP, entity details
- **Module badges** — AUTH, ACCOUNTS, SCANS, DETECTION, DEVICE, PORTAL, SYSTEM
- **Actor display** — shows username > full name > email > "System"
- **Role guard** — non-superadmin users are redirected to `/dashboard`
- **Dot-notation support** — `formatEventName()` and `getEventModule()` handle both `AUTH.LOGIN` and legacy `LOGIN_SUCCESS`
- **CSV Export UI** — superadmin-only "Export CSV" button with confirmation dialog, date range required, 5-second rate limiting, loading/error states, and blob-based file download

---

## Audit Event Catalog

### Authentication Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `AUTH.LOGIN` | OK | AUTH | Successful password login | `authController.login` |
| `AUTH.LOGIN_FAILED` | FAIL | AUTH | Wrong credentials | `authController.login` |
| `AUTH.TEMP_EXPIRED` | FAIL | AUTH | Temp password expired on login | `authController.login` |
| `AUTH.LOGOUT` | OK | AUTH | User logout | `authController.logout` |
| `AUTH.REFRESH` | OK | AUTH | Silent token refresh | `authController.refresh` |

### Account Lifecycle Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `USER.CREATE` | OK/FAIL | USER | New user created by superadmin | `userController` |
| `USER.UPDATE` | OK | USER | Profile fields changed | `userController` |
| `USER.DELETE` | OK | USER | Account deleted | `userController` |
| `USER.ACTIVATE` | OK | USER | Account activated + temp password issued | `userController` |
| `USER.DEACTIVATE` | OK | USER | Account deactivated + data archived | `userController` |

### Scanning Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `SCAN.START` | OK/FAIL | SCAN | Vulnerability scan initiated | `rasPiController` |
| `SCAN.SAVE` | OK | SCAN | Scan results persisted | `rasPiController` |

### Detection Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `DETECTION.START` | OK | DETECTION_STATE | Threat detection started (new start) | `detectStateService.startOrSwitch` |
| `DETECTION.START` | FAIL | DETECTION_STATE | Server error during start attempt | `detectController.start` (catch block) |
| `DETECTION.SWITCH_TARGET` | OK | DETECTION_STATE | Network/scan changed while already RUNNING | `detectStateService.startOrSwitch` |
| `DETECTION.STOP` | OK | DETECTION_STATE | RUNNING → STOPPED transition (manual stop) | `detectStateService.stop` |
| `DETECTION.STOP` | DENY | DETECTION_STATE | Stop called but already STOPPED or FAILED (no-op) | `detectStateService.stop` |
| `DETECTION.STOP` | FAIL | DETECTION_STATE | Server error during stop attempt | `detectController.stopDetection` (catch block) |
| `DETECTION.FAILED` | OK | DETECTION_STATE | Heartbeat timeout (>30 s) auto-marked RUNNING → FAILED | `detectStateService.getStatusAndMaybeFail` |

> **DETECTION.STOP governance rules:**
> - SUCCESS is logged **once**, in the service layer, only on a real RUNNING → STOPPED transition.
> - If already STOPPED/FAILED, the endpoint returns 200 idempotently and logs a **DENIED** audit (`meta.noop = true`, `meta.current_status`).
> - FAILED audit is logged only on 500 server errors, **not** on 400 validation errors.
> - `meta` includes `{ reason_code, reason_note, trigger: "manual_stop" }`.
> - `oldValues`/`newValues` include: `status`, `active_network_id`, `active_scan_id`, `stopped_at`, `last_heartbeat_at`.
> - All detection audit events use `entityType: "DETECTION_STATE"` consistently.

> **DETECTION.FAILED notes:**
> - Only logged when `started_by_profile_id` is non-null (to satisfy FK constraint on `actor_profile_id`).
> - `eventStatus` is `OK` (the FAILED refers to the detection state, not the audit operation).

> **Entity ID constraint (`audit_logging_entity_id_oneof`):**
> - Detection events use `entityIdBigint` (scan_id) as the entity identifier.
> - `entityIdUuid` is left null when `entityIdBigint` is set (the DB enforces exactly one of the two).
> - The network_id is captured in `oldValues`/`newValues`/`meta` instead.

### Device Management Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `DEVICE.AP_ENABLE` | OK/FAIL | DEVICE | Access point enabled | `deviceMgmtRoutes` |
| `DEVICE.AP_DISABLE` | OK/FAIL | DEVICE | Access point disabled | `deviceMgmtRoutes` |
| `DEVICE.CONFIG_UPDATE` | OK | DEVICE | Configuration changed | `deviceMgmtRoutes` |

### Captive Portal Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `PORTAL.ANNOUNCEMENT_PUBLISH` | OK | PORTAL | New announcement published | `captivePortalController.publishAnnouncement` |
| `PORTAL.TERMS_PUBLISH` | OK | PORTAL | Terms & conditions updated | `captivePortalController.publishTerms` |
| `PORTAL.TIPS_UPDATE` | OK | PORTAL | Security tips updated | `captivePortalController.upsertTips` |
| `PORTAL.SYNC` | OK | PORTAL | Portal synced to device | `captivePortalController.syncPortal` |

### Authorization Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `AUTHORIZATION.DENIED` | DENY | AUTH | Non-superadmin tried restricted endpoint, or inactive account | `roleMiddleware.requireSuperadmin` |

### System Events

| Event Name | Status | Entity Type | Trigger | Logged By |
|------------|--------|-------------|---------|-----------|
| `EXPORT.EXECUTED` | OK | AUDIT | CSV export downloaded | `auditController.exportAuditLogs` |
| `ARCHIVE.EXECUTED` | OK | AUDIT | Old logs archived | `auditController.archiveAuditLogs` |

---

## Security Model & Access Control

### Audit Log Access

| Role | Read Logs | Write Logs | Export | Archive | Delete |
|------|-----------|------------|--------|---------|--------|
| **Superadmin** | âœ… All logs | âœ… (automatic via actions) | âœ… CSV | âœ… Trigger archive | âŒ Never (DB trigger) |
| **Admin** | âŒ No access | âœ… (automatic via actions) | âŒ | âŒ | âŒ Never |
| **Unauthenticated** | âŒ | âŒ | âŒ | âŒ | âŒ |

### Enforcement layers

1. **Route middleware**: `authJWT` â†’ `requireSuperadmin` on all `/api/audit/*` routes
2. **Frontend guard**: `AccountsAudit.jsx` redirects non-superadmins to `/dashboard`
3. **Database immutability**: DB triggers block UPDATE on both tables, block DELETE on archive
4. **RLS policies**: INSERT-only on both tables; SELECT denied for non-service-role

### Captive Portal Write Protection

All POST routes on `/api/captivePortal/*` now require `authJWT`:
- `POST /announcement` â€” publish announcement
- `POST /terms` â€” publish terms
- `POST /tips` â€” update tips
- `POST /sync` â€” sync portal to device

### Authorization Denial Logging

When `requireSuperadmin` rejects a request (wrong role or inactive account), an `AUTHORIZATION.DENIED` event is logged with:
- The actor's user ID
- The reason (`insufficient_role` or `account_not_active`)
- The requested path (`req.originalUrl`)

---

## Data Isolation (Multi-User Scoping)

The application has **3 data sources** with different access rules:

### 1. Audit Logs (`/api/audit/logs`)

| User Type | Access |
|-----------|--------|
| Superadmin | âœ… See ALL logs from all users |
| Admin | âŒ Cannot access audit log endpoints at all |

**Enforcement:** `requireSuperadmin` middleware + `AUTHORIZATION.DENIED` logging.

### 2. Vulnerability Scan History (`/api/history/vulnerabilities`)

| User Type | Access |
|-----------|--------|
| Superadmin | âœ… All scans |
| Admin | âœ… **Own scans only** (filtered by `vulnerability_scans.requested_by_profile_id`) |
| Unauthenticated | âŒ Blocked (JWT required) |

### 3. Threat Detection History (`/api/history/threats`)

| User Type | Access |
|-----------|--------|
| Superadmin | âœ… All detections |
| Admin | âœ… **Own detections only** (same scoping as vulnerability history) |
| Unauthenticated | âŒ Blocked (JWT required) |

### How user-scoping works

```
Request â†’ authJWT (extract req.user) â†’ historyController:

  1. If superadmin â†’ return ALL records (no filter applied)
  2. If admin:
     a. Query vulnerability_scans WHERE requested_by_profile_id = req.user.id
     b. Extract unique network_ids from those rows
     c. Query scans WHERE network_id IN (user's network_ids)
     d. Return only matching scan records with their findings
  3. Empty result if user has no scan history
```

**Implementation:** `backend/controllers/historyController.js` + `backend/routes/historyRoutes.js`

---

## Retention & Archival

### Strategy: 7-Day Active + Long-Term Archive

| Table | Retention | Purpose |
|-------|-----------|---------|
| `audit_logging` | 7 days | Fast queries, small table |
| `audit_logging_archive` | Indefinite | Compliance, historical review |

### How archival works

1. Superadmin triggers `POST /api/audit/archive`
2. Repository finds all rows in `audit_logging` older than 7 days
3. Rows are **copied** to `audit_logging_archive` (batch of 5000)
4. Copied rows are **deleted** from `audit_logging`
5. An `ARCHIVE.EXECUTED` event is logged with the count of archived rows

### Archive table differences from active

- **No FK to `profiles`** â€” archived logs survive profile deletions
- **No DELETE trigger** â€” archive rows are permanent
- **Extra column: `archived_at`** â€” timestamp when the row was archived

### Future: Automated archival

Consider adding a Supabase Edge Function or pg_cron job to run archival automatically:

```sql
-- Example pg_cron schedule (daily at 3 AM UTC)
SELECT cron.schedule('archive-audit-logs', '0 3 * * *', $$
  -- Call the archive function or HTTP endpoint
$$);
```

---

## CSV Export

### Endpoint: `GET /api/audit/export`

- **Auth:** JWT + Superadmin role required
- **Format:** RFC 4180 compliant CSV
- **Max rows:** 10,000 per export
- **Filename:** `audit-logs-YYYY-MM-DD.csv`

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | string | "" | Start date (YYYY-MM-DD) |
| `to` | string | "" | End date (YYYY-MM-DD) |
| `status` | string | "" | Filter: `SUCCESS`, `FAILED`, `DENIED`, or empty for all |

### CSV Columns

```
created_at,event_name,event_status,entity_type,actor_email,actor_username,actor_ip,entity_id_uuid,entity_id_bigint,request_id,user_agent,meta
```

### Self-auditing

Every export triggers an `EXPORT.EXECUTED` audit event recording who exported, when, and how many rows.

### Frontend Export UI

The audit export is accessible directly from the **Audit Logs** tab in the `AccountsAudit` page (superadmin only).

**UI Components:**

| Component | Location | Purpose |
|-----------|----------|---------|
| Date range inputs | `AccountsAudit.jsx` top bar | **From** and **To** date pickers shown when Audit Logs tab is active |
| "Export CSV" button | `AuditLogsTable.jsx` export bar | Triggers the export flow; disabled until both dates are selected |
| Confirmation dialog | `AuditLogsTable.jsx` overlay | Shows date range and warns the action will be recorded; Cancel / Export buttons |
| Error message | `AuditLogsTable.jsx` export bar | Inline red text if export fails or rate-limited |

**Export Flow:**

```
1. Superadmin selects From + To dates in the top bar filters
2. "Export CSV" button becomes enabled
3. Click → confirmation overlay appears:
     "Export audit logs from {from} to {to} as CSV?
      This action will be recorded in the audit log."
4. Click "Export" → useAuditLogs.handleExport() fires:
     a. Rate-limit check (5-second cooldown between exports)
     b. Validate both dates present and from ≤ to
     c. Call auditApi.exportAuditLogs({ from, to, status })
     d. Receive CSV blob response
     e. Create temporary <a> element, trigger download
     f. Filename: audit_logs_{from}_{to}.csv
5. Backend simultaneously logs EXPORT.EXECUTED audit event
```

**Safeguards:**

- **Date range required** — export button is disabled unless both From and To dates are set
- **Rate limiting** — 5-second cooldown between consecutive exports (client-side)
- **Date validation** — start date cannot be after end date
- **Loading state** — button text changes to "Exporting…" and is disabled during the request
- **Error display** — validation errors and server errors shown inline below the button
- **Role check** — export bar only renders for users with `role === "superadmin"`

---

## Industry Standards & Compliance

| Standard | Requirement | How We Meet It |
|----------|-------------|----------------|
| **SOC 2 CC6.1** | Logical access logging | All auth events logged with actor IP |
| **SOC 2 CC7.2** | System monitoring | Comprehensive event coverage + alerting meta |
| **ISO 27001 A.12.4** | Audit logging | Append-only logs with immutability triggers |
| **NIST AU-2** | Auditable events | Full event catalog with dot-notation naming |
| **NIST AU-3** | Content of audit records | Actor, action, target, timestamp, IP, old/new values |
| **NIST AU-9** | Protection of audit info | DB triggers prevent modification; archive is permanent |
| **NIST AU-11** | Audit record retention | 7-day active + indefinite archive |
| **OWASP ASVS V7** | Error handling & logging | Fire-and-forget design; audit failures never break operations |

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
| `sort` | string | "created_at" | Sort column (whitelisted) |
| `dir` | string | "desc" | Sort direction: `asc` or `desc` |
| `startDate` | ISO string | "" | Date range start |
| `endDate` | ISO string | "" | Date range end |

**Response:**

```json
{
  "logs": [
    {
      "id": "uuid",
      "createdAt": "2026-03-03T10:00:00Z",
      "requestId": "uuid",
      "eventName": "AUTH.LOGIN",
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

### GET /api/audit/export

**Auth:** JWT + Superadmin role required

**Query Parameters:** `search`, `status`, `startDate`, `endDate`

**Response:** CSV file download with `Content-Disposition: attachment; filename="audit_logs_YYYY-MM-DD.csv"` header.

### POST /api/audit/archive

**Auth:** JWT + Superadmin role required

**Request Body:** None required

**Response:**

```json
{
  "archived": 42,
  "message": "42 audit log(s) older than 7 days archived successfully."
}
```

### GET /api/history/vulnerabilities

**Auth:** JWT required (user-scoped)

**Response:** Array of scan records with vulnerability findings (filtered by user for admin, all for superadmin).

### GET /api/history/threats

**Auth:** JWT required (user-scoped)

**Response:** Array of scan records with threat findings (filtered by user for admin, all for superadmin).

---

## Testing

### Existing test coverage

- Unit tests: `backend/__tests__/unit/` (exportFormatters, normalization, scoring, sorting)
- Integration tests: `backend/__tests__/integration/` (auth, authorization, deviceMgmt, scanIngestion)

### Recommended tests

| Test | Type | Priority |
|------|------|----------|
| `auditRepository.insertAuditLog` â€” validates required fields | Unit | HIGH |
| `auditRepository.insertAuditLog` â€” rejects invalid event_status | Unit | HIGH |
| `auditRepository.getAuditLogs` â€” pagination, date range | Unit | MEDIUM |
| `auditRepository.archiveOldLogs` â€” moves rows correctly | Integration | HIGH |
| `auditController.getAuditLogs` â€” response shape | Integration | HIGH |
| `auditController.exportAuditLogs` â€” CSV headers, content | Integration | MEDIUM |
| `auditRoutes` â€” 401 without JWT | Integration | HIGH |
| `auditRoutes` â€” 403 for non-superadmin + AUTHORIZATION.DENIED logged | Integration | HIGH |
| `logAuditEvent` â€” never throws on error | Unit | HIGH |
| `normalizeEventName` â€” migration map correctness | Unit | HIGH |
| `historyController` â€” user-scoping (admin sees own, superadmin sees all) | Integration | CRITICAL |
| `historyRoutes` â€” 401 without JWT | Integration | HIGH |
| `captivePortalRoutes` â€” POST routes require authJWT | Integration | HIGH |

### Running tests

```bash
cd backend
npm test                    # Run all tests
npm test -- --coverage      # With coverage report
npm test -- __tests__/unit/auditRepository.test.js  # Single file
```

---

## Troubleshooting

### Audit logs not appearing

1. **Check actor ID exists in `profiles`** â€” FK constraint requires valid `actor_profile_id`
2. **Check console for `[auditLogger] Skipping audit log â€” no actorId`** â€” means `req.user.id` was not available
3. **Check console for `[auditRepository] insertAuditLog error`** â€” DB constraint violation
4. **Check if requestIdMiddleware is wired** â€” should be in `server.js` before routes

### "Failed to fetch audit logs" on frontend

1. Verify user has `superadmin` role in `profiles` table
2. Check JWT is being sent (`Authorization: Bearer ...` header)
3. Check CORS â€” frontend must be on `http://localhost:5173`

### History returns empty for admin users

1. Verify the user has rows in `vulnerability_scans` where `requested_by_profile_id` matches their profile ID
2. If scans were created before user-scoping was added, `requested_by_profile_id` may be null â€” those scans won't appear for admin users (superadmin still sees all)

### Common DB errors

| Error | Cause | Fix |
|-------|-------|-----|
| `violates foreign key constraint "audit_logging_actor_profile_id_fkey"` | Actor UUID doesn't exist in `profiles` | Ensure user has a profile row before logging |
| `invalid input value for enum audit_event_status` | Wrong status value | Use only `OK`, `FAIL`, or `DENY` |
| `Audit logs are immutable` | Attempted UPDATE/DELETE on audit table | This is by design â€” audit logs cannot be modified |
| `violates check constraint "audit_logging_entity_id_oneof"` | Both entity_id columns are set, or both are null | Pass exactly **one** of `entityIdUuid` or `entityIdBigint`. If neither is passed, logger falls back to `actorId` as uuid. If `entityIdBigint` is passed, do **not** also pass `entityIdUuid`. |

---

## Implementation Status

### âœ… Complete

- [x] Database schema (`audit_logging` + `audit_logging_archive` tables)
- [x] Immutability triggers (block UPDATE/DELETE at DB level)
- [x] Indexes on created_at, actor_profile_id, event_name
- [x] Repository layer (paginated query, insert, archive, export)
- [x] Fire-and-forget audit logger with dot-notation migration
- [x] Request ID middleware (UUID per request for correlation)
- [x] Controller + routes for reading, exporting (CSV), and archiving logs
- [x] Frontend: API client, hook, table component with dot-notation support
- [x] Auth events logged (login, logout, token refresh, failed attempts, temp expired)
- [x] User lifecycle events logged (create, update, delete, activate, deactivate)
- [x] Scan events logged (start, save)
- [x] Detection events logged (start, switch_target, stop with SUCCESS/DENIED, failed)
- [x] Device management events logged (AP enable/disable)
- [x] Captive portal events logged (announcement, terms, tips, sync)
- [x] Authorization denial logged (403 from requireSuperadmin)
- [x] Captive portal POST routes protected with authJWT
- [x] History endpoints protected with authJWT
- [x] History endpoints user-scoped (admin=own, superadmin=all)
- [x] Optional JWT middleware for logout audit logging
- [x] 7-day retention with archive endpoint
- [x] CSV export with RFC 4180 compliance
- [x] Date range filtering on audit queries
- [x] Frontend CSV export UI (Export CSV button, confirmation dialog, date range validation, rate limiting, blob download)

### 🟡 Remaining (Low Priority)

- [ ] Automated archival (pg_cron or Supabase Edge Function)
- [ ] Drop legacy `audit_logs` table
- [ ] Add `requested_by_profile_id` column to legacy `scans` table for direct user-scoping
- [ ] Frontend UI for triggering archive
- [ ] PDF export option
- [ ] Real-time audit log streaming (WebSocket/SSE)

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
â”œâ”€â”€ migrations/
â”‚   â””â”€â”€ 001_audit_archive_and_immutability.sql  # Archive table, triggers, indexes, RLS
â”œâ”€â”€ controllers/
â”‚   â”œâ”€â”€ auditController.js       # GET logs, GET export, POST archive
â”‚   â””â”€â”€ historyController.js     # User-scoped vulnerability + threat history
â”œâ”€â”€ middleware/
â”‚   â”œâ”€â”€ authMiddleware.js         # authJWT + optionalAuthJWT
â”‚   â”œâ”€â”€ requestIdMiddleware.js    # UUID per request for correlation
â”‚   â”œâ”€â”€ roleMiddleware.js         # requireSuperadmin + AUTHORIZATION.DENIED
â”‚   â””â”€â”€ statusMiddleware.js       # requireActiveProfile
â”œâ”€â”€ repositories/
â”‚   â””â”€â”€ auditRepository.js       # DB operations (query, insert, archive, export)
â”œâ”€â”€ routes/
â”‚   â”œâ”€â”€ auditRoutes.js           # /api/audit/* (superadmin-only)
â”‚   â””â”€â”€ historyRoutes.js         # /api/history/* (JWT, user-scoped)
â”œâ”€â”€ utils/
â”‚   â””â”€â”€ auditLogger.js           # logAuditEvent() + normalizeEventName()
â”‚
src/
â”œâ”€â”€ api/
â”‚   â””â”€â”€ auditApi.js              # Frontend API client (getAuditLogs + exportAuditLogs)
â”œâ”€â”€ hooks/
â”‚   â””â”€â”€ useAuditLogs.js          # React hook (pagination, search, filters, CSV export)
â”œâ”€â”€ components/
â”‚   â””â”€â”€ accounts/
â”‚       â””â”€â”€ AuditLogsTable.jsx   # Table UI with expandable rows + export bar + confirmation dialog
â””â”€â”€ pages/
    â””â”€â”€ AccountsAudit/
        â””â”€â”€ AccountsAudit.jsx    # Page (tabs: Accounts + Audit Logs, date range filters)
```
