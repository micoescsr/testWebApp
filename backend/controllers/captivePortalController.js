// controllers/captivePortalController.js
// CRUD for captive portal content + portal sync to FastAPI

const { supabaseClient } = require('../config/supabaseClient');

const FASTAPI_BASE = process.env.FASTAPI_BASE || 'http://mothership-1.tail781e52.ts.net:8000';

// ═══════════════════════════════════════════════════════════════════
//  Shared helpers (exported for use in deviceMgmtRoutes)
// ═══════════════════════════════════════════════════════════════════

/**
 * Seed default captive portal content for a network if none exists.
 * Creates: announcement, terms, captive_portal row, tips.
 * Idempotent — returns existing captive_portal_id if row already exists.
 */
async function seedDefaultContent(networkId) {
	// Check if active portal row already exists
	const { data: existing } = await supabaseClient
		.from('captive_portal')
		.select('captive_portal_id')
		.eq('network_id', networkId)
		.eq('is_active', true)
		.maybeSingle();

	if (existing) return existing.captive_portal_id;

	// 1. Insert default announcement
	const { data: ann, error: annErr } = await supabaseClient
		.from('captive_portal_announcements')
		.insert({
			announcement_content: 'Welcome to this secured network. Stay safe online.',
			is_active: true,
			network_id: networkId,
		})
		.select('announcement_id')
		.single();
	if (annErr) throw annErr;

	// 2. Insert default terms
	const { data: tc, error: tcErr } = await supabaseClient
		.from('terms_conditions')
		.insert({
			content: 'By connecting to this network, you agree to our terms of service and acceptable use policy.',
			version: new Date().toISOString().slice(0, 10),
			is_active: true,
			network_id: networkId,
		})
		.select('tc_id')
		.single();
	if (tcErr) throw tcErr;

	// 3. Insert captive_portal row (joins announcement + terms to network)
	const { data: portal, error: portalErr } = await supabaseClient
		.from('captive_portal')
		.insert({
			announcement_id: ann.announcement_id,
			tc_id: tc.tc_id,
			is_active: true,
			network_id: networkId,
		})
		.select('captive_portal_id')
		.single();
	if (portalErr) throw portalErr;

	// 4. Insert default tips
	const defaultTips = [
		{ tip_text: 'Use a VPN when possible.', sort_order: 1 },
		{ tip_text: 'Avoid banking on public Wi-Fi.', sort_order: 2 },
		{ tip_text: 'Keep your device software up to date.', sort_order: 3 },
	];

	const { error: tipsErr } = await supabaseClient
		.from('captive_portal_tips')
		.insert(
			defaultTips.map((t) => ({
				...t,
				captive_portal_id: portal.captive_portal_id,
				is_active: true,
			}))
		);
	if (tipsErr) throw tipsErr;

	return portal.captive_portal_id;
}

/**
 * Look up the risk classification for a given security score (0–100).
 * Uses the `risk_classification` table where `risk_percentage` is the upper bound.
 * Returns the lowest tier whose `risk_percentage` ≥ the given score.
 *
 * @param {number} score – network security score between 0 and 100
 * @returns {{ risk_level, ui_color, description, risk_percentage }}
 */
async function lookupRiskClassification(score) {
	try {
		const { data, error } = await supabaseClient
			.from('risk_classification')
			.select('risk_level, ui_color, description, risk_percentage')
			.gte('risk_percentage', score)
			.order('risk_percentage', { ascending: true })
			.limit(1)
			.maybeSingle();

		if (error) throw error;

		if (data) return data;
	} catch (err) {
		console.warn('[lookupRiskClassification] Falling back to default — table may not exist:', err.message);
	}

	// Fallback when table is missing or no matching row
	const s = Number(score) || 0;
	if (s <= 39) return { risk_level: 'LOW', ui_color: '#22c55e', description: 'Low risk', risk_percentage: 39 };
	if (s <= 69) return { risk_level: 'MEDIUM', ui_color: '#f59e0b', description: 'Medium risk', risk_percentage: 69 };
	if (s <= 89) return { risk_level: 'HIGH', ui_color: '#ef4444', description: 'High risk', risk_percentage: 89 };
	return { risk_level: 'CRITICAL', ui_color: '#dc2626', description: 'Critical risk', risk_percentage: 100 };
}

/**
 * Build the full portal/patch JSON payload from DB content.
 *
 * Reads announcements, terms, tips from their respective tables,
 * fetches the latest risk_score from the scans table for the network,
 * then looks up the corresponding risk_classification.
 *
 * @param {string} networkId  – UUID
 * @param {string} bssid
 * @param {string} ssid
 * @returns {object} payload ready for POST to FastAPI /portal/patch
 */
async function buildPortalPayloadFromDB(networkId, bssid, ssid) {
	const now = Math.floor(Date.now() / 1000);

	// 1. Fetch the latest risk_score from the scans table
	const { data: latestScan, error: scanErr } = await supabaseClient
		.from('scans')
		.select('risk_score')
		.eq('network_id', networkId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (scanErr) throw scanErr;

	const score = latestScan?.risk_score ?? 0;

	// 2. Load active portal row (for FK references)
	const { data: portal } = await supabaseClient
		.from('captive_portal')
		.select('captive_portal_id, announcement_id, tc_id')
		.eq('network_id', networkId)
		.eq('is_active', true)
		.maybeSingle();

	// 3. Announcement text
	let announcementText = 'Welcome to this secured network. Stay safe online.';
	if (portal?.announcement_id) {
		const { data: ann } = await supabaseClient
			.from('captive_portal_announcements')
			.select('announcement_content')
			.eq('announcement_id', portal.announcement_id)
			.single();
		if (ann) announcementText = ann.announcement_content;
	}

	// 4. Terms text + version
	let termsText =
		'By connecting to this network, you agree to our terms of service and acceptable use policy.';
	let termsVersion = new Date().toISOString().slice(0, 10);
	if (portal?.tc_id) {
		const { data: tc } = await supabaseClient
			.from('terms_conditions')
			.select('content, version')
			.eq('tc_id', portal.tc_id)
			.single();
		if (tc) {
			termsText = tc.content;
			termsVersion = tc.version;
		}
	}

	// 5. Tips
	let tipItems = [
		'Use a VPN when possible.',
		'Avoid banking on public Wi-Fi.',
		'Keep your device software up to date.',
	];
	if (portal?.captive_portal_id) {
		const { data: tips } = await supabaseClient
			.from('captive_portal_tips')
			.select('tip_text')
			.eq('captive_portal_id', portal.captive_portal_id)
			.eq('is_active', true)
			.order('sort_order', { ascending: true });
		if (tips && tips.length > 0) {
			tipItems = tips.map((t) => t.tip_text);
		}
	}

	// 6. Risk classification lookup
	const risk = await lookupRiskClassification(score);

	// 7. Build the payload matching FastAPI /portal/patch schema
	return {
		network_id: `${bssid} | ${ssid}`,
		patch: {
			portal_content: {
				announcements: {
					updated_at: now,
					announcement_text: announcementText,
				},
				terms: {
					version: termsVersion,
					updated_at: now,
					text: termsText,
				},
				tips: {
					updated_at: now,
					items: tipItems,
				},
			},
			security: {
				score,
				risk_level: risk.risk_level,
				ui_color: risk.ui_color,
				description: risk.description,
				updated_at: now,
			},
		},
	};
}

// ═══════════════════════════════════════════════════════════════════
//  Route handlers
// ═══════════════════════════════════════════════════════════════════

// ─── Announcement CRUD ───────────────────────────────────────────

async function getAnnouncement(req, res) {
	try {
		const { network_id } = req.query;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id query param required' });
		}

		const { data, error } = await supabaseClient
			.from('captive_portal_announcements')
			.select('*')
			.eq('network_id', network_id)
			.eq('is_active', true)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error) throw error;

		res.json(
			data || { announcement_id: null, announcement_content: '', created_at: null }
		);
	} catch (err) {
		console.error('captivePortal getAnnouncement error:', err);
		res.status(500).json({ error: 'Failed to fetch announcement' });
	}
}

async function getAnnouncementHistory(req, res) {
	try {
		const { network_id } = req.query;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id query param required' });
		}

		const { data, error } = await supabaseClient
			.from('captive_portal_announcements')
			.select('*')
			.eq('network_id', network_id)
			.order('created_at', { ascending: false });

		if (error) throw error;

		res.json(data);
	} catch (err) {
		console.error('captivePortal getAnnouncementHistory error:', err);
		res.status(500).json({ error: 'Failed to fetch announcement history' });
	}
}

async function publishAnnouncement(req, res) {
	try {
		const { content, network_id } = req.body;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id required in body' });
		}

		// Deactivate previous announcements for this network
		await supabaseClient
			.from('captive_portal_announcements')
			.update({ is_active: false })
			.eq('network_id', network_id);

		// Insert new active announcement
		const { data, error } = await supabaseClient
			.from('captive_portal_announcements')
			.insert({
				announcement_content: content ?? '',
				is_active: true,
				network_id,
			})
			.select()
			.single();

		if (error) throw error;

		// Update the captive_portal FK to point to the new announcement
		await supabaseClient
			.from('captive_portal')
			.update({ announcement_id: data.announcement_id })
			.eq('network_id', network_id)
			.eq('is_active', true);

		res.json(data);
	} catch (err) {
		console.error('captivePortal publishAnnouncement error:', err);
		res.status(500).json({ error: 'Failed to publish announcement' });
	}
}

// ─── Terms & Conditions CRUD ─────────────────────────────────────

async function getTerms(req, res) {
	try {
		const { network_id } = req.query;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id query param required' });
		}

		const { data, error } = await supabaseClient
			.from('terms_conditions')
			.select('*')
			.eq('network_id', network_id)
			.eq('is_active', true)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error) throw error;

		res.json(data || { tc_id: null, content: '', version: '', created_at: null });
	} catch (err) {
		console.error('captivePortal getTerms error:', err);
		res.status(500).json({ error: 'Failed to fetch terms' });
	}
}

async function getTermsHistory(req, res) {
	try {
		const { network_id } = req.query;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id query param required' });
		}

		const { data, error } = await supabaseClient
			.from('terms_conditions')
			.select('*')
			.eq('network_id', network_id)
			.order('created_at', { ascending: false });

		if (error) throw error;

		res.json(data);
	} catch (err) {
		console.error('captivePortal getTermsHistory error:', err);
		res.status(500).json({ error: 'Failed to fetch terms history' });
	}
}

async function publishTerms(req, res) {
	try {
		const { content, version, network_id } = req.body;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id required in body' });
		}

		// Deactivate previous terms for this network
		await supabaseClient
			.from('terms_conditions')
			.update({ is_active: false })
			.eq('network_id', network_id);

		// Insert new active terms
		const { data, error } = await supabaseClient
			.from('terms_conditions')
			.insert({
				content: content ?? '',
				version: version ?? 'v1',
				is_active: true,
				network_id,
			})
			.select()
			.single();

		if (error) throw error;

		// Update the captive_portal FK to point to the new terms
		await supabaseClient
			.from('captive_portal')
			.update({ tc_id: data.tc_id })
			.eq('network_id', network_id)
			.eq('is_active', true);

		res.json(data);
	} catch (err) {
		console.error('captivePortal publishTerms error:', err);
		res.status(500).json({ error: 'Failed to publish terms' });
	}
}

// ─── Tips CRUD ───────────────────────────────────────────────────

async function getTips(req, res) {
	try {
		const { network_id } = req.query;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id query param required' });
		}

		// Find the active portal row for this network
		const { data: portal } = await supabaseClient
			.from('captive_portal')
			.select('captive_portal_id')
			.eq('network_id', network_id)
			.eq('is_active', true)
			.maybeSingle();

		if (!portal) {
			return res.json([]);
		}

		const { data, error } = await supabaseClient
			.from('captive_portal_tips')
			.select('*')
			.eq('captive_portal_id', portal.captive_portal_id)
			.eq('is_active', true)
			.order('sort_order', { ascending: true });

		if (error) throw error;

		res.json(data || []);
	} catch (err) {
		console.error('captivePortal getTips error:', err);
		res.status(500).json({ error: 'Failed to fetch tips' });
	}
}

/**
 * Replace all tips for a network's portal.
 * Body: { network_id, tips: [{ tip_text, sort_order? }] }
 */
async function upsertTips(req, res) {
	try {
		const { network_id, tips } = req.body;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id required in body' });
		}
		if (!Array.isArray(tips)) {
			return res.status(400).json({ error: 'tips must be an array' });
		}

		// Ensure a portal row exists (seed if needed)
		const portalId = await seedDefaultContent(network_id);

		// Deactivate all existing tips for this portal
		await supabaseClient
			.from('captive_portal_tips')
			.update({ is_active: false })
			.eq('captive_portal_id', portalId);

		// Insert new tips
		const rows = tips.map((t, i) => ({
			captive_portal_id: portalId,
			tip_text: t.tip_text || '',
			sort_order: t.sort_order ?? i + 1,
			is_active: true,
		}));

		const { data, error } = await supabaseClient
			.from('captive_portal_tips')
			.insert(rows)
			.select();

		if (error) throw error;

		res.json(data);
	} catch (err) {
		console.error('captivePortal upsertTips error:', err);
		res.status(500).json({ error: 'Failed to update tips' });
	}
}

// ─── Risk Classification ─────────────────────────────────────────

async function getRiskClassifications(req, res) {
	try {
		const { data, error } = await supabaseClient
			.from('risk_classification')
			.select('*')
			.order('risk_percentage', { ascending: true });

		if (error) throw error;

		res.json(data);
	} catch (err) {
		console.error('captivePortal getRiskClassifications error:', err);
		res.status(500).json({ error: 'Failed to fetch risk classifications' });
	}
}

// ─── Portal Summary (preview JSON without pushing) ───────────────

async function getPortalSummary(req, res) {
	try {
		const { network_id } = req.query;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id query param required' });
		}

		const { data: net, error: netErr } = await supabaseClient
			.from('networks')
			.select('bssid, ssid')
			.eq('network_id', network_id)
			.single();
		if (netErr) throw netErr;

		const payload = await buildPortalPayloadFromDB(
			network_id,
			net.bssid,
			net.ssid
		);
		res.json(payload);
	} catch (err) {
		console.error('captivePortal getPortalSummary error:', err);
		res.status(500).json({ error: 'Failed to build portal summary' });
	}
}

// ─── Sync Portal to FastAPI /portal/patch ────────────────────────

async function syncPortal(req, res) {
	try {
		const { network_id } = req.body;
		if (!network_id) {
			return res.status(400).json({ error: 'network_id required in body' });
		}

		// Load network for bssid/ssid
		const { data: net, error: netErr } = await supabaseClient
			.from('networks')
			.select('bssid, ssid')
			.eq('network_id', network_id)
			.single();
		if (netErr) throw netErr;

		// Build payload from DB content
		const payload = await buildPortalPayloadFromDB(
			network_id,
			net.bssid,
			net.ssid
		);

		// Forward to FastAPI
		const fastapiRes = await fetch(`${FASTAPI_BASE}/portal/patch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
		const fastapiData = await fastapiRes.json().catch(() => null);
		if (!fastapiRes.ok) {
			throw new Error(
				fastapiData?.detail || `portal/patch error: ${fastapiRes.status}`
			);
		}

		res.json({ status: 'synced', fastapi: fastapiData, payload });
	} catch (err) {
		console.error('captivePortal syncPortal error:', err);
		res.status(500).json({ error: 'Failed to sync portal', detail: err.message });
	}
}

// ═══════════════════════════════════════════════════════════════════

module.exports = {
	// Route handlers
	getAnnouncement,
	getAnnouncementHistory,
	publishAnnouncement,
	getTerms,
	getTermsHistory,
	publishTerms,
	getTips,
	upsertTips,
	getRiskClassifications,
	getPortalSummary,
	syncPortal,

	// Helpers (for use in deviceMgmtRoutes)
	seedDefaultContent,
	lookupRiskClassification,
	buildPortalPayloadFromDB,
};
