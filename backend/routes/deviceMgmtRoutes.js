// routes/deviceMgmtRoutes.js
const express = require('express');
const router = express.Router();
const { supabaseClient } = require('../config/supabaseClient');

const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://mothership-1.tail781e52.ts.net:8000";

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

// ─── AP Toggle → proxies to orchestrate/apply ───────────────────
// POST /api/device/enable-ap
// Body: { network_id, ssid, bssid, channel, encryption_type, ap_password?, ap_status }
//   ap_status: "enable" | "disable"
router.post('/enable-ap', async (req, res) => {
	try {
		const { network_id, ssid, bssid, channel, encryption_type, ap_password, ap_status } = req.body;

		if (!network_id || !ssid || !bssid || channel === undefined || !encryption_type || !ap_status) {
			return res.status(400).json({
				error: 'Missing required fields (network_id, ssid, bssid, channel, encryption_type, ap_status)',
			});
		}

		// 1. Upsert network row in Supabase
		const { data: network, error: upsertError } = await supabaseClient
			.from('networks')
			.upsert(
				{ network_id, ssid, bssid, channel, encryption_status: encryption_type },
				{ onConflict: 'network_id' }
			)
			.select('network_id')
			.single();

		if (upsertError) throw upsertError;

		// 2. Forward to FastAPI orchestrate/apply
		const orchestratePayload = {
			ssid,
			bssid,
			channel,
			encryption_type,
			...(ap_password && { ap_password }),
			ap_status,   // "enable" or "disable"
		};

		console.log('Forwarding to orchestrate/apply:', orchestratePayload);

		const fastapiRes = await fetch(`${FASTAPI_BASE}/orchestrate/apply`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(orchestratePayload),
		});

		const fastapiData = await fastapiRes.json().catch(() => null);

		if (!fastapiRes.ok) {
			throw new Error(fastapiData?.detail || `orchestrate/apply error: ${fastapiRes.status}`);
		}

		return res.json({ status: 'success', network_id, ap_status, fastapi: fastapiData });
	} catch (err) {
		console.error('deviceMgmt /enable-ap error:', err);
		return res.status(500).json({ error: 'AP toggle failed', detail: err.message });
	}
});

// ─── Portal Patch (first initialization / hardcoded content) ────
// POST /api/device/portal-patch
// Body: { network_id, bssid, ssid, announcement_text?, terms_text?, terms_version? }
router.post('/portal-patch', async (req, res) => {
	try {
		const { network_id, bssid, ssid, announcement_text, terms_text, terms_version } = req.body;

		if (!bssid || !ssid) {
			return res.status(400).json({ error: 'bssid and ssid are required' });
		}

		// FastAPI expects network_id as "BSSID | SSID"
		const portalNetworkId = `${bssid} | ${ssid}`;
		const now = Math.floor(Date.now() / 1000);

		const patchPayload = {
			network_id: portalNetworkId,
			patch: {
				portal_content: {
					announcements: {
						updated_at: now,
						announcement_text: announcement_text || "Welcome to this secured network. Stay safe online.",
					},
					terms: {
						version: terms_version || new Date().toISOString().slice(0, 10),
						updated_at: now,
						text: terms_text || "By connecting to this network, you agree to our terms of service and acceptable use policy.",
					},
					tips: {
						updated_at: now,
						items: [
							"Use a VPN when possible.",
							"Avoid banking on public Wi-Fi.",
							"Keep your device software up to date.",
						],
					},
				},
				security: {
					score: 0,
					risk_level: "NOT YET ASSESSED",
					updated_at: now,
				},
			},
		};

		console.log('Forwarding to portal/patch:', JSON.stringify(patchPayload, null, 2));

		const fastapiRes = await fetch(`${FASTAPI_BASE}/portal/patch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patchPayload),
		});

		const fastapiData = await fastapiRes.json().catch(() => null);

		if (!fastapiRes.ok) {
			throw new Error(fastapiData?.detail || `portal/patch error: ${fastapiRes.status}`);
		}

		return res.json({ status: 'success', network_id: portalNetworkId, fastapi: fastapiData });
	} catch (err) {
		console.error('deviceMgmt /portal-patch error:', err);
		return res.status(500).json({ error: 'Portal patch failed', detail: err.message });
	}
});

module.exports = router;