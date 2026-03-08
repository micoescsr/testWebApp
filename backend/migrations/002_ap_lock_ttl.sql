-- Migration: Add ap_apply_locked_at column to networks table
-- Purpose: Enable TTL-based auto-expiry of the AP apply lock (C11 fix)
--
-- The ap_apply_in_progress boolean flag has no timeout — if a request crashes
-- mid-operation, the lock stays true forever, permanently blocking AP operations.
-- This column records WHEN the lock was acquired, allowing the application to
-- auto-release stale locks older than a configurable TTL (default: 120 seconds).

ALTER TABLE public.networks
ADD COLUMN IF NOT EXISTS ap_apply_locked_at timestamptz DEFAULT NULL;

-- When ap_apply_in_progress is false, locked_at should be null (consistent state)
UPDATE public.networks
SET ap_apply_locked_at = NULL
WHERE ap_apply_in_progress = false;
