// services/detectStateService.js
//
// Single source of truth for detection state, backed by `public.detection_state`.
// Row with device_id=1 is the only row used (single-device system).

const { supabaseClient } = require("../config/supabaseClient");
const { logAuditEvent } = require("../utils/auditLogger");

const DEVICE_ID = 1;
const HEARTBEAT_TIMEOUT_SEC = 30; // FAILED after 30 s without heartbeat
const MAX_RETRIES = 2; // optimistic-lock retry limit
const SERVER_PING_INTERVAL_MS = 10_000; // 10 s — server-side liveness check interval

const FASTAPI_BASE =
  process.env.FASTAPI_BASE || "http://mothership-1.tail781e52.ts.net:8000";

// ─── Helpers ────────────────────────────────────────────────────

/** Returns true when `ts` is older than `thresholdSec` seconds ago (or null). */
function isStale(ts, thresholdSec) {
  if (!ts) return true;
  const age = (Date.now() - new Date(ts).getTime()) / 1000;
  return age > thresholdSec;
}

/**
 * Optimistic-lock update: only succeeds when `updated_at` hasn't changed
 * since the caller last read it.  Returns { data, error }.
 */
async function lockedUpdate(payload, previousUpdatedAt) {
  const { data, error } = await supabaseClient
    .from("detection_state")
    .update(payload)
    .eq("device_id", DEVICE_ID)
    .eq("updated_at", previousUpdatedAt)
    .select("*")
    .maybeSingle();

  return { data, error };
}

/** Fetch the current row (always device_id=1). */
async function fetchRow() {
  const { data, error } = await supabaseClient
    .from("detection_state")
    .select("*")
    .eq("device_id", DEVICE_ID)
    .maybeSingle();
  return { data, error };
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Ensure a detection_state row exists for DEVICE_ID.
 * Call on server startup or before any read/update.
 */
async function ensureRow() {
  const { data } = await fetchRow();
  if (data) return data;

  const { data: inserted, error } = await supabaseClient
    .from("detection_state")
    .insert({
      device_id: DEVICE_ID,
      status: "STOPPED",
      active_network_id: null,
      active_scan_id: null,
      started_by_profile_id: null,
      started_at: null,
      stopped_at: null,
      last_heartbeat_at: null,
      failure_reason: null,
    })
    .select("*")
    .single();

  if (error) {
    // Race: another process inserted between our SELECT and INSERT
    if (error.code === "23505") {
      const { data: existing } = await fetchRow();
      return existing;
    }
    throw error;
  }
  return inserted;
}

/**
 * Read current state; if RUNNING but heartbeat timed out → mark FAILED.
 * Returns the (possibly updated) row.
 */
async function getStatusAndMaybeFail(req) {
  let row = await ensureRow();

  if (row.status === "RUNNING" && isStale(row.last_heartbeat_at, HEARTBEAT_TIMEOUT_SEC)) {
    const now = new Date().toISOString();
    const oldRow = { ...row };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { data: updated, error } = await lockedUpdate(
        {
          status: "FAILED",
          failure_reason: "heartbeat timeout",
          stopped_at: now,
          updated_at: now,
        },
        row.updated_at
      );

      if (error) throw error;
      if (updated) {
        // Audit: DETECTION_FAILED
        await logAuditEvent({
          req,
          actorId: row.started_by_profile_id || "00000000-0000-0000-0000-000000000000",
          eventName: "DETECTION_FAILED",
          eventStatus: "SUCCESS",
          entityType: "DETECTION_STATE",
          entityIdBigint: row.active_scan_id,
          oldValues: { status: oldRow.status, network_id: oldRow.active_network_id, scan_id: oldRow.active_scan_id },
          newValues: { status: "FAILED", failure_reason: "heartbeat timeout" },
          meta: { device_id: DEVICE_ID },
        }).catch(() => {});

        row = updated;
        break;
      }
      // Retry: refetch and check again
      const { data: latest } = await fetchRow();
      if (!latest || latest.status !== "RUNNING") {
        row = latest || row;
        break;
      }
      row = latest;
    }
  }

  return row;
}

/**
 * Start detection or switch to a new network/scan atomically.
 *
 * @param {Object} req - Express request
 * @param {string} actorId - UUID of the admin starting detection
 * @param {string} networkId - UUID network to monitor
 * @param {number} scanIdBigint - BIGINT scan_id from public.scans
 */
async function startOrSwitch(req, actorId, networkId, scanIdBigint) {
  // Validate scan_id is numeric (bigint), never UUID
  const numericScanId = Number(scanIdBigint);
  if (!Number.isFinite(numericScanId) || numericScanId <= 0) {
    throw new Error(`scan_id must be a positive number (bigint), got: ${scanIdBigint}`);
  }

  let row = await ensureRow();
  const now = new Date().toISOString();

  // Idempotent: already RUNNING on same target
  if (
    row.status === "RUNNING" &&
    row.active_network_id === networkId &&
    row.active_scan_id === numericScanId
  ) {
    return row;
  }

  const isSwitching = row.status === "RUNNING" && (row.active_network_id !== networkId || row.active_scan_id !== numericScanId);
  const eventName = isSwitching ? "SWITCH_TARGET" : "START_DETECTION";
  const oldRow = { ...row };

  const payload = {
    status: "RUNNING",
    active_network_id: networkId,
    active_scan_id: numericScanId,
    started_by_profile_id: actorId,
    started_at: now,
    stopped_at: null,
    failure_reason: null,
    last_heartbeat_at: now,
    updated_at: now,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { data: updated, error } = await lockedUpdate(payload, row.updated_at);
    if (error) throw error;

    if (updated) {
      await logAuditEvent({
        req,
        actorId,
        eventName,
        eventStatus: "SUCCESS",
        entityType: "DETECTION_STATE",
        entityIdBigint: numericScanId,
        oldValues: {
          status: oldRow.status,
          network_id: oldRow.active_network_id,
          scan_id: oldRow.active_scan_id,
        },
        newValues: {
          status: "RUNNING",
          network_id: networkId,
          scan_id: numericScanId,
        },
        meta: { device_id: DEVICE_ID, reason: isSwitching ? "network switch" : "new start" },
      }).catch(() => {});

      return updated;
    }

    // Retry: re-read
    const { data: latest } = await fetchRow();
    if (!latest) throw new Error("detection_state row disappeared");
    row = latest;

    // Re-check idempotency after refetch
    if (
      row.status === "RUNNING" &&
      row.active_network_id === networkId &&
      row.active_scan_id === numericScanId
    ) {
      return row;
    }
  }

  throw new Error("Concurrency conflict: could not update detection_state after retries");
}

/**
 * Stop detection (governed).
 *
 * @param {Object} req - Express request
 * @param {string} actorId - UUID of the admin stopping
 * @param {{ reason_code: string, reason_note?: string }} reasonInfo - structured stop reason
 */
async function stop(req, actorId, reasonInfo) {
  const { reason_code, reason_note } = reasonInfo || {};
  let row = await ensureRow();

  // Idempotent: already STOPPED or FAILED → return row, no SUCCESS audit
  if (row.status === "STOPPED" || row.status === "FAILED") {
    return row;
  }

  const now = new Date().toISOString();
  const oldRow = { ...row };

  // STOP is not a failure: failure_reason = NULL
  const payload = {
    status: "STOPPED",
    stopped_at: now,
    failure_reason: null,
    updated_at: now,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { data: updated, error } = await lockedUpdate(payload, row.updated_at);
    if (error) throw error;

    if (updated) {
      // SUCCESS audit: only on real RUNNING → STOPPED transition
      await logAuditEvent({
        req,
        actorId,
        eventName: "DETECTION.STOP",
        eventStatus: "SUCCESS",
        entityType: "DETECTION_STATE",
        entityIdUuid: oldRow.active_network_id || null,
        entityIdBigint: oldRow.active_scan_id || null,
        oldValues: {
          status: oldRow.status,
          active_network_id: oldRow.active_network_id,
          active_scan_id: oldRow.active_scan_id,
          stopped_at: oldRow.stopped_at,
          last_heartbeat_at: oldRow.last_heartbeat_at,
        },
        newValues: {
          status: "STOPPED",
          active_network_id: updated.active_network_id,
          active_scan_id: updated.active_scan_id,
          stopped_at: updated.stopped_at,
          last_heartbeat_at: updated.last_heartbeat_at,
        },
        meta: {
          reason_code: reason_code || null,
          reason_note: reason_note || null,
          trigger: "manual_stop",
          device_id: DEVICE_ID,
        },
      }).catch(() => {});

      return updated;
    }

    const { data: latest } = await fetchRow();
    if (!latest) throw new Error("detection_state row disappeared");
    row = latest;

    if (row.status === "STOPPED" || row.status === "FAILED") {
      return row;
    }
  }

  throw new Error("Concurrency conflict: could not stop detection_state after retries");
}

/**
 * Update heartbeat timestamp. Only effective when RUNNING.
 */
async function heartbeat(req) {
  const row = await ensureRow();
  if (row.status !== "RUNNING") return row;

  const now = new Date().toISOString();
  const { data: updated, error } = await lockedUpdate(
    { last_heartbeat_at: now, updated_at: now },
    row.updated_at
  );
  if (error) throw error;
  return updated || row;
}

// ─── Server-side liveness ping ──────────────────────────────────
//
// Runs every SERVER_PING_INTERVAL_MS while Express is alive.
// Pings FastAPI's /health (or /detect/poll) directly — no browser needed.
// If the Pi answers, we update the heartbeat.  If not, we let the
// existing heartbeat-timeout logic in getStatusAndMaybeFail() handle it.
//
// This decouples the liveness signal from the frontend polling loop,
// so detection no longer FAILS just because an admin minimises the tab.

let pingIntervalHandle = null;

async function serverPing() {
  try {
    const row = await fetchRow();
    if (!row || row.status !== "RUNNING") return; // nothing to ping

    // Lightweight HEAD or GET to FastAPI — just check if it's reachable
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 s hard timeout

    const r = await fetch(`${FASTAPI_BASE}/detect/poll?max_items=1`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (r.ok) {
      // Pi is alive — refresh the heartbeat (no req needed)
      const now = new Date().toISOString();
      await lockedUpdate(
        { last_heartbeat_at: now, updated_at: now },
        row.updated_at
      ).catch(() => {}); // best-effort; next ping will retry
    }
    // If FastAPI returned non-OK, do nothing — heartbeat ages naturally
    // and getStatusAndMaybeFail() will transition to FAILED after 30 s.
  } catch (err) {
    // Network error, timeout, abort — Pi is unreachable. Do nothing.
    // Heartbeat will age → FAILED via the normal path.
    if (err.name !== "AbortError") {
      console.warn("[serverPing] FastAPI unreachable:", err.message);
    }
  }
}

/** Start the server-side heartbeat loop. Call once on server startup. */
function startServerHeartbeatLoop() {
  if (pingIntervalHandle) return; // already running

  pingIntervalHandle = setInterval(serverPing, SERVER_PING_INTERVAL_MS);
  console.log(`[detectState] Server heartbeat loop started (every ${SERVER_PING_INTERVAL_MS / 1000}s)`);

  // Run one immediately so we don't wait 10 s for the first check
  serverPing();
}

/** Stop the server-side heartbeat loop (for graceful shutdown / tests). */
function stopServerHeartbeatLoop() {
  if (pingIntervalHandle) {
    clearInterval(pingIntervalHandle);
    pingIntervalHandle = null;
    console.log("[detectState] Server heartbeat loop stopped");
  }
}

module.exports = {
  ensureRow,
  getStatusAndMaybeFail,
  startOrSwitch,
  stop,
  heartbeat,
  startServerHeartbeatLoop,
  stopServerHeartbeatLoop,
  HEARTBEAT_TIMEOUT_SEC,
};
