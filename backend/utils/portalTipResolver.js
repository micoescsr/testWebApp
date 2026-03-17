// utils/portalTipResolver.js
// Resolve simplified, system-generated captive-portal tips based on detected
// Wi-Fi findings/threats, while keeping the final tips payload flat.

const crypto = require('crypto');

const MAX_PORTAL_TIPS = 20;
const MAX_PORTAL_TIP_TEXT_CHARS = 300;

const OPEN_ENCRYPTION_VALUES = new Set(['open', 'none', 'unencrypted', '']);

function normalizeEncryptionStatus(encryptionStatus) {
	if (encryptionStatus === null || encryptionStatus === undefined) return '';
	return String(encryptionStatus).trim().toLowerCase();
}

function isOpenEncryption(encryptionStatus) {
	return OPEN_ENCRYPTION_VALUES.has(normalizeEncryptionStatus(encryptionStatus));
}

function normalizeFindingStatus(status) {
	if (status === null || status === undefined) return '';
	return String(status).trim().toUpperCase();
}

function isActiveFindingStatus(status) {
	const s = normalizeFindingStatus(status);
	return s === 'DETECTED' || s === 'ACTIVE' || s === 'FOUND' || s === 'PRESENT';
}

function sanitizeTipText(text) {
	const t = (text === null || text === undefined) ? '' : String(text);
	const trimmed = t.trim();
	if (!trimmed) return null;
	if (trimmed.length <= MAX_PORTAL_TIP_TEXT_CHARS) return trimmed;
	return trimmed.slice(0, MAX_PORTAL_TIP_TEXT_CHARS);
}

function coerceInteger(value, fallback = 0) {
	if (Number.isInteger(value)) return value;
	const n = parseInt(String(value ?? ''), 10);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize + dedupe + sort + cap tips to match patch constraints.
 * Input can be rows from portal_tips or captive_portal_tips.
 * Output is [{ tip_text, sort_order, is_active }]
 */
function finalizePortalTips(rawTips, { maxTips = MAX_PORTAL_TIPS } = {}) {
	if (!Array.isArray(rawTips) || rawTips.length === 0) return [];

	const seen = new Set();
	const normalized = [];

	for (let i = 0; i < rawTips.length; i++) {
		const r = rawTips[i];
		if (!r) continue;
		const tipText = sanitizeTipText(typeof r === 'string' ? r : r.tip_text);
		if (!tipText) continue;

		const dedupeKey = tipText.toLowerCase();
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);

		normalized.push({
			tip_text: tipText,
			sort_order: coerceInteger(r.sort_order, i + 1),
			is_active: r.is_active === undefined ? true : !!r.is_active,
		});
	}

	normalized.sort((a, b) => {
		if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
		return a.tip_text.localeCompare(b.tip_text);
	});

	return normalized.slice(0, maxTips);
}

/**
 * Deterministic tipset hash used to detect portal freshness drift.
 * Hash is computed over a canonical, sorted representation.
 */
function computePortalTipsetHash(tips) {
	const finalTips = finalizePortalTips(tips);
	const canonical = finalTips.map((t) => ({
		tip_text: t.tip_text,
		sort_order: coerceInteger(t.sort_order, 0),
		is_active: !!t.is_active,
	}));
	const json = JSON.stringify(canonical);
	return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

function extractVtCodeFromJoinedDetail(detail) {
	if (!detail) return null;
	// Supabase may return an object or a single-element array depending on shape.
	if (Array.isArray(detail)) {
		return detail[0]?.vt_code || null;
	}
	return detail.vt_code || null;
}

function extractFindingsObjectFromScanData(scanData) {
	if (!scanData || typeof scanData !== 'object') return null;
	// Common shapes:
	//  - scan_data.findings (rasPiController writes scan object directly)
	//  - scan_data.scan.findings (some wrappers)
	return scanData.findings || scanData.scan?.findings || null;
}

/**
 * Resolve a unique set of detection codes for portal advisory mapping.
 * Sources:
 *  - Derived open authentication from networks.encryption_status (WFVT-001)
 *  - Latest eligible vulnerability_scans.scan_data.findings (UUID scans)
 *  - Latest legacy scan's vulnerabilities_threat (BIGINT scans)
 */
async function getDetectedPortalCodesForNetwork(supabaseClient, networkId) {
	const codes = new Set();

	// 1) network encryption status → derive WFVT-001 (open auth)
	let encryptionStatus = null;
	try {
		const { data: net, error: netErr } = await supabaseClient
			.from('networks')
			.select('encryption_status')
			.eq('network_id', networkId)
			.maybeSingle();
		if (netErr) throw netErr;
		encryptionStatus = net?.encryption_status ?? null;
	} catch (e) {
		// Non-fatal: treat as unknown; we can still map from scan findings
		console.warn('[portalTips] networks.encryption_status lookup failed:', e?.message || e);
	}
	if (isOpenEncryption(encryptionStatus)) {
		codes.add('WFVT-001');
	}

	// 2) Latest eligible vulnerability scan findings (UUID table)
	try {
		const { data: vulnScan, error: vulnErr } = await supabaseClient
			.from('vulnerability_scans')
			.select('scan_id, scan_data, finished_at')
			.eq('network_id', networkId)
			.eq('status', 'COMPLETED')
			.is('error_code', null)
			.order('finished_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (vulnErr) throw vulnErr;

		const findingsObj = extractFindingsObjectFromScanData(vulnScan?.scan_data);
		if (findingsObj && typeof findingsObj === 'object') {
			for (const f of Object.values(findingsObj)) {
				if (!f || typeof f !== 'object') continue;
				const code = typeof f.id === 'string' ? f.id : null;
				if (!code) continue;
				if (!isActiveFindingStatus(f.status)) continue;
				codes.add(code);
			}
		}
	} catch (e) {
		// Non-fatal: table may not exist in some environments
		console.warn('[portalTips] vulnerability_scans lookup failed:', e?.message || e);
	}

	// 3) Latest legacy scan findings (BIGINT scan_id)
	try {
		const { data: latestLegacy, error: legacyErr } = await supabaseClient
			.from('scans')
			.select('scan_id')
			.eq('network_id', networkId)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (legacyErr) throw legacyErr;
		const legacyScanId = latestLegacy?.scan_id ?? null;

		if (legacyScanId !== null && legacyScanId !== undefined) {
			const { data: findings, error: findErr } = await supabaseClient
				.from('vulnerabilities_threat')
				.select('vt_status, detail:vulnerability_threat_details(vt_code)')
				.eq('scan_id', legacyScanId);
			if (findErr) throw findErr;

			for (const row of findings || []) {
				if (!row) continue;
				if (!isActiveFindingStatus(row.vt_status)) continue;
				const vtCode = extractVtCodeFromJoinedDetail(row.detail);
				if (vtCode) codes.add(vtCode);
			}
		}
	} catch (e) {
		console.warn('[portalTips] vulnerabilities_threat lookup failed:', e?.message || e);
	}

	return Array.from(codes);
}

/**
 * Fetch mapped portal tips from the new portal_tips table.
 * Returns { tips, detectedCodes, usedBaseline, tipsetHash } or null when
 * portal_tips is unavailable/unseeded.
 */
async function resolveConditionalPortalTips(supabaseClient, networkId) {
	let detectedCodes = [];
	try {
		detectedCodes = await getDetectedPortalCodesForNetwork(supabaseClient, networkId);
	} catch (e) {
		console.warn('[portalTips] code derivation failed:', e?.message || e);
		detectedCodes = [];
	}

	// Try detection-specific tips first
	let usedBaseline = false;
	let raw = [];
	try {
		if (detectedCodes.length > 0) {
			const { data: specific, error: specErr } = await supabaseClient
				.from('portal_tips')
				.select('tip_text, sort_order, is_active')
				.eq('tip_category', 'specific')
				.eq('is_active', true)
				.in('detection_code', detectedCodes)
				.order('sort_order', { ascending: true });
			if (specErr) throw specErr;
			raw = specific || [];
		}
	} catch (e) {
		// If table is missing or query fails, treat as unavailable
		console.warn('[portalTips] portal_tips specific query failed:', e?.message || e);
		return null;
	}

	let tips = finalizePortalTips(raw);

	// Baseline fallback when no specific tips matched
	if (tips.length === 0) {
		usedBaseline = true;
		try {
			const { data: baseline, error: baseErr } = await supabaseClient
				.from('portal_tips')
				.select('tip_text, sort_order, is_active')
				.eq('tip_category', 'baseline')
				.eq('is_active', true)
				.order('sort_order', { ascending: true });
			if (baseErr) throw baseErr;
			raw = baseline || [];
			tips = finalizePortalTips(raw);
		} catch (e) {
			console.warn('[portalTips] portal_tips baseline query failed:', e?.message || e);
			return null;
		}
	}

	// If table exists but is unseeded, allow callers to fall back.
	if (tips.length === 0) return null;

	return {
		tips,
		detectedCodes,
		usedBaseline,
		tipsetHash: computePortalTipsetHash(tips),
	};
}

/**
 * Resolve the final flat tips array that should be sent to the Pi.
 * Priority:
 *   1) portal_tips (conditional mapping; baseline fallback)
 *   2) legacy captive_portal_tips (per-network)
 *   3) hardcoded defaults
 */
async function resolveFinalPortalTipsForNetwork(supabaseClient, networkId) {
	const conditional = await resolveConditionalPortalTips(supabaseClient, networkId);
	if (conditional?.tips?.length) {
		return { ...conditional, source: 'portal_tips' };
	}

	// Legacy per-network tips (backward compatibility)
	try {
		const { data: portal, error: portalErr } = await supabaseClient
			.from('captive_portal')
			.select('captive_portal_id')
			.eq('network_id', networkId)
			.eq('is_active', true)
			.maybeSingle();
		if (portalErr) throw portalErr;

		if (portal?.captive_portal_id) {
			const { data: tips, error: tipsErr } = await supabaseClient
				.from('captive_portal_tips')
				.select('tip_text, sort_order, is_active')
				.eq('captive_portal_id', portal.captive_portal_id)
				.eq('is_active', true)
				.order('sort_order', { ascending: true });
			if (tipsErr) throw tipsErr;

			const final = finalizePortalTips(tips || []);
			if (final.length > 0) {
				return {
					tips: final,
					detectedCodes: [],
					usedBaseline: false,
					tipsetHash: computePortalTipsetHash(final),
					source: 'captive_portal_tips',
				};
			}
		}
	} catch (e) {
		console.warn('[portalTips] legacy captive_portal_tips lookup failed:', e?.message || e);
	}

	// Hardcoded defaults (last resort)
	const defaults = finalizePortalTips([
		{ tip_text: 'Use a VPN when possible.', sort_order: 1, is_active: true },
		{ tip_text: 'Avoid banking on public Wi-Fi.', sort_order: 2, is_active: true },
		{ tip_text: 'Keep your device software up to date.', sort_order: 3, is_active: true },
	]);
	return {
		tips: defaults,
		detectedCodes: [],
		usedBaseline: true,
		tipsetHash: computePortalTipsetHash(defaults),
		source: 'defaults',
	};
}

module.exports = {
	MAX_PORTAL_TIPS,
	MAX_PORTAL_TIP_TEXT_CHARS,
	isOpenEncryption,
	finalizePortalTips,
	computePortalTipsetHash,
	getDetectedPortalCodesForNetwork,
	resolveConditionalPortalTips,
	resolveFinalPortalTipsForNetwork,
};
