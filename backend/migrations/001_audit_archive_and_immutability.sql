-- =============================================================================
-- AUDIT LOGGING SYSTEM — SQL MIGRATION
-- =============================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--
-- This migration:
--   1. Creates the audit_logging_archive table (mirrors active table)
--   2. Adds performance indexes on both tables
--   3. Creates immutability triggers (block UPDATE on both; block DELETE on archive)
--   4. Sets up RLS policies (append-only enforcement)
--
-- SAFE TO RE-RUN: Uses IF NOT EXISTS / OR REPLACE throughout.
-- =============================================================================

-- ─── 1. Archive Table ────────────────────────────────────────────────────────
-- Structure must match active table exactly.

CREATE TABLE IF NOT EXISTS public.audit_logging_archive (
  audit_log_id         uuid           NOT NULL DEFAULT gen_random_uuid(),
  created_at           timestamptz    NOT NULL DEFAULT now(),
  actor_profile_id     uuid           NOT NULL,
  request_id           uuid,
  actor_ip             inet,
  user_agent           text,
  event_name           text           NOT NULL,
  event_status         text           NOT NULL,
  entity_type          text           NOT NULL,
  entity_id_uuid       uuid,
  entity_id_bigint     bigint,
  old_values           jsonb,
  new_values           jsonb,
  meta                 jsonb,
  CONSTRAINT audit_logging_archive_pkey PRIMARY KEY (audit_log_id)
);

-- FK to profiles is intentionally omitted on archive table so that
-- archived logs survive even if profiles are later purged.

COMMENT ON TABLE public.audit_logging_archive IS
  'Append-only archive of audit logs older than 7 days. Moved by archival process.';


-- ─── 2. Performance Indexes ─────────────────────────────────────────────────

-- Active table
CREATE INDEX IF NOT EXISTS idx_audit_logging_created_at
  ON public.audit_logging (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logging_actor_profile_id
  ON public.audit_logging (actor_profile_id);

CREATE INDEX IF NOT EXISTS idx_audit_logging_event_name
  ON public.audit_logging (event_name);

-- Archive table
CREATE INDEX IF NOT EXISTS idx_audit_logging_archive_created_at
  ON public.audit_logging_archive (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logging_archive_actor_profile_id
  ON public.audit_logging_archive (actor_profile_id);

CREATE INDEX IF NOT EXISTS idx_audit_logging_archive_event_name
  ON public.audit_logging_archive (event_name);


-- ─── 3. Immutability Triggers ───────────────────────────────────────────────

-- 3.1 Block UPDATE on both tables
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified — append-only enforcement';
END;
$$ LANGUAGE plpgsql;

-- Active table: block UPDATE
DROP TRIGGER IF EXISTS no_update_audit ON public.audit_logging;
CREATE TRIGGER no_update_audit
  BEFORE UPDATE ON public.audit_logging
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();

-- Archive table: block UPDATE
DROP TRIGGER IF EXISTS no_update_audit_archive ON public.audit_logging_archive;
CREATE TRIGGER no_update_audit_archive
  BEFORE UPDATE ON public.audit_logging_archive
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();

-- 3.2 Block DELETE on archive table (only controlled archival may delete from active)
DROP TRIGGER IF EXISTS no_delete_archive ON public.audit_logging_archive;
CREATE TRIGGER no_delete_archive
  BEFORE DELETE ON public.audit_logging_archive
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();


-- ─── 4. Row-Level Security ──────────────────────────────────────────────────

-- 4.1 Active table
ALTER TABLE public.audit_logging ENABLE ROW LEVEL SECURITY;

-- Allow INSERT only (service role bypasses RLS, but this protects anon/authenticated)
DROP POLICY IF EXISTS audit_insert_only ON public.audit_logging;
CREATE POLICY audit_insert_only ON public.audit_logging
  FOR INSERT
  WITH CHECK (true);

-- Allow SELECT for service role only (no direct reads from client)
DROP POLICY IF EXISTS audit_select_service ON public.audit_logging;
CREATE POLICY audit_select_service ON public.audit_logging
  FOR SELECT
  USING (false);
  -- Service role key bypasses RLS; authenticated users get nothing.

-- Explicitly deny UPDATE and DELETE at policy level (backup for triggers)
-- RLS with no matching policy = deny by default, so no policy needed for UPDATE/DELETE.

-- 4.2 Archive table
ALTER TABLE public.audit_logging_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archive_insert_only ON public.audit_logging_archive;
CREATE POLICY archive_insert_only ON public.audit_logging_archive
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS archive_select_service ON public.audit_logging_archive;
CREATE POLICY archive_select_service ON public.audit_logging_archive
  FOR SELECT
  USING (false);


-- ─── 5. Verify ─────────────────────────────────────────────────────────────

-- Quick verification query (run after migration):
-- SELECT count(*) AS active_count FROM public.audit_logging;
-- SELECT count(*) AS archive_count FROM public.audit_logging_archive;
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('audit_logging', 'audit_logging_archive');
