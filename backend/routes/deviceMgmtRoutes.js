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

const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://mothership-1.tail781e52.ts.net:8000";
const SCAN_MAX_AGE_SECONDS = parseInt(process.env.SCAN_MAX_AGE_SECONDS || '300', 10); // default 5 min

// ─── Helper: release the AP apply lock ───────────────────────────
async function releaseApLock(networkId) {
	try {
		await supabaseClient
			.from('networks')
			.update({ ap_apply_in_progress: false })
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

// ─── Legacy toggle signal (keep for backward compat) ────────────
router.post('/signal_ap', async (req, res) => {
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
router.get('/ap-state/:networkId', async (req, res) => {
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
		return res.status(500).json({ error: 'Failed to fetch AP state', detail: err.message });
	}
});

// ─── AP Toggle → orchestrate/apply ───────────────────────────────
// POST /api/device/enable-ap
// Body: { network_id, scan_id?, ap_status, ap_password? }
//   scan_id required only for enable (not disable)
//   Backend loads SSID/BSSID/channel/encryption from DB — never trust frontend
router.post('/enable-ap', async (req, res) => {
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
		// ── Step 0: Atomic concurrency lock ──────────────────────
		// Single UPDATE that checks + sets in one query to avoid races
		const { data: lockRow, error: lockErr } = await supabaseClient
			.from('networks')
			.update({ ap_apply_in_progress: true })
			.eq('network_id', network_id)
			.eq('ap_apply_in_progress', false)
			.select('network_id')
			.maybeSingle();

		if (lockErr) throw lockErr;

		if (!lockRow) {
			// Either network doesn't exist or lock is already held
			const { data: exists } = await supabaseClient
				.from('networks')
				.select('network_id, ap_apply_in_progress')
				.eq('network_id', network_id)
				.maybeSingle();

			if (!exists) {
				return res.status(404).json({ error: 'NETWORK_NOT_FOUND', message: 'Network not found.' });
			}
			return res.status(409).json({ error: 'REQUEST_IN_PROGRESS', message: 'An AP configuration change is already in progress.' });
		}

		lockAcquired = true;

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

			const orchestrateUrl = `${FASTAPI_BASE}/orchestrate/apply`;
			logFastApiCall('orchestrate/apply (DISABLE)', orchestrateUrl, orchestratePayload, null);

			const fastapiRes = await fetch(orchestrateUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(orchestratePayload),
			});
			const fastapiData = await fastapiRes.json().catch(() => null);

			logFastApiCall('orchestrate/apply RESPONSE (DISABLE)', orchestrateUrl, orchestratePayload, {
				status: fastapiRes.status,
				body: fastapiData,
			});

			if (!fastapiRes.ok) {
				// Audit: disable failed
				await logAuditEvent({
					req, actorId, eventName: 'AP_DISABLE_REQUEST', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, fastapi_status: fastapiRes.status, fastapi_body: fastapiData },
				});
				throw httpError(502, 'FASTAPI_APPLY_FAILED', fastapiData?.detail || 'FastAPI orchestrate/apply failed (disable)', {
					fastapi_status: fastapiRes.status,
					fastapi_body: fastapiData,
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
				meta: { request_id: requestId, fastapi_status: fastapiRes.status },
			});

			return res.json({
				ok: true,
				network_id,
				ap_enabled: false,
				ap_status: 'disable',
				fastapi: fastapiData,
			});
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

			// Seed default content into DB tables (announcements, terms, tips)
			await seedDefaultContent(network_id);

			// Build payload from DB
			const patchPayload = await buildPortalPayloadFromDB(
				network_id, net.bssid, net.ssid
			);

			const portalUrl = `${FASTAPI_BASE}/portal/patch`;
			logFastApiCall('portal/patch (INIT)', portalUrl, patchPayload, null);

			const portalRes = await fetch(portalUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patchPayload),
			});
			const portalData = await portalRes.json().catch(() => null);

			logFastApiCall('portal/patch RESPONSE (INIT)', portalUrl, patchPayload, {
				status: portalRes.status,
				body: portalData,
			});

			if (!portalRes.ok) {
				// Audit: portal init failed — abort enable
				await logAuditEvent({
					req, actorId, eventName: 'PORTAL_PATCH', eventStatus: 'FAILED',
					entityType: 'NETWORK', entityIdUuid: network_id,
					meta: { request_id: requestId, reason: 'portal_init', fastapi_status: portalRes.status, fastapi_body: portalData },
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
					detail: portalData?.detail || `portal/patch error: ${portalRes.status}`,
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
				meta: { request_id: requestId, reason: 'portal_init', fastapi_status: portalRes.status },
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

		const orchestrateUrl = `${FASTAPI_BASE}/orchestrate/apply`;
		logFastApiCall('orchestrate/apply (ENABLE)', orchestrateUrl, orchestratePayload, null);

		const fastapiRes = await fetch(orchestrateUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(orchestratePayload),
		});
		const fastapiData = await fastapiRes.json().catch(() => null);

		logFastApiCall('orchestrate/apply RESPONSE (ENABLE)', orchestrateUrl, orchestratePayload, {
			status: fastapiRes.status,
			body: fastapiData,
		});

		if (!fastapiRes.ok) {
			// Audit: enable failed
			await logAuditEvent({
				req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'FAILED',
				entityType: 'NETWORK', entityIdUuid: network_id,
				meta: { request_id: requestId, scan_id, fastapi_status: fastapiRes.status, fastapi_body: fastapiData },
			});
			throw httpError(502, 'FASTAPI_APPLY_FAILED', fastapiData?.detail || 'FastAPI orchestrate/apply failed (enable)', {
				fastapi_status: fastapiRes.status,
				fastapi_body: fastapiData,
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

		// Audit: enable success
		await logAuditEvent({
			req, actorId, eventName: 'AP_ENABLE_REQUEST', eventStatus: 'SUCCESS',
			entityType: 'NETWORK', entityIdUuid: network_id,
			meta: { request_id: requestId, scan_id: scan.scan_id, fastapi_status: fastapiRes.status },
		});

		return res.json({
			ok: true,
			network_id,
			ap_enabled: true,
			portal_initialized: true,
			scan: {
				scan_id: scan.scan_id,
				finished_at: scan.finished_at,
			},
			fastapi: fastapiData,
		});
	} catch (err) {
		console.error('deviceMgmt /enable-ap error:', err);
		const status = err.status || 500;
		return res.status(status).json({
			error: err.code || 'AP_TOGGLE_FAILED',
			message: err.message,
			...(err.extra || {}),
		});
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
router.get('/network/:networkId/state', async (req, res) => {
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
		return res.status(500).json({ ok: false, error: 'STATE_FETCH_FAILED', message: err.message });
	}
});

module.exports = router;