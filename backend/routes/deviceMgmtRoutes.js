// routes/deviceMgmtRoutes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabaseClient } = require('../config/supabaseClient');
const {
	validateScan,
	validateNetworkConfig,
	validateApPassword,
	buildPortalPatchPayload,
} = require('../utils/scanValidation');
const { seedDefaultContent, buildPortalPayloadFromDB } = require('../controllers/captivePortalController');
const { computePortalTipsetHash, resolveFinalPortalTipsForNetwork } = require('../utils/portalTipResolver');
const { logAuditEvent } = require('../utils/auditLogger');
const { onScanCompleted } = require('../utils/riskPipeline');
const { validateUUID } = require('../middleware/validateUUID');
const { piFetch } = require('../utils/piFetch');
const { validate, deviceEnableAp, devicePortalUpdate, deviceJobPoll } = require('../validators/routeValidators');
const apJobStore = require('../services/apJobStore');

const SCAN_MAX_AGE_SECONDS = parseInt(process.env.SCAN_MAX_AGE_SECONDS || '300', 10); // default 5 min
const SCAN_RUNNER_TOKEN = process.env.SCAN_RUNNER_TOKEN || ''; // shared secret for webhook
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AP_LOCK_TTL_SECONDS = parseInt(process.env.AP_LOCK_TTL_SECONDS || '120', 10); // C11 fix: auto-expire stale locks

// ─── Portal patch constants ──────────────────────────────────────
const VALID_UPDATE_TYPES = new Set(['announcement', 'tips', 'risk', 'active', 'bulk']);
const ALLOWED_PAYLOAD_KEYS = new Set(['announcement', 'tips', 'risk', 'is_active']);
const VALID_RISK_BUCKETS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// Keys allowed per update_type (besides is_active which is always optional)
const KEYS_BY_UPDATE_TYPE = {
	announcement: new Set(['announcement', 'is_active']),
	tips: new Set(['tips', 'is_active']),
	risk: new Set(['risk', 'is_active']),
	active: new Set(['is_active']),
	bulk: ALLOWED_PAYLOAD_KEYS, // all allowed
};

// ─── Helper: release the AP apply lock ───────────────────────────
async function releaseApLock(networkId) {
	try {
		await supabaseClient
			.from('networks')
			.update({ ap_apply_in_progress: false, ap_apply_locked_at: null })
			.eq('network_id', networkId);
	} catch (e) {
		console.error('[releaseApLock] Failed to release lock for', networkId, e.message);
	}
}

// ─── Helper: log FastAPI call details ────────────────────────────
function logFastApiCall(label, url, payload, response) {
	console.log(`\n${'═'.repeat(3)} FastAPI ${label} ${'═'.repeat(3)}`);
	console.log('URL:', url);
	console.log('Payload:', JSON.stringify(payload, null, 2));
	if (response) {
		console.log('Response status:', response.status);
		console.log('Response body:', JSON.stringify(response.body, null, 2));
	}
	console.log('═'.repeat(40));
}

// ─── Helper: typed HTTP error for structured catch handling ──────
function httpError(status, code, message, extra = {}) {
	const e = new Error(message);
	e.status = status;
	e.code = code;
	e.extra = extra;
	return e;
}

// ─── Helper: classify FastAPI orchestrate/apply error response ───
// Maps user_message patterns from FastAPI to structured error codes
// so the frontend can show the right prompt / action.
function classifyOrchestrateError(fastapiData) {
	if (!fastapiData || fastapiData.status !== 'ERROR') return null;

	const msg = fastapiData.user_message || '';
	const uplink = fastapiData.uplink || {};
	const mismatched = uplink.mismatched_fields || uplink.strict_match?.mismatched_fields || [];
	const reasonCode = uplink.reason_code || null;

	// Pi management network conflict
	if (msg.includes("matches the Pi's management network")) {
		return {
			error_code: 'PI_NETWORK_CONFLICT',
			category: 'rejected',
			user_message: msg,
			retryable: false,
		};
	}

	// SSID not found
	if (msg.includes('SSID cannot be found')) {
		return {
			error_code: 'SSID_NOT_FOUND',
			category: 'not_found',
			user_message: msg,
			retryable: false,
		};
	}

	// Password required
	if (msg.includes('Password is required')) {
		return {
			error_code: 'PASSWORD_REQUIRED',
			category: 'auth',
			user_message: msg,
			retryable: true,
		};
	}

	// Incorrect password
	if (msg.includes('Incorrect Wi-Fi password')) {
		return {
			error_code: 'INCORRECT_PASSWORD',
			category: 'auth',
			user_message: msg,
			retryable: true,
		};
	}

	// Security/encryption type mismatch
	if (msg.includes("security type doesn't match")) {
		return {
			error_code: 'ENCRYPTION_MISMATCH',
			category: 'outdated',
			user_message: msg,
			mismatched_fields: ['encryption_type'],
			retryable: false,
			needs_rescan: true,
		};
	}

	// Field-level mismatch (channel, BSSID, etc.) — data is outdated
	if (msg.includes('Refused to connect') && mismatched.length > 0) {
		return {
			error_code: 'NETWORK_DATA_OUTDATED',
			category: 'outdated',
			user_message: msg,
			mismatched_fields: mismatched,
			reason_code: reasonCode,
			retryable: false,
			needs_rescan: true,
		};
	}

	// Busy / lock
	if (msg.includes('Busy:') || msg.includes('wifi_ops_lock')) {
		return {
			error_code: 'DEVICE_BUSY',
			category: 'busy',
			user_message: msg,
			retryable: true,
		};
	}

	// Invalid payload
	if (msg.includes('Invalid payload')) {
		return {
			error_code: 'INVALID_PAYLOAD',
			category: 'validation',
			user_message: msg,
			retryable: false,
		};
	}

	// Internal exception on device
	if (msg.includes('Exception:')) {
		return {
			error_code: 'DEVICE_EXCEPTION',
			category: 'internal',
			user_message: msg,
			retryable: true,
		};
	}

	// Uplink disconnected (AP ended up off)
	if (msg.includes('Uplink disconnected')) {
		return {
			error_code: 'UPLINK_DISCONNECTED',
			category: 'connection',
			user_message: msg,
			retryable: true,
		};
	}

	// Generic connection failure (weak signal, timeout, etc.)
	if (msg.includes("Couldn't connect")) {
		return {
			error_code: 'CONNECTION_FAILED',
			category: 'connection',
			user_message: msg,
			retryable: true,
		};
	}

	// Catch-all for any other ERROR status
	return {
		error_code: 'ORCHESTRATE_ERROR',
		category: 'unknown',
		user_message: msg || 'An unexpected error occurred during AP configuration.',
		retryable: false,
	};
}

// ─── Phase 2-C: All browser-called device routes require JWT ────
const { authJWT } = require('../middleware/authMiddleware');
const { requireActiveProfile } = require('../middleware/statusMiddleware');
const { requireAAL2 } = require('../middleware/mfaMiddleware');

// ─── Legacy toggle signal (keep for backward compat) ────────────
router.post('/signal_ap', authJWT, requireActiveProfile, requireAAL2, async (req, res) => {
	try {
		const { toggleState } = req.body;
		console.log('DeviceMgmt: Received toggleState:', toggleState);
		return res.json({
			success: true,
			status: toggleState ? 'Active' : 'Disabled',
		});
	} catch (err) {
		console.error('DeviceMgmt /signal_ap error:', err);
		return res.status(500).json({ error: 'Toggle failed' });
	}
});

// ─── GET AP state from DB (source of truth) ─────────────────────
// GET /api/device/ap-state/:networkId
router.get('/ap-state/:networkId', authJWT, requireActiveProfile, requireAAL2, validateUUID('networkId'), async (req, res) => {
	try {
		const { networkId } = req.params;

		const { data, error } = await supabaseClient
			.from('networks')
			.select('ap_enabled, portal_initialized')
			.eq('network_id', networkId)
			.single();

		if (error) throw error;

		return res.json({
			ap_enabled: data.ap_enabled ?? false,
			portal_initialized: data.portal_initialized ?? false,
		});
	} catch (err) {
		console.error('deviceMgmt /ap-state error:', err);
		return res.status(500).json({ error: 'Failed to fetch AP state' });
	}
});

// ─── AP Toggle → orchestrate/apply ───────────────────────────────
// POST /api/device/enable-ap
// Body: { network_id, scan_id?, ap_status, ap_password? }
//   scan_id required only for enable (not disable)
//   Backend loads SSID/BSSID/channel/encryption from DB — never trust frontend
router.post('/enable-ap', authJWT, requireActiveProfile, requireAAL2, deviceEnableAp, validate, async (req, res) => {
	const requestId = crypto.randomUUID();
	const { network_id, scan_id, ap_status, ap_password } = req.body;
	const actorId = req.user?.id || null;
	let lockAcquired = false;
	let asyncJobAccepted = false; // when true, keep DB lock for async finalization

	// ── Basic input validation ───────────────────────────────────
	if (!network_id || !ap_status || !['enable', 'disable'].includes(ap_status)) {
		return res.status(400).json({
			error: 'Missing or invalid fields (network_id, ap_status: "enable"|"disable")',
		});
	}

	// ── Duplicate-job prevention ─────────────────────────────────
	const activeJob = apJobStore.getActiveForNetwork(network_id);
	if (activeJob) {
		return res.status(409).json({
			ok: false,
			error: 'REQUEST_IN_PROGRESS',
			message: 'An AP configuration change is already in progress.',
			job_id: activeJob.job_id,
			target_ap_status: activeJob.target_ap_status,
		});
	}

	// scan_id required only for enable; validate before locking/DB.
	if (ap_status === 'enable' && !scan_id) {
		return res.status(400).json({
			error: 'SCAN_REQUIRED',
			message: 'A recent scan is required to enable the access point.',
		});
	}

	try {
		// ── Step 0: Atomic concurrency lock with TTL ─────────────
		// Single UPDATE that checks + sets in one query to avoid races.
		// Also stamps ap_apply_locked_at so stale locks can be auto-expired.
		const { data: lockRow, error: lockErr } = await supabaseClient
			.from('networks')
			.update({ ap_apply_in_progress: true, ap_apply_locked_at: new Date().toISOString() })
			.eq('network_id', network_id)
			.eq('ap_apply_in_progress', false)
			.select('network_id')
			.maybeSingle();

		if (lockErr) throw lockErr;

		if (!lockRow) {
			// Either network doesn't exist or lock is already held
			const { data: exists } = await supabaseClient
				.from('networks')
				.select('network_id, ap_apply_in_progress, ap_apply_locked_at')
				.eq('network_id', network_id)
				.maybeSingle();

			if (!exists) {
				return res.status(404).json({ error: 'NETWORK_NOT_FOUND', message: 'Network not found.' });
			}

			// C11 fix: Check if the existing lock is stale (exceeded TTL)
			if (exists.ap_apply_in_progress && exists.ap_apply_locked_at) {
				const lockedAt = new Date(exists.ap_apply_locked_at).getTime();
				const staleCutoff = Date.now() - (AP_LOCK_TTL_SECONDS * 1000);
				if (lockedAt < staleCutoff) {
					console.warn(`[enable-ap] Stale AP lock detected for ${network_id} (locked at ${exists.ap_apply_locked_at}). Auto-releasing.`);
					// Force-release stale lock and re-acquire atomically
					const { data: reacquired, error: reacquireErr } = await supabaseClient
						.from('networks')
						.update({ ap_apply_in_progress: true, ap_apply_locked_at: new Date().toISOString() })
						.eq('network_id', network_id)
						.eq('ap_apply_in_progress', true)
						.select('network_id')
						.maybeSingle();

					if (reacquireErr) throw reacquireErr;
					if (reacquired) {
						lockAcquired = true;
						console.log(`[enable-ap] Stale lock recovered for ${network_id}`);
					} else {
						return res.status(409).json({ error: 'REQUEST_IN_PROGRESS', message: 'An AP configuration change is already in progress.' });
					}
				} else {
					return res.status(409).json({ error: 'REQUEST_IN_PROGRESS', message: 'An AP configuration change is already in progress.' });
				}
			} else {
				return res.status(409).json({ error: 'REQUEST_IN_PROGRESS', message: 'An AP configuration change is already in progress.' });
			}
		} else {
			lockAcquired = true;
		}

		// ══════════════════════════════════════════════════════════
		//  DISABLE PATH (no scan_id needed)
		// ══════════════════════════════════════════════════════════
		if (ap_status === 'disable') {
			// Load network config from DB
			const { data: net, error: netErr } = await supabaseClient
				.from('networks')
				.select('ssid, bssid, channel, encryption_status')
				.eq('network_id', network_id)
				.single();
			if (netErr) throw netErr;

			// Validate config before sending to FastAPI (same as enable)
			const configCheck = validateNetworkConfig(net);
			if (!configCheck.valid) {
				return res.status(400).json({
					error: configCheck.error,
					message: configCheck.message,
					missing: configCheck.missing,
				});
			}

			const orchestratePayload = {
				ssid: net.ssid,
				bssid: net.bssid,
				channel: net.channel,
				encryption_type: net.encryption_status,
				ap_status: 'disable',
				async: true,
			};

			const orchestrateUrl = '/orchestrate/apply';
			logFastApiCall('orchestrate/apply (DISABLE, async)', orchestrateUrl, orchestratePayload, null);

			const { ok: piOk, status: piStatus, data: fastapiData } = await piFetch('/orchestrate/apply', {
				method: 'POST',
				jsonBody: orchestratePayload,
				timeoutMs: 15_000,
			});

			logFastApiCall('orchestrate/apply RESPONSE (DISABLE)', orchestrateUrl, orchestratePayload, {
				status: piStatus,
				body: fastapiData,
			});

			if (!piOk) {
				await logAuditEvent({
					req, actorId, eventName: 'AP_DISABLE_REQUEST', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, fastapi_status: piStatus, fastapi_body: fastapiData },
				});
				throw httpError(502, 'FASTAPI_APPLY_FAILED', fastapiData?.detail || 'FastAPI orchestrate/apply failed (disable)', {
					fastapi_status: piStatus,
					fastapi_body: fastapiData,
				});
			}

			// ── Async path: Pi accepted the job ──────────────────
			if (fastapiData?.status === 'ACCEPTED' && fastapiData?.job_id) {
				asyncJobAccepted = true;
				const job = apJobStore.create({
					job_id: fastapiData.job_id,
					network_id,
					scan_id: null,
					target_ap_status: 'disable',
					payload_snapshot: orchestratePayload,
				});

				await logAuditEvent({
					req, actorId, eventName: 'AP_DISABLE_REQUEST', eventStatus: 'ACCEPTED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, job_id: job.job_id },
				});

				return res.json({
					ok: true,
					status: 'ACCEPTED',
					job_id: job.job_id,
					target_ap_status: 'disable',
					network_id,
					scan_id: null,
				});
			}

			// ── Sync fallback: Pi returned immediate result ──────
			const disableClassified = classifyOrchestrateError(fastapiData);
			if (disableClassified) {
				await logAuditEvent({
					req, actorId, eventName: 'AP_DISABLE_REQUEST', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, classified: disableClassified, fastapi_body: fastapiData },
				});
				return res.status(422).json({
					ok: false,
					error: disableClassified.error_code,
					category: disableClassified.category,
					user_message: disableClassified.user_message,
					retryable: disableClassified.retryable,
					fastapi: fastapiData,
				});
			}

			// Sync success: persist immediately
			await supabaseClient
				.from('networks')
				.update({ ap_enabled: false, ap_last_applied_at: new Date().toISOString() })
				.eq('network_id', network_id);

			console.log('AP disabled successfully (sync) for network:', network_id);

			await logAuditEvent({
				req, actorId, eventName: 'AP_DISABLE_REQUEST', eventStatus: 'SUCCESS',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: { request_id: requestId, fastapi_status: piStatus },
			});

			const responseBody = {
				ok: true,
				network_id,
				ap_enabled: false,
				ap_status: 'disable',
				fastapi: fastapiData,
			};
			return res.json(responseBody);
		}

		// ══════════════════════════════════════════════════════════
		//  ENABLE PATH (scan_id required + validated)
		// ══════════════════════════════════════════════════════════

		// Step 1: scan_id must be present
		if (!scan_id) {
			return res.status(400).json({ error: 'SCAN_REQUIRED', message: 'A recent scan is required to enable the access point.' });
		}

		// Step 2: Load scan row from vulnerability_scans (uuid scan_id, status-based gating)
		const { data: scan, error: scanErr } = await supabaseClient
			.from('vulnerability_scans')
			.select('scan_id, network_id, status, finished_at, error_code, scan_data')
			.eq('scan_id', scan_id)
			.single();

		if (scanErr || !scan) {
			return res.status(400).json({ error: 'SCAN_NOT_FOUND', message: 'Scan not found. Run a new scan first.' });
		}

		// Step 3: Validate scan (exists + network match + status + errors + data + fresh)
		const validation = validateScan(scan, network_id, SCAN_MAX_AGE_SECONDS);
		if (!validation.valid) {
			return res.status(400).json({
				error: validation.error,
				message: validation.message,
				...(validation.extras || {}),
			});
		}

		// Step 4: Load network config from DB (never trust frontend)
		const { data: net, error: netErr } = await supabaseClient
			.from('networks')
			.select('ssid, bssid, channel, encryption_status, portal_initialized, risk_score_version')
			.eq('network_id', network_id)
			.single();
		if (netErr) throw netErr;

		// Step 5: Validate network config for orchestration
		const configCheck = validateNetworkConfig(net);
		if (!configCheck.valid) {
			return res.status(400).json({
				error: configCheck.error,
				message: configCheck.message,
				missing: configCheck.missing,
			});
		}

		// Step 6: Validate AP password based on encryption type
		const pwCheck = validateApPassword(net.encryption_status, ap_password);
		if (!pwCheck.valid) {
			return res.status(400).json({
				error: pwCheck.error,
				message: pwCheck.message,
			});
		}

		// Step 7: If portal not yet initialized → seed DB content + push to FastAPI
		if (!net.portal_initialized) {
			console.log('Portal not initialized — seeding captive portal content...');

			// Seed default content into DB tables (announcements, tips)
			await seedDefaultContent(network_id);

			// Build payload from DB
			const patchPayload = await buildPortalPayloadFromDB(
				network_id, net.bssid, net.ssid
			);
			const tipsetHash = computePortalTipsetHash(patchPayload?.patch?.portal_content?.tips?.items || []);

			const portalUrl = '/portal/patch';
			logFastApiCall('portal/patch (INIT)', portalUrl, patchPayload, null);

			let portalOk, portalStatus, portalData;
			try {
				({ ok: portalOk, status: portalStatus, data: portalData } = await piFetch('/portal/patch', {
					method: 'POST',
					jsonBody: patchPayload,
					timeoutMs: 15_000,
				}));
			} catch (portalFetchErr) {
				// Portal seed failed (timeout or network error) BEFORE orchestrate/apply
				// was ever called. Catch here so the outer catch's 502/503/504
				// reconciliation branch doesn't misreport this as an AP-toggle timeout.
				console.error('[enable-ap] portal/patch (INIT) fetch error:', portalFetchErr.message);
				await logAuditEvent({
					req, actorId, eventName: 'PORTAL_PATCH', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, reason: 'portal_init', error: portalFetchErr.message },
				});
				await logAuditEvent({
					req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, scan_id, reason: 'portal_init_failed' },
				});
				return res.status(502).json({
					error: 'PORTAL_PATCH_FAILED',
					message: 'Failed to initialize captive portal. AP enable aborted.',
				});
			}

			logFastApiCall('portal/patch RESPONSE (INIT)', portalUrl, patchPayload, {
				status: portalStatus,
				body: portalData,
			});

			if (!portalOk) {
				// Audit: portal init failed — abort enable
				await logAuditEvent({
					req, actorId, eventName: 'PORTAL_PATCH', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, reason: 'portal_init', fastapi_status: portalStatus, fastapi_body: portalData },
				});
				// Also audit enable request failure so the trail is queryable
				await logAuditEvent({
					req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, scan_id, reason: 'portal_init_failed' },
				});
				return res.status(502).json({
					error: 'PORTAL_PATCH_FAILED',
					message: 'Failed to initialize captive portal. AP enable aborted.',
				});
			}

			// Re-read risk_score_version to avoid stamping a stale value
			const { data: latestNet } = await supabaseClient
				.from('networks')
				.select('risk_score_version')
				.eq('network_id', network_id)
				.single();

			// Mark initialized + stamp portal version
			const { error: updErr } = await supabaseClient
				.from('networks')
				.update({
					portal_initialized: true,
					portal_last_patched_version: latestNet?.risk_score_version ?? net.risk_score_version,
					portal_last_patched_at: new Date().toISOString(),
					portal_tipset_hash: tipsetHash,
				})
				.eq('network_id', network_id);
			if (updErr) throw updErr;

			console.log('Portal initialized successfully for', patchPayload.network_id);

			// Audit: portal init success
			await logAuditEvent({
				req, actorId, eventName: 'PORTAL_PATCH', eventStatus: 'SUCCESS',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: { request_id: requestId, reason: 'portal_init', fastapi_status: portalStatus },
			});
		}

		// Step 8: Enable AP via orchestrate/apply (config from DB, not frontend)
		const orchestratePayload = {
			ssid: net.ssid,
			bssid: net.bssid,
			channel: net.channel,
			encryption_type: net.encryption_status,
			...(ap_password && { ap_password }),
			ap_status: 'enable',
			async: true,
		};

		const orchestrateUrl = '/orchestrate/apply';
		logFastApiCall('orchestrate/apply (ENABLE, async)', orchestrateUrl, orchestratePayload, null);

		const { ok: enableOk, status: enableStatus, data: fastapiData } = await piFetch('/orchestrate/apply', {
			method: 'POST',
			jsonBody: orchestratePayload,
			timeoutMs: 15_000,
		});

		logFastApiCall('orchestrate/apply RESPONSE (ENABLE)', orchestrateUrl, orchestratePayload, {
			status: enableStatus,
			body: fastapiData,
		});

		if (!enableOk) {
			// Audit: enable failed
			await logAuditEvent({
				req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'FAILED',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: { request_id: requestId, scan_id, fastapi_status: enableStatus, fastapi_body: fastapiData },
			});
			throw httpError(502, 'FASTAPI_APPLY_FAILED', fastapiData?.detail || 'FastAPI orchestrate/apply failed (enable)', {
				fastapi_status: enableStatus,
				fastapi_body: fastapiData,
			});
		}

		// ── Async path: Pi accepted the job ──────────────────────
		if (fastapiData?.status === 'ACCEPTED' && fastapiData?.job_id) {
			asyncJobAccepted = true;
			const job = apJobStore.create({
				job_id: fastapiData.job_id,
				network_id,
				scan_id: scan.scan_id,
				target_ap_status: 'enable',
				payload_snapshot: orchestratePayload,
			});

			await logAuditEvent({
				req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'ACCEPTED',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: { request_id: requestId, job_id: job.job_id, scan_id: scan.scan_id },
			});

			return res.json({
				ok: true,
				status: 'ACCEPTED',
				job_id: job.job_id,
				target_ap_status: 'enable',
				network_id,
				scan_id: scan.scan_id,
			});
		}

		// ── Sync fallback: Pi returned immediate result ──────────

		// Step 8b: Check for application-level ERROR (FastAPI returns 200 but status: "ERROR")
		const enableClassified = classifyOrchestrateError(fastapiData);
		if (enableClassified) {
			console.warn('[enable-ap] FastAPI returned status:ERROR —', enableClassified.error_code, enableClassified.user_message);

			// Do NOT set ap_enabled=true — the AP is not actually running
			await logAuditEvent({
				req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'FAILED',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: {
					request_id: requestId,
					scan_id,
					classified: enableClassified,
					fastapi_body: fastapiData,
				},
			});

			return res.status(422).json({
				ok: false,
				error: enableClassified.error_code,
				category: enableClassified.category,
				user_message: enableClassified.user_message,
				mismatched_fields: enableClassified.mismatched_fields || null,
				needs_rescan: enableClassified.needs_rescan || false,
				retryable: enableClassified.retryable,
				fastapi: fastapiData,
			});
		}

		// Step 9: Persist ap_enabled = true + update timestamps + denormalize scan pointer
		await supabaseClient
			.from('networks')
			.update({
				ap_enabled: true,
				ap_last_applied_at: new Date().toISOString(),
				last_scan_id: scan.scan_id,
				last_scan_finished_at: scan.finished_at,
			})
			.eq('network_id', network_id);

		console.log('AP enabled successfully for network:', network_id);

		// Step 10: Push current portal content after AP enable (non-blocking).
		// Step 7 already patched on first-time init — skip the duplicate call.
		// For subsequent enables, fire-and-forget so the response isn't delayed
		// by the Pi round-trip (portal patch is non-fatal).
		const portalAlreadyPatched = !net.portal_initialized; // Step 7 just ran

		// Audit: enable success (send response immediately, don't wait for patch)
		await logAuditEvent({
			req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'SUCCESS',
			entityType: 'NETWORK', entityIdUuid: network_id,
			meta: { request_id: requestId, scan_id: scan.scan_id, fastapi_status: enableStatus, portal_patched: portalAlreadyPatched },
		});

		const responseBody = {
			ok: true,
			network_id,
			ap_enabled: true,
			portal_initialized: true,
			portal_patched: portalAlreadyPatched,
			scan: {
				scan_id: scan.scan_id,
				finished_at: scan.finished_at,
			},
			fastapi: fastapiData,
		};

		// Fire-and-forget portal patch for subsequent enables (not first-time).
		// Runs after the response is sent so the user isn't blocked.
		if (!portalAlreadyPatched) {
			setImmediate(async () => {
				try {
					const patchPayload = await buildPortalPayloadFromDB(
						network_id, net.bssid, net.ssid
					);
					const { ok: patchOk, status: patchStatus, data: patchData } = await piFetch('/portal/patch', {
						method: 'POST',
						jsonBody: patchPayload,
						timeoutMs: 15_000,
					});
					if (patchOk) {
						const nowIso = new Date().toISOString();
						const tipsetHash = computePortalTipsetHash(patchPayload?.patch?.portal_content?.tips?.items || []);
						const { data: latestNet } = await supabaseClient
							.from('networks')
							.select('risk_score_version')
							.eq('network_id', network_id)
							.single();
						await supabaseClient
							.from('networks')
							.update({
								portal_last_patched_at: nowIso,
								portal_last_patched_version: latestNet?.risk_score_version ?? net.risk_score_version,
								portal_tipset_hash: tipsetHash,
							})
							.eq('network_id', network_id);
						console.log('Portal content pushed after AP enable for network:', network_id);
					} else {
						console.warn('[enable-ap] portal/patch after enable failed (non-fatal):', patchStatus, patchData);
					}
				} catch (patchErr) {
					console.error('[enable-ap] portal/patch after enable error (non-fatal):', patchErr.message);
				}
			});
		}

		return res.json(responseBody);
	} catch (err) {
		console.error('deviceMgmt /enable-ap error:', err);

		// ── Timeout reconciliation ────────────────────────────────
		// If the Pi request timed out (504) or hit a gateway error (502/503),
		// the AP may have actually succeeded on the Pi. Poll /device/status
		// to check and reconcile DB state.
		const httpStatus = err.status || 500;
		if ([502, 503, 504].includes(httpStatus)) {
			try {
				const { ok: statusOk, data: statusData } = await piFetch('/device/status', { timeoutMs: 8_000 });
				if (statusOk && statusData) {
					const piApOn = statusData.ap_enabled === true || statusData.ap_status === 'on';
					console.log(`[reconcile] Pi reports ap_enabled=${piApOn} after timeout for ${network_id}`);

					// Update DB to match Pi's actual state
					await supabaseClient
						.from('networks')
						.update({ ap_enabled: piApOn, ap_last_applied_at: new Date().toISOString() })
						.eq('network_id', network_id);

					return res.status(200).json({
						ok: true,
						reconciled: true,
						network_id,
						ap_enabled: piApOn,
						message: piApOn
							? 'Request timed out but AP is confirmed ON.'
							: 'Request timed out and AP is confirmed OFF.',
					});
				}
			} catch (reconcileErr) {
				console.error('[reconcile] Failed to poll Pi status after timeout:', reconcileErr.message);
			}
		}

		const errorBody = {
			error: err.code || 'AP_TOGGLE_FAILED',
			message: 'AP configuration failed',
			timeout: [502, 503, 504].includes(httpStatus),
			...(err.extra || {}),
		};
		return res.status(httpStatus).json(errorBody);
	} finally {
		// ── Release lock ONLY for sync paths or errors ───────────
		// Async jobs keep the lock held until finalizeJob() runs.
		if (lockAcquired && !asyncJobAccepted) {
			await releaseApLock(network_id);
		}
	}
});

// ─── Admin State Endpoint (cheap, read-only) ─────────────────────
// GET /api/device/network/:networkId/state
// Returns authoritative AP + scan + portal + risk state for the UI
router.get('/network/:networkId/state', authJWT, requireActiveProfile, requireAAL2, validateUUID('networkId'), async (req, res) => {
	const { networkId } = req.params;
	const maxAgeSeconds = SCAN_MAX_AGE_SECONDS;

	try {
		// 1) Load network row
		const { data: net, error: netErr } = await supabaseClient
			.from('networks')
			.select([
				'network_id',
				'ap_enabled',
				'ap_apply_in_progress',
				'portal_initialized',
				'risk_score',
				'risk_bucket',
				'risk_score_version',
				'portal_last_patched_version',
				'portal_last_patched_at',
				'portal_tipset_hash',
				'last_threat_at',
				'last_scan_id',
				'last_scan_finished_at',
				'ssid',
				'bssid',
				'channel',
			].join(','))
			.eq('network_id', networkId)
			.maybeSingle();

		if (netErr) throw netErr;
		if (!net) {
			return res.status(404).json({ ok: false, error: 'NETWORK_NOT_FOUND', message: 'Network not found.' });
		}

		// 2) Load latest eligible scan (completed, no errors)
		const { data: scan, error: scanErr } = await supabaseClient
			.from('vulnerability_scans')
			.select('scan_id, finished_at, status, error_code')
			.eq('network_id', networkId)
			.eq('status', 'COMPLETED')
			.is('error_code', null)
			.order('finished_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (scanErr) throw scanErr;

		const hasScan = !!scan?.scan_id;
		const finishedAtMs = scan?.finished_at ? new Date(scan.finished_at).getTime() : null;
		const scanFresh = hasScan && finishedAtMs !== null && (Date.now() - finishedAtMs) <= maxAgeSeconds * 1000;

		// 3) Compute portal freshness
		const riskOutOfDate = Number(net.portal_last_patched_version) < Number(net.risk_score_version);
		let tipsetOutOfDate = false;
		if (net.ap_enabled) {
			try {
				const resolvedTips = await resolveFinalPortalTipsForNetwork(supabaseClient, networkId);
				const desiredHash = resolvedTips?.tipsetHash || null;
				const stampedHash = net.portal_tipset_hash || null;
				if (desiredHash && desiredHash !== stampedHash) {
					tipsetOutOfDate = true;
				}
			} catch (hashErr) {
				console.warn('[adminState] Failed to compute portal tipset hash (non-fatal):', hashErr.message);
			}
		}

		const portalOutOfDate = !!net.ap_enabled && (riskOutOfDate || tipsetOutOfDate);

		// 4) Optional: network config missing flag
		const networkConfigMissing = !net.ssid || !net.bssid || net.channel == null;

		return res.json({
			ok: true,
			network_id: net.network_id,
			ap_enabled: !!net.ap_enabled,
			ap_apply_in_progress: !!net.ap_apply_in_progress,
			portal_initialized: !!net.portal_initialized,
			scan_state: {
				has_scan: hasScan,
				scan_fresh: scanFresh,
				latest_scan_id: scan?.scan_id || null,
				latest_scan_finished_at: scan?.finished_at || null,
			},
			portal_state: {
				portal_out_of_date: portalOutOfDate,
				portal_last_patched_version: Number(net.portal_last_patched_version) || 0,
				portal_last_patched_at: net.portal_last_patched_at || null,
			},
			risk_state: {
				risk_score: Number(net.risk_score) || 0,
				risk_bucket: net.risk_bucket || 'LOW',
				risk_score_version: Number(net.risk_score_version) || 0,
				last_threat_at: net.last_threat_at || null,
			},
			flags: {
				network_config_missing: networkConfigMissing,
			},
		});
	} catch (err) {
		console.error('deviceMgmt /network/:networkId/state error:', err);
		return res.status(500).json({ ok: false, error: 'STATE_FETCH_FAILED', message: 'Failed to fetch network state' });
	}
});

// ═══════════════════════════════════════════════════════════════════
//  Async AP Job — Finalization + Poll + AP Live
// ═══════════════════════════════════════════════════════════════════

// ─── Idempotent job finalizer ────────────────────────────────────
// Called when poll detects terminal state. Uses an in-process lock
// (apJobStore.tryAcquireFinalizing) to prevent concurrent polls from
// triggering duplicate DB writes or duplicate Pi portal/patch calls.
// Also safe across server restarts: checks DB ap_apply_in_progress
// before writing, so a stale call after another path already finalized
// is a no-op.
async function finalizeJob(job, piResult) {
	if (job.finalized) return;

	// Concurrency guard: only one in-flight finalization per job ID
	if (!apJobStore.tryAcquireFinalizing(job.job_id)) {
		return; // another concurrent poll is already finalizing this job
	}

	try {
		const networkId = job.network_id;

		// Guard: only finalize if DB lock is still held
		const { data: net } = await supabaseClient
			.from('networks')
			.select('ap_apply_in_progress')
			.eq('network_id', networkId)
			.maybeSingle();

		if (!net || !net.ap_apply_in_progress) {
			apJobStore.markFinalized(job.job_id);
			return;
		}

		const isSuccess = job.status === 'DONE';
		const nowIso = new Date().toISOString();

		if (isSuccess && job.target_ap_status === 'enable') {
			await supabaseClient
				.from('networks')
				.update({
					ap_enabled: true,
					ap_last_applied_at: nowIso,
				})
				.eq('network_id', networkId);

			// Post-enable portal patch (non-fatal)
			try {
				const { data: netConfig } = await supabaseClient
					.from('networks')
					.select('bssid, ssid')
					.eq('network_id', networkId)
					.single();

				if (netConfig) {
					const patchPayload = await buildPortalPayloadFromDB(
						networkId, netConfig.bssid, netConfig.ssid
					);
					const { ok: patchOk, status: patchStatus, data: patchData } = await piFetch('/portal/patch', {
						method: 'POST',
						jsonBody: patchPayload,
						timeoutMs: 15_000,
					});
					if (patchOk) {
						const tipsetHash = computePortalTipsetHash(patchPayload?.patch?.portal_content?.tips?.items || []);
						const { data: latestNet } = await supabaseClient
							.from('networks')
							.select('risk_score_version')
							.eq('network_id', networkId)
							.single();

						await supabaseClient
							.from('networks')
							.update({
								portal_last_patched_at: nowIso,
								portal_last_patched_version: Number(latestNet?.risk_score_version) || 0,
								portal_tipset_hash: tipsetHash,
							})
							.eq('network_id', networkId);
						console.log('[finalizeJob] Portal patched after async enable for', networkId);
					} else {
						console.warn('[finalizeJob] Portal patch failed (non-fatal):', patchStatus, patchData);
					}
				}
			} catch (patchErr) {
				console.error('[finalizeJob] Portal patch error (non-fatal):', patchErr.message);
			}
		} else if (isSuccess && job.target_ap_status === 'disable') {
			await supabaseClient
				.from('networks')
				.update({
					ap_enabled: false,
					ap_last_applied_at: nowIso,
				})
				.eq('network_id', networkId);
		}
		// On failure: don't change ap_enabled — leave in previous state

		// Release the DB lock
		await releaseApLock(networkId);
		apJobStore.markFinalized(job.job_id);
		console.log(`[finalizeJob] Job ${job.job_id} finalized (status=${job.status}) for ${networkId}`);
	} catch (err) {
		apJobStore.releaseFinalizingLock(job.job_id);
		throw err;
	}
}

// ─── Recovery finalizer for orphaned jobs ───────────────────────
// When the in-memory job store has lost the job (server restart /
// multi-instance), we can still reconcile the DB by querying Pi for
// the authoritative live AP state. This avoids the silent data-
// correctness gap where the frontend sees DONE but the DB never
// updates ap_enabled or releases ap_apply_in_progress.
async function recoverOrphanedJob(jobId, piTerminalStatus, piResult) {
	if (!apJobStore.tryAcquireFinalizing(jobId)) {
		return; // another call already handling this
	}

	try {
		const isFailed = piTerminalStatus === 'FAILED';

		// Find the network that holds the lock — this is the network the job belongs to.
		// We cannot know network_id from the job store (it's gone), so we look for
		// a network with ap_apply_in_progress=true. If multiple networks somehow have
		// locks held (unlikely — UI drives one network at a time), we cannot safely
		// guess which one this job belongs to, so we query Pi live state to reconcile.
		const { data: lockedNets } = await supabaseClient
			.from('networks')
			.select('network_id, bssid, ssid, ap_enabled')
			.eq('ap_apply_in_progress', true);

		if (!lockedNets || lockedNets.length === 0) {
			// Lock already released by another path (TTL expiry, manual intervention)
			console.log(`[recoverOrphanedJob] No locked networks found for orphaned job ${jobId} — nothing to reconcile`);
			apJobStore.releaseFinalizingLock(jobId);
			return;
		}

		if (isFailed) {
			// On failure: release all stale locks but don't change ap_enabled
			for (const net of lockedNets) {
				await releaseApLock(net.network_id);
				console.log(`[recoverOrphanedJob] Released lock for ${net.network_id} after FAILED job ${jobId}`);
			}
			apJobStore.releaseFinalizingLock(jobId);
			return;
		}

		// DONE + success: query Pi for authoritative AP state to determine what to write
		let piApEnabled = null;
		try {
			const { ok: statusOk, data: statusData } = await piFetch('/device/status', { timeoutMs: 8_000 });
			if (statusOk && statusData) {
				piApEnabled = statusData.ap_enabled === true || statusData.ap_status === 'on';
			}
		} catch (statusErr) {
			console.warn(`[recoverOrphanedJob] Could not reach Pi /device/status for job ${jobId}:`, statusErr.message);
		}

		const nowIso = new Date().toISOString();

		for (const net of lockedNets) {
			if (piApEnabled !== null) {
				await supabaseClient
					.from('networks')
					.update({
						ap_enabled: piApEnabled,
						ap_last_applied_at: nowIso,
					})
					.eq('network_id', net.network_id);

				// Post-enable portal patch when Pi confirms AP is on
				if (piApEnabled) {
					try {
						const patchPayload = await buildPortalPayloadFromDB(
							net.network_id, net.bssid, net.ssid
						);
						const { ok: patchOk, status: patchStatus, data: patchData } = await piFetch('/portal/patch', {
							method: 'POST',
							jsonBody: patchPayload,
							timeoutMs: 15_000,
						});
						if (patchOk) {
							const tipsetHash = computePortalTipsetHash(patchPayload?.patch?.portal_content?.tips?.items || []);
							const { data: latestNet } = await supabaseClient
								.from('networks')
								.select('risk_score_version')
								.eq('network_id', net.network_id)
								.single();
							await supabaseClient
								.from('networks')
								.update({
									portal_last_patched_at: nowIso,
									portal_last_patched_version: Number(latestNet?.risk_score_version) || 0,
									portal_tipset_hash: tipsetHash,
								})
								.eq('network_id', net.network_id);
							console.log(`[recoverOrphanedJob] Portal patched for ${net.network_id}`);
						} else {
							console.warn(`[recoverOrphanedJob] Portal patch failed (non-fatal) for ${net.network_id}:`, patchStatus, patchData);
						}
					} catch (patchErr) {
						console.error(`[recoverOrphanedJob] Portal patch error (non-fatal) for ${net.network_id}:`, patchErr.message);
					}
				}
			}
			// Release lock regardless
			await releaseApLock(net.network_id);
			console.log(`[recoverOrphanedJob] Reconciled ${net.network_id} (ap_enabled=${piApEnabled}) for orphaned job ${jobId}`);
		}

		apJobStore.releaseFinalizingLock(jobId);
	} catch (err) {
		apJobStore.releaseFinalizingLock(jobId);
		throw err;
	}
}

// ─── GET /api/device/jobs/:jobId ─────────────────────────────────
// Client polls this to track async AP orchestration progress.
// Proxies to Pi /orchestrate/poll, normalizes the response, and
// triggers idempotent finalization on terminal state.
router.get('/jobs/:jobId', authJWT, requireActiveProfile, requireAAL2, deviceJobPoll, validate, async (req, res) => {
	const { jobId } = req.params;

	try {
		// Check local store first (for context like network_id, target)
		const storedJob = apJobStore.get(jobId);

		// If already finalized, return cached terminal state immediately
		if (storedJob?.finalized) {
			return res.json({
				ok: storedJob.status === 'DONE',
				job_id: jobId,
				job_status: storedJob.status,
				result: storedJob.result,
				error_code: storedJob.error_code,
				error_message: storedJob.error_message,
			});
		}

		// Poll upstream Pi
		const { ok: piOk, data: piData } = await piFetch('/orchestrate/poll', {
			query: { job_id: jobId },
			timeoutMs: 8_000,
		});

		if (!piOk || !piData) {
			return res.json({
				ok: false,
				job_id: jobId,
				job_status: 'UNKNOWN',
				result: null,
				error_code: 'PI_UNREACHABLE',
				error_message: 'Could not reach device to check job status.',
			});
		}

		const upstreamStatus = (piData.status || '').toUpperCase();
		const piResult = piData.result || null;

		// ── Terminal: DONE ────────────────────────────────────────
		if (upstreamStatus === 'DONE') {
			const resultStatus = piResult?.status || '';
			const isError = resultStatus === 'ERROR' || resultStatus.toUpperCase() === 'ERROR';

			if (isError) {
				// DONE but application-level error
				const classified = classifyOrchestrateError(piResult) || {
					error_code: 'ORCHESTRATE_ERROR',
					user_message: piResult?.user_message || 'AP operation failed.',
				};

				if (storedJob) {
					apJobStore.update(jobId, {
						status: 'FAILED',
						result: piResult,
						error_code: classified.error_code,
						error_message: classified.user_message,
					});
					await finalizeJob(apJobStore.get(jobId), piResult);
				} else {
					// Job lost from memory (restart/deploy) — recover from Pi state
					try {
						await recoverOrphanedJob(jobId, 'FAILED', piResult);
					} catch (recoverErr) {
						console.error(`[jobs/${jobId}] orphan recovery (FAILED) error:`, recoverErr.message);
					}
				}

				return res.json({
					ok: false,
					job_id: jobId,
					job_status: 'FAILED',
					result: piResult,
					error_code: classified.error_code,
					error_message: classified.user_message,
				});
			}

			// DONE + success
			if (storedJob) {
				apJobStore.update(jobId, { status: 'DONE', result: piResult });
				await finalizeJob(apJobStore.get(jobId), piResult);
			} else {
				// Job lost from memory (restart/deploy) — recover from Pi state
				try {
					await recoverOrphanedJob(jobId, 'DONE', piResult);
				} catch (recoverErr) {
					console.error(`[jobs/${jobId}] orphan recovery (DONE) error:`, recoverErr.message);
				}
			}

			return res.json({
				ok: true,
				job_id: jobId,
				job_status: 'DONE',
				result: piResult,
				error_code: null,
				error_message: null,
			});
		}

		// ── Non-terminal: ACCEPTED / ONGOING ─────────────────────
		const normalizedStatus = ['ACCEPTED', 'ONGOING'].includes(upstreamStatus)
			? upstreamStatus
			: 'ONGOING'; // treat unknown non-terminal as ONGOING

		if (storedJob) {
			apJobStore.update(jobId, { status: normalizedStatus });
		}

		return res.json({
			ok: true,
			job_id: jobId,
			job_status: normalizedStatus,
			result: null,
			error_code: null,
			error_message: null,
		});
	} catch (err) {
		console.error(`[jobs/${jobId}] poll error:`, err.message);
		return res.json({
			ok: false,
			job_id: jobId,
			job_status: 'UNKNOWN',
			result: null,
			error_code: 'POLL_ERROR',
			error_message: 'Failed to check job status.',
		});
	}
});

// ─── GET /api/device/ap-live ─────────────────────────────────────
// Returns normalized real-time AP/device state by proxying Pi /ap/poll.
// Used by the frontend to verify actual AP state after job completion.
router.get('/ap-live', authJWT, requireActiveProfile, requireAAL2, async (req, res) => {
	try {
		const { ok: piOk, data: piData } = await piFetch('/ap/poll', {
			timeoutMs: 8_000,
		});

		if (!piOk || !piData) {
			return res.json({
				ok: false,
				ap_status: 'UNKNOWN',
				is_transitioning: false,
				uplink_status: 'UNKNOWN',
				raw: piData || null,
			});
		}

		// Normalize AP status from upstream fields.
		// The Pi /ap/poll envelope is { status, ts, ap_up, ap: { ap_mode, link_up, ... } }
		// — it has no top-level ap_status/ap_enabled, so `ap_up` (coarse) and
		// `ap.ap_mode` (detailed) are the authoritative on/off signals. Legacy
		// string/boolean fields are kept as fallbacks for other response shapes.
		let apStatus = 'UNKNOWN';
		const ap = piData.ap || {};
		const rawApStatus = (piData.ap_status || '').toString().toLowerCase();
		const rawUplink = piData.uplink || {};
		const uplinkConnected = (rawUplink.status || '').toLowerCase() === 'connected';

		if (rawApStatus === 'transitioning' || rawApStatus === 'starting' || rawApStatus === 'stopping') {
			apStatus = 'TRANSITIONING';
		} else if (piData.ap_up === true) {
			apStatus = 'ENABLED';
		} else if (piData.ap_up === false) {
			apStatus = 'DISABLED';
		} else if (ap.ap_mode === true) {
			apStatus = 'ENABLED';
		} else if (ap.ap_mode === false) {
			apStatus = 'DISABLED';
		} else if (rawApStatus === 'enabled' || rawApStatus === 'on' || rawApStatus === 'true' || piData.ap_enabled === true) {
			apStatus = 'ENABLED';
		} else if (rawApStatus === 'disabled' || rawApStatus === 'off' || rawApStatus === 'false' || piData.ap_enabled === false) {
			apStatus = 'DISABLED';
		}

		const isTransitioning = apStatus === 'TRANSITIONING';
		const uplinkStatus = uplinkConnected ? 'CONNECTED'
			: (rawUplink.status || '').toLowerCase() === 'disconnected' ? 'DISCONNECTED'
			: 'UNKNOWN';

		return res.json({
			ok: true,
			ap_status: apStatus,
			is_transitioning: isTransitioning,
			uplink_status: uplinkStatus,
			raw: piData,
		});
	} catch (err) {
		console.error('[ap-live] error:', err.message);
		return res.json({
			ok: false,
			ap_status: 'UNKNOWN',
			is_transitioning: false,
			uplink_status: 'UNKNOWN',
			raw: null,
		});
	}
});

// ─── Validate patch payload shape per section ────────────────────
function validatePatchPayload(payload) {
	// Check top-level keys against allowlist
	const payloadKeys = Object.keys(payload);
	for (const key of payloadKeys) {
		if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
			return { valid: false, error: 'UNSAFE_PATCH_FIELD', message: `Payload key "${key}" is not allowed.`, field: key };
		}
	}

	// announcement shape
	if (payload.announcement) {
		const ann = payload.announcement;
		if (typeof ann !== 'object' || Array.isArray(ann)) {
			return { valid: false, error: 'INVALID_PATCH_SHAPE', message: 'announcement must be an object.' };
		}
		const allowedAnn = new Set(['content', 'is_active']);
		for (const k of Object.keys(ann)) {
			if (!allowedAnn.has(k)) return { valid: false, error: 'UNSAFE_PATCH_FIELD', message: `announcement.${k} is not allowed.`, field: `announcement.${k}` };
		}
		if (ann.content !== undefined && (typeof ann.content !== 'string' || ann.content.length > 2000)) {
			return { valid: false, error: 'INVALID_PATCH_SHAPE', message: 'announcement.content must be a string (max 2000 chars).' };
		}
		if (ann.is_active !== undefined && typeof ann.is_active !== 'boolean') {
			return { valid: false, error: 'INVALID_PATCH_SHAPE', message: 'announcement.is_active must be a boolean.' };
		}
	}

	// tips shape
	if (payload.tips) {
		const tips = payload.tips;
		if (!Array.isArray(tips)) {
			return { valid: false, error: 'INVALID_PATCH_SHAPE', message: 'tips must be an array.' };
		}
		if (tips.length > 20) {
			return { valid: false, error: 'INVALID_PATCH_SHAPE', message: 'tips array exceeds maximum of 20 items.' };
		}
		const allowedTip = new Set(['tip_text', 'sort_order', 'is_active']);
		for (let i = 0; i < tips.length; i++) {
			const tip = tips[i];
			if (typeof tip !== 'object' || Array.isArray(tip)) {
				return { valid: false, error: 'INVALID_PATCH_SHAPE', message: `tips[${i}] must be an object.` };
			}
			for (const k of Object.keys(tip)) {
				if (!allowedTip.has(k)) return { valid: false, error: 'UNSAFE_PATCH_FIELD', message: `tips[${i}].${k} is not allowed.`, field: `tips[${i}].${k}` };
			}
			if (typeof tip.tip_text !== 'string' || tip.tip_text.length === 0 || tip.tip_text.length > 300) {
				return { valid: false, error: 'INVALID_PATCH_SHAPE', message: `tips[${i}].tip_text is required (string, max 300 chars).` };
			}
			if (tip.sort_order !== undefined && (typeof tip.sort_order !== 'number' || !Number.isInteger(tip.sort_order))) {
				return { valid: false, error: 'INVALID_PATCH_SHAPE', message: `tips[${i}].sort_order must be an integer.` };
			}
			if (tip.is_active !== undefined && typeof tip.is_active !== 'boolean') {
				return { valid: false, error: 'INVALID_PATCH_SHAPE', message: `tips[${i}].is_active must be a boolean.` };
			}
			// Default sort_order
			if (tip.sort_order === undefined) tip.sort_order = i + 1;
		}
	}

	// risk shape
	if (payload.risk) {
		const r = payload.risk;
		if (typeof r !== 'object' || Array.isArray(r)) {
			return { valid: false, error: 'INVALID_PATCH_SHAPE', message: 'risk must be an object.' };
		}
		const allowedRisk = new Set(['bucket']);
		for (const k of Object.keys(r)) {
			if (!allowedRisk.has(k)) return { valid: false, error: 'UNSAFE_PATCH_FIELD', message: `risk.${k} is not allowed.`, field: `risk.${k}` };
		}
		if (!r.bucket || !VALID_RISK_BUCKETS.has(r.bucket)) {
			return { valid: false, error: 'INVALID_PATCH_SHAPE', message: `risk.bucket must be one of: ${[...VALID_RISK_BUCKETS].join(', ')}.` };
		}
	}

	// is_active shape
	if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
		return { valid: false, error: 'INVALID_PATCH_SHAPE', message: 'is_active must be a boolean.' };
	}

	return { valid: true };
}

// ─── Client-Driven Captive Portal Partial Update ─────────────────
// POST /api/device/portal/update
// Body: { network_id, update_type, reason?, payload }
router.post('/portal/update', authJWT, requireActiveProfile, requireAAL2, devicePortalUpdate, validate, async (req, res) => {
	const requestId = crypto.randomUUID();
	const { network_id, update_type, reason: rawReason, payload: patch } = req.body;
	const actorId = req.user?.id || null;
	const reason = rawReason || 'manual_update';

	// ── Input validation ────────────────────────────────────────
	if (!network_id) {
		return res.status(400).json({ error: 'INVALID_INPUT', message: 'network_id is required.' });
	}
	if (!update_type || !VALID_UPDATE_TYPES.has(update_type)) {
		return res.status(400).json({ error: 'INVALID_INPUT', message: `update_type must be one of: ${[...VALID_UPDATE_TYPES].join(', ')}.` });
	}
	if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0) {
		return res.status(400).json({ error: 'EMPTY_PATCH', message: 'payload must be a non-empty object.' });
	}

	// ── update_type consistency check ───────────────────────────
	const allowedKeysForType = KEYS_BY_UPDATE_TYPE[update_type];
	for (const key of Object.keys(patch)) {
		if (!allowedKeysForType.has(key)) {
			return res.status(400).json({
				error: 'UPDATE_TYPE_MISMATCH',
				message: `Key "${key}" is not allowed for update_type "${update_type}".`,
				allowed: [...allowedKeysForType],
			});
		}
	}

	// ── Shape + allowlist validation ─────────────────────────────
	const shapeCheck = validatePatchPayload(patch);
	if (!shapeCheck.valid) {
		return res.status(400).json({
			error: shapeCheck.error,
			message: shapeCheck.message,
			...(shapeCheck.field ? { field: shapeCheck.field } : {}),
		});
	}

	try {
		// ── Load network row ───────────────────────────────────────
		const { data: net, error: netErr } = await supabaseClient
			.from('networks')
			.select('ap_enabled, risk_score_version, portal_last_patched_version')
			.eq('network_id', network_id)
			.maybeSingle();

		if (netErr) throw netErr;
		if (!net) {
			return res.status(404).json({ error: 'NETWORK_NOT_FOUND', message: 'Network not found.' });
		}
		if (!net.ap_enabled) {
			return res.status(409).json({ error: 'AP_NOT_ENABLED', message: 'AP must be enabled before updating the portal.' });
		}

		// ── Risk patch debounce ────────────────────────────────────
		if (update_type === 'risk' && Number(net.portal_last_patched_version) >= Number(net.risk_score_version)) {
			await logAuditEvent({
				req, actorId, eventName: 'PORTAL_UPDATE', eventStatus: 'SKIPPED',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: { request_id: requestId, update_type, reason: 'already_up_to_date' },
			});
			return res.json({ ok: true, skipped: true, reason: 'already_up_to_date' });
		}

		// ── Build FastAPI payload (only validated fields) ───────────
		const fastapiPayload = { network_id, ...patch };
		const patchedKeys = Object.keys(patch);

		const portalUrl = '/portal/patch';
		logFastApiCall(`portal/patch (${update_type})`, portalUrl, fastapiPayload, null);

		const { ok: patchOk, status: patchStatus, data: fastapiData } = await piFetch('/portal/patch', {
			method: 'POST',
			jsonBody: fastapiPayload,
		});

		logFastApiCall(`portal/patch RESPONSE (${update_type})`, portalUrl, fastapiPayload, {
			status: patchStatus,
			body: fastapiData,
		});

		if (!patchOk) {
			await logAuditEvent({
				req, actorId, eventName: 'PORTAL_UPDATE', eventStatus: 'FAILED',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: { request_id: requestId, update_type, reason, patched_keys: patchedKeys, fastapi_status: patchStatus, fastapi_body: fastapiData },
			});
			throw httpError(502, 'FASTAPI_PORTAL_PATCH_FAILED', fastapiData?.detail || 'FastAPI portal/patch failed', {
				fastapi_status: patchStatus,
				fastapi_body: fastapiData,
			});
		}

		// ── DB stamping ────────────────────────────────────────────
		const stampUpdate = { portal_last_patched_at: new Date().toISOString() };
		let stampedVersion = null;
		let stampedTipsetHash = null;

		if (patch.tips) {
			stampedTipsetHash = computePortalTipsetHash(patch.tips);
			stampUpdate.portal_tipset_hash = stampedTipsetHash;
		}

		if (patch.risk) {
			// Re-read current risk_score_version to avoid stale stamp
			const { data: latestNet } = await supabaseClient
				.from('networks')
				.select('risk_score_version')
				.eq('network_id', network_id)
				.single();
			stampedVersion = Number(latestNet?.risk_score_version ?? net.risk_score_version);
			stampUpdate.portal_last_patched_version = stampedVersion;
		}

		await supabaseClient
			.from('networks')
			.update(stampUpdate)
			.eq('network_id', network_id);

		// ── Audit: success ────────────────────────────────────────
		await logAuditEvent({
			req, actorId, eventName: 'PORTAL_UPDATE', eventStatus: 'SUCCESS',
			entityType: 'NETWORK', entityIdUuid: network_id,
			meta: { request_id: requestId, update_type, reason, patched_keys: patchedKeys, fastapi_status: patchStatus, stamped_version: stampedVersion },
		});

		return res.json({
			ok: true,
			network_id,
			patched: true,
			stamped: {
				portal_last_patched_at: stampUpdate.portal_last_patched_at,
				portal_last_patched_version: stampedVersion,
				portal_tipset_hash: stampedTipsetHash,
			},
			fastapi: fastapiData,
		});
	} catch (err) {
		console.error('deviceMgmt /portal/update error:', err);
		const status = err.status || 500;
		return res.status(status).json({
			error: err.code || 'PORTAL_UPDATE_FAILED',
			message: 'Portal update failed',
			...(err.extra || {}),
		});
	}
});

// ─── Scan Completed Webhook ──────────────────────────────────────
// POST /api/device/scan-completed
// Body: { scan_id }
// Called by scan runner or external system when a vulnerability_scans
// row transitions to COMPLETED. Triggers risk pipeline + auto-portal.
router.post('/scan-completed', async (req, res) => {
	// ── Phase 2-C: Fail closed — reject if SCAN_RUNNER_TOKEN is not configured ──
	// This is a machine-to-machine webhook (Pi → Express), NOT browser-called,
	// so it uses a shared secret instead of JWT.
	if (!SCAN_RUNNER_TOKEN) {
		console.error('[scan-completed] SCAN_RUNNER_TOKEN not configured — rejecting request');
		return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Webhook not configured.' });
	}
	const token = req.headers['x-scan-runner-token'];
	if (token !== SCAN_RUNNER_TOKEN) {
		return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing X-Scan-Runner-Token.' });
	}

	const { scan_id } = req.body;

	if (!scan_id) {
		return res.status(400).json({ error: 'INVALID_INPUT', message: 'scan_id is required.' });
	}
	if (!UUID_RE.test(scan_id)) {
		return res.status(400).json({ error: 'INVALID_INPUT', message: 'scan_id must be a valid UUID.' });
	}

	try {
		// Idempotency: check if already processed (last_scan_id == scan_id)
		const { data: scan } = await supabaseClient
			.from('vulnerability_scans')
			.select('network_id')
			.eq('scan_id', scan_id)
			.maybeSingle();

		if (scan?.network_id) {
			const { data: net } = await supabaseClient
				.from('networks')
				.select('last_scan_id')
				.eq('network_id', scan.network_id)
				.maybeSingle();

			if (net?.last_scan_id === scan_id) {
				return res.json({ ok: true, scan_id, skipped: true, reason: 'already_processed' });
			}
		}

		const result = await onScanCompleted(scan_id, req);
		return res.json({
			ok: true,
			scan_id,
			risk_changed: result.changed,
			portal_patched: result.portalPatched,
			old_bucket: result.oldBucket,
			new_bucket: result.newBucket,
		});
	} catch (err) {
		console.error('deviceMgmt /scan-completed error:', err);
		return res.status(500).json({ error: 'SCAN_COMPLETED_HOOK_FAILED', message: 'Internal error processing scan completion' });
	}
});

module.exports = router;