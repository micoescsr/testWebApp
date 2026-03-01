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
				throw new Error(fastapiData?.detail || `orchestrate/apply error: ${fastapiRes.status}`);
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
				return res.status(502).json({
					error: 'PORTAL_PATCH_FAILED',
					message: 'Failed to initialize captive portal. AP enable aborted.',
					detail: portalData?.detail || `portal/patch error: ${portalRes.status}`,
				});
			}

			// Mark initialized + stamp portal version
			const { error: updErr } = await supabaseClient
				.from('networks')
				.update({
					portal_initialized: true,
					portal_last_patched_version: net.risk_score_version,
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
			throw new Error(fastapiData?.detail || `orchestrate/apply error: ${fastapiRes.status}`);
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
		return res.status(500).json({ error: 'AP toggle failed', detail: err.message });
	} finally {
		// ── ALWAYS release the lock ──────────────────────────────
		if (lockAcquired) {
			await releaseApLock(network_id);
		}
	}
});

module.exports = router;