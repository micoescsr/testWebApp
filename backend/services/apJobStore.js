// services/apJobStore.js
//
// Temporary in-memory store for async AP orchestration jobs.
// Tracks active jobs so the backend can prevent duplicates and
// drive the idempotent finalizeJob() helper on terminal state.
//
// ⚠️  TEMPORARY — loses state on server restart / deploy.
// Replace with a DB-backed table (async_ap_jobs) when ready.
// The interface is designed for drop-in replacement.

const TERMINAL_STATUSES = new Set(['DONE', 'FAILED']);
const COMPLETED_TTL_MS = 10 * 60 * 1000; // evict completed jobs after 10 min

/** @type {Map<string, Job>} */
const jobs = new Map();

// In-process guard: tracks job IDs currently being finalized so concurrent
// polls for the same terminal job don't trigger duplicate DB writes / Pi calls.
/** @type {Map<string, Promise<void>>} */
const finalizingJobs = new Map();

/**
 * @typedef {Object} Job
 * @property {string}  job_id
 * @property {string}  network_id
 * @property {string|null} scan_id
 * @property {string}  target_ap_status - "enable" | "disable"
 * @property {string}  status           - ACCEPTED | ONGOING | DONE | FAILED
 * @property {Object|null} payload_snapshot
 * @property {Object|null} result
 * @property {string|null} error_code
 * @property {string|null} error_message
 * @property {boolean} finalized        - true after finalizeJob() completes DB writes
 * @property {string}  created_at
 * @property {string}  updated_at
 * @property {string|null} completed_at
 */

/** Create and store a new job record. */
function create({ job_id, network_id, scan_id, target_ap_status, payload_snapshot }) {
  const now = new Date().toISOString();
  const job = {
    job_id,
    network_id,
    scan_id: scan_id || null,
    target_ap_status,
    status: 'ACCEPTED',
    payload_snapshot: payload_snapshot || null,
    result: null,
    error_code: null,
    error_message: null,
    finalized: false,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
  jobs.set(job_id, job);
  return job;
}

/** Get a job by ID. Returns the job object or null. */
function get(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * Return the active (non-terminal, non-finalized) job for a network, or null.
 * Used for duplicate-job prevention.
 */
function getActiveForNetwork(networkId) {
  for (const job of jobs.values()) {
    if (job.network_id === networkId && !TERMINAL_STATUSES.has(job.status)) {
      return job;
    }
  }
  return null;
}

/** Update a job's status and optional fields. */
function update(jobId, fields) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, fields, { updated_at: new Date().toISOString() });
  if (TERMINAL_STATUSES.has(job.status) && !job.completed_at) {
    job.completed_at = job.updated_at;
  }
  return job;
}

/** Mark a job as finalized (DB writes complete). Idempotent. */
function markFinalized(jobId) {
  const job = jobs.get(jobId);
  if (job) {
    job.finalized = true;
    job.updated_at = new Date().toISOString();
  }
  finalizingJobs.delete(jobId);
  return job;
}

/**
 * Acquire the finalization lock for a job ID. Returns true if this caller
 * won the lock; false if another call is already finalizing this job.
 * The lock is released by markFinalized() or releaseFinalizingLock().
 */
function tryAcquireFinalizing(jobId) {
  if (finalizingJobs.has(jobId)) return false;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  promise._resolve = resolve;
  finalizingJobs.set(jobId, promise);
  return true;
}

/** Release the finalization lock without marking finalized (for error paths). */
function releaseFinalizingLock(jobId) {
  const p = finalizingJobs.get(jobId);
  if (p?._resolve) p._resolve();
  finalizingJobs.delete(jobId);
}

/** Check if a job is currently being finalized. */
function isFinalizing(jobId) {
  return finalizingJobs.has(jobId);
}

/** Remove stale completed jobs older than TTL. Call periodically. */
function cleanup() {
  const cutoff = Date.now() - COMPLETED_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.completed_at && new Date(job.completed_at).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}

/** Clear all jobs. For testing only. */
function _reset() {
  jobs.clear();
  finalizingJobs.clear();
}

/** Return count of stored jobs. For diagnostics. */
function size() {
  return jobs.size;
}

// Periodic cleanup every 5 minutes
const _cleanupTimer = setInterval(cleanup, 5 * 60 * 1000);
_cleanupTimer.unref?.(); // don't keep process alive for cleanup

module.exports = {
  create,
  get,
  getActiveForNetwork,
  update,
  markFinalized,
  tryAcquireFinalizing,
  releaseFinalizingLock,
  isFinalizing,
  cleanup,
  size,
  _reset,
  TERMINAL_STATUSES,
};
