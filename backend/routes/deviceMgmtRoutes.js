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
const { logAuditEvent } = require('../utils/auditLogger');
const { onScanCompleted } = require('../utils/riskPipeline');
const { validateUUID } = require('../middleware/validateUUID');
const { piFetch } = require('../utils/piFetch');
const { validate, deviceEnableAp, devicePortalUpdate } = require('../validators/routeValidators');

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

// ─── Legacy toggle signal (keep for backward compat) ────────────
router.post('/signal_ap', authJWT, async (req, res) => {
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
router.get('/ap-state/:networkId', authJWT, validateUUID('networkId'), async (req, res) => {
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
router.post('/enable-ap', authJWT, deviceEnableAp, validate, async (req, res) => {
	const requestId = crypto.randomUUID();
	const { network_id, scan_id, ap_status, ap_password } = req.body;
	const actorId = req.user?.id || null;
	let lockAcquired = false;

	// ── Basic input validation ───────────────────────────────────
	if (!network_id || !ap_status || !['enable', 'disable'].includes(ap_status)) {
		return res.status(400).json({
			error: 'Missing or invalid fields (network_id, ap_status: "enable"|"disable")',
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
			};

			const orchestrateUrl = '/orchestrate/apply';
			logFastApiCall('orchestrate/apply (DISABLE)', orchestrateUrl, orchestratePayload, null);

			const { ok: piOk, status: piStatus, data: fastapiData } = await piFetch('/orchestrate/apply', {
				method: 'POST',
				jsonBody: orchestratePayload,
				timeoutMs: 60_000,
			});

			logFastApiCall('orchestrate/apply RESPONSE (DISABLE)', orchestrateUrl, orchestratePayload, {
				status: piStatus,
				body: fastapiData,
			});

			if (!piOk) {
				// Audit: disable failed
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

			// Check for application-level ERROR (FastAPI returns 200 but status: "ERROR")
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

			// Persist ap_enabled = false + update ap_last_applied_at
			await supabaseClient
				.from('networks')
				.update({ ap_enabled: false, ap_last_applied_at: new Date().toISOString() })
				.eq('network_id', network_id);

			console.log('AP disabled successfully for network:', network_id);

			// Audit: disable success
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

			const portalUrl = '/portal/patch';
			logFastApiCall('portal/patch (INIT)', portalUrl, patchPayload, null);

			const { ok: portalOk, status: portalStatus, data: portalData } = await piFetch('/portal/patch', {
				method: 'POST',
				jsonBody: patchPayload,
			});

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
		};

		const orchestrateUrl = '/orchestrate/apply';
		logFastApiCall('orchestrate/apply (ENABLE)', orchestrateUrl, orchestratePayload, null);

		const { ok: enableOk, status: enableStatus, data: fastapiData } = await piFetch('/orchestrate/apply', {
			method: 'POST',
			jsonBody: orchestratePayload,
			timeoutMs: 60_000,
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

		// Step 10: Always push current portal content after AP enable
		// The Pi needs fresh content every time AP comes up (announcements, tips, risk, color).
		// Step 7 only seeds+patches on first init; subsequent enables need this.
		let portalPatched = false;
		try {
			const patchPayload = await buildPortalPayloadFromDB(
				network_id, net.bssid, net.ssid
			);

			logFastApiCall('portal/patch (POST-ENABLE)', '/portal/patch', patchPayload, null);

			const { ok: patchOk, status: patchStatus, data: patchData } = await piFetch('/portal/patch', {
				method: 'POST',
				jsonBody: patchPayload,
			});

			logFastApiCall('portal/patch RESPONSE (POST-ENABLE)', '/portal/patch', patchPayload, {
				status: patchStatus,
				body: patchData,
			});

			if (patchOk) {
				portalPatched = true;
				await supabaseClient
					.from('networks')
					.update({ portal_last_patched_at: new Date().toISOString() })
					.eq('network_id', network_id);
				console.log('Portal content pushed after AP enable for network:', network_id);
			} else {
				console.warn('[enable-ap] portal/patch after enable failed (non-fatal):', patchStatus, patchData);
			}
		} catch (patchErr) {
			console.error('[enable-ap] portal/patch after enable error (non-fatal):', patchErr.message);
		}

		// Audit: enable success
		await logAuditEvent({
			req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'SUCCESS',
			entityType: 'NETWORK', entityIdUuid: network_id,
			meta: { request_id: requestId, scan_id: scan.scan_id, fastapi_status: enableStatus, portal_patched: portalPatched },
		});

		const responseBody = {
			ok: true,
			network_id,
			ap_enabled: true,
			portal_initialized: true,
			portal_patched: portalPatched,
			scan: {
				scan_id: scan.scan_id,
				finished_at: scan.finished_at,
			},
			fastapi: fastapiData,
		};
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
		// ── ALWAYS release the lock ──────────────────────────────
		if (lockAcquired) {
			await releaseApLock(network_id);
		}
	}
});

// ─── Admin State Endpoint (cheap, read-only) ─────────────────────
// GET /api/device/network/:networkId/state
// Returns authoritative AP + scan + portal + risk state for the UI
router.get('/network/:networkId/state', authJWT, validateUUID('networkId'), async (req, res) => {
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
		const portalOutOfDate = !!net.ap_enabled && (Number(net.portal_last_patched_version) < Number(net.risk_score_version));

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
router.post('/portal/update', authJWT, devicePortalUpdate, validate, async (req, res) => {
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