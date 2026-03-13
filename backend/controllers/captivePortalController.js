// controllers/captivePortalController.js
// CRUD for captive portal content + portal sync to FastAPI

const { supabaseClient } = require('../config/supabaseClient');
const { logAuditEvent } = require('../utils/auditLogger');
const { piFetch } = require('../utils/piFetch');

// ═══════════════════════════════════════════════════════════════════
//  Shared helpers (exported for use in deviceMgmtRoutes)
// ═══════════════════════════════════════════════════════════════════

/**
 * Seed default captive portal content for a network if none exists.
 * Creates: announcement, captive_portal row, tips.
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

	// 2. Insert captive_portal row (joins announcement to network)
	const { data: portal, error: portalErr } = await supabaseClient
		.from('captive_portal')
		.insert({
			announcement_id: ann.announcement_id,
			is_active: true,
			network_id: networkId,
		})
		.select('captive_portal_id')
		.single();
	if (portalErr) throw portalErr;

	// 3. Insert default tips
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
 * Uses the `wifi_risk_scale` table where the score falls between
 * `min_percentage` and `max_percentage` (inclusive).
 *
 * @param {number} score – network security score between 0 and 100
 * @returns {{ risk_level, riskColor, riskDescription }}
 */
async function lookupRiskClassification(score) {
	try {
		const { data: raw, error } = await supabaseClient
			.from('wifi_risk_scale')
			.select('risk_label, ui_color, description, min_percentage, max_percentage')
			.lte('min_percentage', score)
			.gte('max_percentage', score)
			.limit(1)
			.maybeSingle();

		if (error) throw error;

		if (raw) return {
			risk_level: raw.risk_label,
			riskColor: raw.ui_color,
			riskDescription: raw.description,
		};
	} catch (err) {
		console.warn('[lookupRiskClassification] Falling back to default — table may not exist:', err.message);
	}

	// Fallback when table is missing or no matching row
	const s = Number(score) || 0;
	if (s <= 39) return { risk_level: 'LOW', riskColor: '#22c55e', riskDescription: 'Low risk' };
	if (s <= 69) return { risk_level: 'MEDIUM', riskColor: '#f59e0b', riskDescription: 'Medium risk' };
	if (s <= 89) return { risk_level: 'HIGH', riskColor: '#ef4444', riskDescription: 'High risk' };
	return { risk_level: 'CRITICAL', riskColor: '#dc2626', riskDescription: 'Critical risk' };
}

/**
 * Build the full portal/patch JSON payload from DB content.
 *
 * Reads announcements, tips from their respective tables,
 * fetches the latest risk_score from the scans table for the network,
 * then looks up the corresponding risk tier from `wifi_risk_scale`.
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
		.select('captive_portal_id, announcement_id')
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

	// 4. Tips
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

	// 5. Risk classification lookup
	const risk = await lookupRiskClassification(score);

	// 6. Build the payload matching FastAPI /portal/patch schema
	const payload = {
		network_id: `${bssid} | ${ssid}`,
		patch: {
			portal_content: {
				announcements: {
					updated_at: now,
					announcement_text: announcementText,
				},
				tips: {
					updated_at: now,
					items: tipItems,
				},
			},
			security: {
				score,
				risk_level: risk.risk_level,
				riskColor: risk.riskColor,
				riskDescription: risk.riskDescription,
				updated_at: now,
			},
		},
	};

	console.log(`[portalPayload] network=${networkId} score=${score} risk_level=${risk.risk_level} color=${risk.riskColor} announcement="${announcementText.substring(0, 80)}${announcementText.length > 80 ? '…' : ''}" tips=${tipItems.length} items=[${tipItems.map(t => `"${t.substring(0, 40)}"` ).join(', ')}]`);

	return payload;
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

		// Audit: announcement published
		const actorId = req.user?.id;
		if (actorId) {
			logAuditEvent({
				req,
				actorId,
				eventName: 'PORTAL.ANNOUNCEMENT_PUBLISH',
				eventStatus: 'SUCCESS',
				entityType: 'PORTAL',
				entityIdUuid: network_id,
				meta: { network_id, announcement_id: data.announcement_id },
			}).catch(() => {});
		}

		// ── Push announcement to Pi via portal/patch ─────────────
		let piSynced = false;
		let piError = null;
		try {
			const { data: net } = await supabaseClient
				.from('networks')
				.select('bssid, ssid, ap_enabled')
				.eq('network_id', network_id)
				.single();

			if (net) {
				let patchPayload;
				if (!net.ap_enabled) {
					// AP disabled: send full payload so content is ready when AP is enabled
					patchPayload = await buildPortalPayloadFromDB(network_id, net.bssid, net.ssid);
				} else {
					// AP enabled: send only announcement for real-time update
					const now = Math.floor(Date.now() / 1000);
					patchPayload = {
						network_id: `${net.bssid} | ${net.ssid}`,
						patch: {
							portal_content: {
								announcements: {
									updated_at: now,
									announcement_text: data.announcement_content,
								},
							},
						},
					};
				}

				const { ok: piOk, data: piData } = await piFetch('/portal/patch', {
					method: 'POST',
					jsonBody: patchPayload,
				});
				piSynced = piOk;
				if (!piOk) {
					piError = piData?.detail || 'portal/patch failed';
				}
			}
		} catch (piErr) {
			console.warn('Pi sync failed after announcement publish:', piErr.message);
			piError = 'Pi sync failed';
		}

		res.json({ ...data, pi_synced: piSynced, pi_error: piError });
	} catch (err) {
		console.error('captivePortal publishAnnouncement error:', err);
		res.status(500).json({ error: 'Failed to publish announcement' });
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

		// Audit: tips updated
		const actorId = req.user?.id;
		if (actorId) {
			logAuditEvent({
				req,
				actorId,
				eventName: 'PORTAL.TIPS_UPDATE',
				eventStatus: 'SUCCESS',
				entityType: 'PORTAL',
				entityIdUuid: network_id,
				meta: { network_id, tips_count: tips.length },
			}).catch(() => {});
		}

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
			.from('wifi_risk_scale')
			.select('*')
			.order('min_percentage', { ascending: true });

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
		const { ok: piOk, data: fastapiData } = await piFetch('/portal/patch', {
			method: 'POST',
			jsonBody: payload,
		});
		if (!piOk) {
			throw new Error(
				fastapiData?.detail || `portal/patch error`
			);
		}

		res.json({ status: 'synced', fastapi: fastapiData, payload });

		// Audit: portal synced (fire-and-forget after response)
		const actorId = req.user?.id;
		if (actorId) {
			logAuditEvent({
				req,
				actorId,
				eventName: 'PORTAL.SYNC',
				eventStatus: 'SUCCESS',
				entityType: 'PORTAL',
				entityIdUuid: network_id,
				meta: { network_id },
			}).catch(() => {});
		}
	} catch (err) {
		console.error('captivePortal syncPortal error:', err);
		res.status(500).json({ error: 'Failed to sync portal' });
	}
}

// ═══════════════════════════════════════════════════════════════════

module.exports = {
	// Route handlers
	getAnnouncement,
	getAnnouncementHistory,
	publishAnnouncement,
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
