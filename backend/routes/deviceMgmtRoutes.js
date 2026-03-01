// routes/deviceMgmtRoutes.js
const express = require('express');
const router = express.Router();
const { supabaseClient } = require('../config/supabaseClient');
const {
	validateScan,
	validateNetworkConfig,
	validateApPassword,
	buildPortalPatchPayload,
} = require('../utils/scanValidation');
const { seedDefaultContent, buildPortalPayloadFromDB } = require('../controllers/captivePortalController');

const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://mothership-1.tail781e52.ts.net:8000";
const SCAN_MAX_AGE_SECONDS = parseInt(process.env.SCAN_MAX_AGE_SECONDS || '300', 10); // default 5 min

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
	try {
		const { network_id, scan_id, ap_status, ap_password } = req.body;

		if (!network_id || !ap_status || !['enable', 'disable'].includes(ap_status)) {
			return res.status(400).json({
				error: 'Missing or invalid fields (network_id, ap_status: "enable"|"disable")',
			});
		}

		// ── DISABLE path (no scan_id needed) ─────────────────────
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

			console.log('\n═══ FastAPI orchestrate/apply (DISABLE) ═══');
			console.log('URL:', `${FASTAPI_BASE}/orchestrate/apply`);
			console.log('Payload:', JSON.stringify(orchestratePayload, null, 2));
			console.log('═'.repeat(40));
			const fastapiRes = await fetch(`${FASTAPI_BASE}/orchestrate/apply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(orchestratePayload),
			});
			const fastapiData = await fastapiRes.json().catch(() => null);
			if (!fastapiRes.ok) {
				throw new Error(fastapiData?.detail || `orchestrate/apply error: ${fastapiRes.status}`);
			}

			// Persist ap_enabled = false
			await supabaseClient
				.from('networks')
				.update({ ap_enabled: false })
				.eq('network_id', network_id);

			console.log('AP disabled successfully for network:', network_id);

			return res.json({
				ok: true,
				network_id,
				ap_enabled: false,
				ap_status: 'disable',
				fastapi: fastapiData,
			});
		}

		// ── ENABLE path (scan_id required + validated) ───────────
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

		// Step 3: Validate scan (exists + network match + finished + fresh)
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
			.select('ssid, bssid, channel, encryption_status, portal_initialized')
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

			// Build payload from DB (risk_score fetched internally from scans table)
			const patchPayload = await buildPortalPayloadFromDB(
				network_id, net.bssid, net.ssid
			);

			console.log('\n═══ FastAPI portal/patch (INIT) ═══');
			console.log('URL:', `${FASTAPI_BASE}/portal/patch`);
			console.log('Payload:', JSON.stringify(patchPayload, null, 2));
			console.log('═'.repeat(40));

			const portalRes = await fetch(`${FASTAPI_BASE}/portal/patch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patchPayload),
			});
			const portalData = await portalRes.json().catch(() => null);
			if (!portalRes.ok) {
				throw new Error(portalData?.detail || `portal/patch error: ${portalRes.status}`);
			}

			// Mark initialized in DB
			const { error: updErr } = await supabaseClient
				.from('networks')
				.update({ portal_initialized: true })
				.eq('network_id', network_id);
			if (updErr) throw updErr;

			console.log('Portal initialized successfully for', patchPayload.network_id);
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

		console.log('\n═══ FastAPI orchestrate/apply (ENABLE) ═══');
		console.log('URL:', `${FASTAPI_BASE}/orchestrate/apply`);
		console.log('Payload:', JSON.stringify(orchestratePayload, null, 2));
		console.log('═'.repeat(40));
		const fastapiRes = await fetch(`${FASTAPI_BASE}/orchestrate/apply`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(orchestratePayload),
		});
		const fastapiData = await fastapiRes.json().catch(() => null);
		if (!fastapiRes.ok) {
			throw new Error(fastapiData?.detail || `orchestrate/apply error: ${fastapiRes.status}`);
		}

		// Step 9: Persist ap_enabled = true
		await supabaseClient
			.from('networks')
			.update({ ap_enabled: true })
			.eq('network_id', network_id);

		console.log('AP enabled successfully for network:', network_id);

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
	}
});

module.exports = router;