// routes/deviceMgmtRoutes.js
const express = require('express');
const router = express.Router();
const { supabaseClient } = require('../config/supabaseClient');

const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://mothership.tail781e52.ts.net:8000";

// Lightweight route to handle AP toggle from web UI.
// This was previously in routes/scanRoutes.js as a test endpoint.
// Keep behaviour identical for now (confirm receipt) so frontend
// and device code can be migrated incrementally.
router.post('/signal_ap', async (req, res) => {
	try {
		const { toggleState } = req.body;
		console.log('DeviceMgmt: Received toggleState:', toggleState);

		// For now, simply acknowledge the toggle. In future this can
		// proxy to FastAPI or call rasPiService to perform real actions.
		return res.json({
			success: true,
			status: toggleState ? 'Active' : 'Disabled',
		});
	} catch (err) {
		console.error('DeviceMgmt /signal_ap error:', err);
		return res.status(500).json({ error: 'Toggle failed' });
	}
});

module.exports = router;

// Add enable-ap handler here so device management routes own AP control
router.post('/enable-ap', async (req, res) => {
	try {
		const { network_id, ssid, bssid, channel, encryption_type, ap_password } = req.body;

		if (!network_id || !ssid || !bssid || channel === undefined || !encryption_type) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		// Upsert network row
		const { data: network, error: upsertError } = await supabaseClient
			.from('networks')
			.upsert({ network_id, ssid, bssid, channel, encryption_status: encryption_type }, { onConflict: 'network_id' })
			.select('network_id')
			.single();

		if (upsertError) throw upsertError;

		// Forward to FastAPI
		const fastapiRes = await fetch(`${FASTAPI_BASE}/api/enable-captive-portal`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req.body),
		});

		const fastapiData = await fastapiRes.json().catch(() => null);

		if (!fastapiRes.ok) {
			throw new Error(fastapiData?.detail || 'FastAPI error');
		}

		return res.json({ status: 'success', network_id, fastapi: fastapiData });
	} catch (err) {
		console.error('deviceMgmt /enable-ap error:', err);
		return res.status(500).json({ error: 'AP enable failed', detail: err.message });
	}
});