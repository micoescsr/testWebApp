// utils/riskPipeline.js
// Risk pipeline: bucket computation, version bumping, auto-portal patching.
// Scoring is driven by Supabase RPC compute_scan_risk; bucketize() maps 0-100 to official scale.

const { supabaseClient } = require('../config/supabaseClient');
const { logAuditEvent } = require('./auditLogger');
const { piFetch } = require('./piFetch');
const {
	computePortalTipsetHash,
	resolveFinalPortalTipsForNetwork,
} = require('./portalTipResolver');
const { buildPortalPayloadFromDB } = require('../controllers/captivePortalController');

// Cooldown: don't portal-patch the same network more often than this
const PORTAL_PATCH_COOLDOWN_MS = parseInt(process.env.PORTAL_PATCH_COOLDOWN_MS || '15000', 10); // 15s

// ─── Bucket constants ────────────────────────────────────────────
const BUCKETS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const BUCKET_RANK = Object.fromEntries(BUCKETS.map((b, i) => [b, i]));

/**
 * Deterministic score → bucket using the OFFICIAL percent scale.
 *
 *   0      → LOW
 *   1–39   → LOW
 *   40–69  → MEDIUM
 *   70–89  → HIGH
 *   90–100 → CRITICAL
 *
 * @param {number} score  0–100
 * @returns {string} LOW|MEDIUM|HIGH|CRITICAL
 */
function bucketize(score) {
	const s = Number(score) || 0;
	if (s <= 0)  return 'LOW';
	if (s <= 39) return 'LOW';
	if (s <= 69) return 'MEDIUM';
	if (s <= 89) return 'HIGH';
	return 'CRITICAL';
}

/**
 * Return whichever bucket is higher.
 */
function maxBucket(a, b) {
	return (BUCKET_RANK[a] ?? 0) >= (BUCKET_RANK[b] ?? 0) ? a : b;
}

// ─── Bucket derivation from scan_data ────────────────────────────
/**
 * Derive risk bucket from vulnerability_scans.scan_data.
 * Walks findings looking for severity labels (Critical/High/Medium/Low).
 * Falls back: any findings → MEDIUM, none → LOW.
 *
 * @param {object|Array|null} scanData
 * @returns {string} bucket
 */
function deriveBucketFromScanData(scanData) {
	if (!scanData) return 'LOW';

	// scan_data may be an array of findings or an object with a findings array
	let findings = [];
	if (Array.isArray(scanData)) {
		findings = scanData;
	} else if (Array.isArray(scanData.findings)) {
		findings = scanData.findings;
	} else if (typeof scanData === 'object') {
		// Object with keyed findings (like { encryption: {...}, evil_twin: {...} })
		findings = Object.values(scanData);
	}

	if (findings.length === 0) return 'LOW';

	let highest = 'LOW';

	for (const f of findings) {
		if (!f || typeof f !== 'object') continue;

		// Try multiple common severity field names
		const sev = (
			f.severity ||
			f.severity_rating ||
			f.vt_severity_rating ||
			''
		).toString().toUpperCase();

		if (sev.includes('CRITICAL')) return 'CRITICAL'; // short-circuit
		if (sev.includes('HIGH')) highest = maxBucket(highest, 'HIGH');
		else if (sev.includes('MEDIUM')) highest = maxBucket(highest, 'MEDIUM');

		// Also check numeric score if present
		const score = Number(f.score ?? f.cvss_base_score ?? f.severity_score ?? null);
		if (!isNaN(score) && score > 0) {
			if (score >= 9.0) return 'CRITICAL';
			if (score >= 7.0) highest = maxBucket(highest, 'HIGH');
			else if (score >= 4.0) highest = maxBucket(highest, 'MEDIUM');
		}
	}

	// Fallback: if we found findings but no severity info, treat as MEDIUM
	if (highest === 'LOW' && findings.length > 0) {
		// Check if any finding looks "real" (has a status or id)
		const hasReal = findings.some(f => f && (f.status || f.id || f.vt_name));
		if (hasReal) highest = 'MEDIUM';
	}

	return highest;
}

// ─── Bucket derivation from threat rows ──────────────────────────
/**
 * Derive bucket from mapped threat rows (output of mapPollResultsToThreatRows).
 * Only considers DETECTED threats (not CLEARED).
 *
 * @param {Array} threatRows
 * @returns {string} bucket
 */
function deriveBucketFromThreats(threatRows) {
	if (!Array.isArray(threatRows) || threatRows.length === 0) return 'LOW';

	let highest = 'LOW';
	for (const t of threatRows) {
		// Only elevate for active threats
		if (t.status === 'CLEARED') continue;

		const sev = (t.severity || '').toUpperCase();
		if (sev.includes('CRITICAL')) return 'CRITICAL';
		if (sev.includes('HIGH')) highest = maxBucket(highest, 'HIGH');
		else if (sev.includes('MEDIUM')) highest = maxBucket(highest, 'MEDIUM');

		const score = Number(t.score ?? 0);
		if (score >= 9.0) return 'CRITICAL';
		if (score >= 7.0) highest = maxBucket(highest, 'HIGH');
		else if (score >= 4.0) highest = maxBucket(highest, 'MEDIUM');
	}

	return highest;
}

// ─── Core: update network risk + auto-portal ─────────────────────
/**
 * Compare new risk against current network state. If changed, bump
 * risk_score_version and optionally auto-trigger a risk portal patch.
 *
 * @param {string} networkId
 * @param {object} opts
 * @param {string} opts.newBucket       – computed bucket
 * @param {number} [opts.newScore=0]    – computed score (0 in bucket-only phase)
 * @param {string} opts.reason          – 'scan_completed'|'threat_detected'
 * @param {string} [opts.scanId]        – if triggered by scan
 * @param {string} [opts.finishedAt]    – scan finished_at
 * @param {object} [opts.req]           – Express req (for audit, may be null for server-side calls)
 * @returns {{ changed: boolean, portalPatched: boolean, oldBucket: string, newBucket: string }}
 */
async function updateNetworkRisk(networkId, opts = {}) {
	const {
		newBucket,
		newScore = 0,
		reason = 'unknown',
		scanId = null,
		finishedAt = null,
		req = null,
	} = opts;

	// 1) Read current network state
	const { data: net, error: netErr } = await supabaseClient
		.from('networks')
		.select('risk_score, risk_bucket, risk_score_version, ap_enabled, portal_last_patched_at, portal_tipset_hash')
		.eq('network_id', networkId)
		.maybeSingle();

	if (netErr) throw netErr;
	if (!net) {
		console.warn('[riskPipeline] Network not found:', networkId);
		return { changed: false, portalPatched: false, oldBucket: null, newBucket };
	}

	const oldBucket = net.risk_bucket || 'LOW';
	const oldScore = Number(net.risk_score) || 0;
	const currentVersion = Number(net.risk_score_version) || 0;

	// 2) Build update payload
	const update = {};

	// Always update scan pointer if provided
	if (scanId) {
		update.last_scan_id = scanId;
	}
	if (finishedAt) {
		update.last_scan_finished_at = finishedAt;
	}
	if (reason === 'threat_detected') {
		update.last_threat_at = new Date().toISOString();
	}

	// 3) Check if risk actually changed
	const bucketChanged = newBucket !== oldBucket;
	const scoreChanged = newScore !== oldScore;
	const riskChanged = bucketChanged || scoreChanged;

	if (riskChanged) {
		update.risk_score = newScore;
		update.risk_bucket = newBucket;
		update.risk_score_version = currentVersion + 1;
	}

	// 4) Persist
	if (Object.keys(update).length > 0) {
		const { error: updErr } = await supabaseClient
			.from('networks')
			.update(update)
			.eq('network_id', networkId);
		if (updErr) {
			console.error('[riskPipeline] Failed to update network risk:', updErr);
			throw updErr;
		}
	}

	// 5) Audit (optional)
	if (riskChanged) {
		await logAuditEvent({
			req,
			actorId: null,
			eventName: 'RISK_UPDATE',
			eventStatus: 'SUCCESS',
			entityType: 'NETWORK',
			entityIdUuid: networkId,
			meta: {
				reason,
				old_bucket: oldBucket,
				new_bucket: newBucket,
				old_score: oldScore,
				new_score: newScore,
				version: riskChanged ? currentVersion + 1 : currentVersion,
				scan_id: scanId,
			},
		});
	}

	// 6) Auto-trigger portal patching
	//    - Risk changes still trigger a patch.
	//    - Tipset changes can trigger a patch even when risk stays the same.
	let portalPatched = false;
	if (net.ap_enabled) {
		const shouldRecomputePortal = (
			riskChanged ||
			reason === 'scan_completed' ||
			reason === 'threat_detected' ||
			reason === 'threat_cleared'
		);

		if (shouldRecomputePortal) {
			let tipsetChanged = false;
			try {
				const resolved = await resolveFinalPortalTipsForNetwork(supabaseClient, networkId);
				const desiredHash = resolved?.tipsetHash || null;
				const stampedHash = net.portal_tipset_hash || null;
				tipsetChanged = !!desiredHash && desiredHash !== stampedHash;
			} catch (hashErr) {
				console.warn('[riskPipeline] tipset hash recompute failed (non-fatal):', hashErr.message);
				tipsetChanged = false;
			}

			if (tipsetChanged) {
				portalPatched = await autoPortalAdvisoryPatch(networkId, net.portal_last_patched_at, req);
			} else if (riskChanged) {
				portalPatched = await autoPortalRiskPatch(networkId, newBucket, net.portal_last_patched_at, req);
			}
		}
	}

	console.log(`[riskPipeline] network=${networkId} reason=${reason} bucket=${oldBucket}→${newBucket} changed=${riskChanged} portalPatched=${portalPatched}`);

	return { changed: riskChanged, portalPatched, oldBucket, newBucket };
}

// ─── Auto-portal full advisory patch (tips + security) ──────────
/**
 * Trigger a full portal patch using buildPortalPayloadFromDB so the Pi receives
 * the final resolved flat tips array. Stamps portal_tipset_hash on success.
 * Uses the same cooldown strategy as autoPortalRiskPatch.
 */
async function autoPortalAdvisoryPatch(networkId, lastPatchedAt, req = null) {
	// Cooldown: skip if patched too recently
	if (lastPatchedAt) {
		const elapsed = Date.now() - new Date(lastPatchedAt).getTime();
		if (elapsed < PORTAL_PATCH_COOLDOWN_MS) {
			console.log(`[riskPipeline] Portal patch cooldown active for ${networkId} (${elapsed}ms < ${PORTAL_PATCH_COOLDOWN_MS}ms), skipping`);
			return false;
		}
	}

	try {
		// Snapshot bucket/version + network config before patch
		const { data: preNet, error: preErr } = await supabaseClient
			.from('networks')
			.select('risk_score_version, risk_bucket, bssid, ssid')
			.eq('network_id', networkId)
			.single();
		if (preErr) throw preErr;
		if (!preNet?.bssid || !preNet?.ssid) {
			console.warn('[riskPipeline] autoPortalAdvisoryPatch: missing bssid/ssid for network', networkId);
			return false;
		}

		const patchBucket = preNet.risk_bucket;
		const patchVersion = Number(preNet.risk_score_version) || 0;

		const payload = await buildPortalPayloadFromDB(networkId, preNet.bssid, preNet.ssid);
		const tips = payload?.patch?.portal_content?.tips?.items || [];
		// Stamp the resolver hash so it matches the state endpoint's freshness
		// comparison; fall back to the payload-items hash only if resolution fails.
		const resolvedTipset = await resolveFinalPortalTipsForNetwork(supabaseClient, networkId);
		const tipsetHash = resolvedTipset?.tipsetHash || computePortalTipsetHash(tips);

		console.log(`[riskPipeline] Auto portal/patch (advisory) network=${networkId} version=${patchVersion} bucket=${patchBucket} tips=${Array.isArray(tips) ? tips.length : 0}`);

		const { ok: piOk, status: piStatus, data: body } = await piFetch('/portal/patch', {
			method: 'POST',
			jsonBody: payload,
		});

		if (!piOk) {
			console.error(`[riskPipeline] portal/patch advisory failed: ${piStatus}`, body);
			await logAuditEvent({
				req,
				actorId: null,
				eventName: 'PORTAL_UPDATE',
				eventStatus: 'FAILED',
				entityType: 'NETWORK',
				entityIdUuid: networkId,
				meta: { reason: 'auto_advisory_patch', fastapi_status: piStatus, fastapi_body: body },
			});
			return false;
		}

		// Verify bucket hasn't drifted during patch
		const { data: postNet } = await supabaseClient
			.from('networks')
			.select('risk_score_version, risk_bucket')
			.eq('network_id', networkId)
			.single();

		const postVersion = Number(postNet?.risk_score_version) || 0;
		const postBucket = postNet?.risk_bucket;

		if (postBucket !== patchBucket) {
			console.log(`[riskPipeline] Bucket drifted (${patchBucket}→${postBucket}) during advisory patch, skipping stamp`);
			return false;
		}

		await supabaseClient
			.from('networks')
			.update({
				portal_last_patched_at: new Date().toISOString(),
				portal_last_patched_version: postVersion,
				portal_tipset_hash: tipsetHash,
			})
			.eq('network_id', networkId);

		await logAuditEvent({
			req,
			actorId: null,
			eventName: 'PORTAL_UPDATE',
			eventStatus: 'SUCCESS',
			entityType: 'NETWORK',
			entityIdUuid: networkId,
			meta: { reason: 'auto_advisory_patch', fastapi_status: piStatus, stamped_version: postVersion },
		});

		console.log(`[riskPipeline] Auto advisory portal/patch success for ${networkId}, stampedVersion=${postVersion}`);
		return true;
	} catch (err) {
		console.error('[riskPipeline] autoPortalAdvisoryPatch error:', err.message);
		return false;
	}
}

// ─── Auto-portal risk patch (with simple cooldown) ───────────────
/**
 * Trigger a risk-only portal patch via internal FastAPI call.
 * Enforces a simple time-based cooldown using portal_last_patched_at.
 *
 * @param {string} networkId
 * @param {string} bucket
 * @param {string|null} lastPatchedAt
 * @param {object|null} req
 * @returns {boolean} whether patch was actually sent
 */
async function autoPortalRiskPatch(networkId, bucket, lastPatchedAt, req = null) {
	// Simple cooldown: skip if patched too recently (NULL = never patched → allow)
	if (lastPatchedAt) {
		const elapsed = Date.now() - new Date(lastPatchedAt).getTime();
		if (elapsed < PORTAL_PATCH_COOLDOWN_MS) {
			console.log(`[riskPipeline] Portal patch cooldown active for ${networkId} (${elapsed}ms < ${PORTAL_PATCH_COOLDOWN_MS}ms), skipping`);
			return false;
		}
	}

	try {
		// Snapshot the version we are about to patch
		const { data: preNet } = await supabaseClient
			.from('networks')
			.select('risk_score_version, risk_bucket')
			.eq('network_id', networkId)
			.single();

		const patchVersion = Number(preNet?.risk_score_version) || 0;
		const patchBucket = preNet?.risk_bucket || bucket;

		const payload = { network_id: networkId, risk: { bucket: patchBucket } };

		console.log(`[riskPipeline] Auto portal/patch →`, JSON.stringify(payload));

		const { ok: piOk, status: piStatus, data: body } = await piFetch('/portal/patch', {
			method: 'POST',
			jsonBody: payload,
		});

		if (!piOk) {
			console.error(`[riskPipeline] portal/patch failed: ${piStatus}`, body);
			await logAuditEvent({
				req, actorId: null,
				eventName: 'PORTAL_UPDATE', eventStatus: 'FAILED',
				entityType: 'NETWORK', entityIdUuid: networkId,
				meta: { reason: 'auto_risk_patch', bucket: patchBucket, fastapi_status: piStatus, fastapi_body: body },
			});
			return false;
		}

		// Verify bucket hasn't drifted between patch send and stamp
		const { data: postNet } = await supabaseClient
			.from('networks')
			.select('risk_score_version, risk_bucket')
			.eq('network_id', networkId)
			.single();

		const postVersion = Number(postNet?.risk_score_version) || 0;
		const postBucket = postNet?.risk_bucket;

		if (postBucket !== patchBucket) {
			// Bucket changed during patch — don't stamp, let next cycle re-patch
			console.log(`[riskPipeline] Bucket drifted (${patchBucket}→${postBucket}) during patch, skipping stamp`);
			return false;
		}

		// Stamp to the version we actually patched (or current if unchanged)
		await supabaseClient
			.from('networks')
			.update({
				portal_last_patched_at: new Date().toISOString(),
				portal_last_patched_version: postVersion,
			})
			.eq('network_id', networkId);

		console.log(`[riskPipeline] Auto portal/patch success for ${networkId}, bucket=${patchBucket}, stampedVersion=${postVersion}`);

		await logAuditEvent({
			req, actorId: null,
			eventName: 'PORTAL_UPDATE', eventStatus: 'SUCCESS',
			entityType: 'NETWORK', entityIdUuid: networkId,
			meta: { reason: 'auto_risk_patch', bucket: patchBucket, fastapi_status: piStatus, stamped_version: postVersion },
		});

		return true;
	} catch (err) {
		console.error('[riskPipeline] autoPortalRiskPatch error:', err.message);
		return false;
	}
}

// ─── Hook: onScanCompleted ───────────────────────────────────────
/**
 * Call when a vulnerability_scans row reaches COMPLETED + no error_code.
 * Loads scan_data, derives bucket, updates network risk + auto-patches portal.
 *
 * @param {string} scanId
 * @param {object} [req] – Express req for audit context (null if server-side)
 * @returns {{ changed, portalPatched, oldBucket, newBucket }}
 */
async function onScanCompleted(scanId, req = null, opts = {}) {
	const { legacyScanId = null } = opts;

	// Load scan row
	const { data: scan, error: scanErr } = await supabaseClient
		.from('vulnerability_scans')
		.select('scan_id, network_id, status, finished_at, error_code, scan_data')
		.eq('scan_id', scanId)
		.single();

	if (scanErr || !scan) {
		console.warn('[riskPipeline] onScanCompleted: scan not found', scanId);
		return { changed: false, portalPatched: false };
	}

	if (scan.status !== 'COMPLETED' || scan.error_code) {
		console.log('[riskPipeline] onScanCompleted: scan not eligible', { status: scan.status, error_code: scan.error_code });
		return { changed: false, portalPatched: false };
	}

	// Authoritative risk source: compute_scan_risk(p_scan_id bigint) RPC
	// (noisy-OR over vulnerabilities_threat, returns 0–100 → bucketize).
	// The RPC keys on the legacy public.scans BIGINT id, while this function
	// receives the vulnerability_scans UUID. Prefer the BIGINT id passed by the
	// scan-save path; otherwise resolve the latest scans row for the network.
	// deriveBucketFromScanData remains only as a defensive fallback because it
	// cannot read severity (which lives in vulnerability_threat_details).
	let bigintScanId = legacyScanId;
	if (bigintScanId === null || bigintScanId === undefined) {
		const { data: legacy } = await supabaseClient
			.from('scans')
			.select('scan_id')
			.eq('network_id', scan.network_id)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		bigintScanId = legacy?.scan_id ?? null;
	}

	let scanScore = 0;
	let scanBucket = 'LOW';
	if (bigintScanId !== null && bigintScanId !== undefined) {
		const { data: rpcScore, error: rpcErr } = await supabaseClient.rpc('compute_scan_risk', { p_scan_id: bigintScanId });
		if (rpcErr) {
			console.warn('[riskPipeline] compute_scan_risk RPC failed; falling back to scan_data heuristic:', rpcErr.message);
			scanBucket = deriveBucketFromScanData(scan.scan_data);
		} else {
			scanScore = Number(rpcScore) || 0;
			scanBucket = bucketize(scanScore);
		}
	} else {
		console.warn('[riskPipeline] onScanCompleted: no legacy scan id resolvable; using scan_data heuristic for', scanId);
		scanBucket = deriveBucketFromScanData(scan.scan_data);
	}

	// Factor in recent threats: if last_threat_at within 5 min, elevate
	const { data: net } = await supabaseClient
		.from('networks')
		.select('last_threat_at, risk_bucket')
		.eq('network_id', scan.network_id)
		.maybeSingle();

	let effectiveBucket = scanBucket;
	if (net?.last_threat_at) {
		const threatAge = Date.now() - new Date(net.last_threat_at).getTime();
		if (threatAge < 5 * 60 * 1000) {
			// Threats still recent — don't let scan downgrade below current bucket
			effectiveBucket = maxBucket(scanBucket, net.risk_bucket || 'LOW');
		}
	}

	return updateNetworkRisk(scan.network_id, {
		newBucket: effectiveBucket,
		newScore: scanScore, // authoritative RPC score (0 when fallback/unavailable)
		reason: 'scan_completed',
		scanId: scan.scan_id,
		finishedAt: scan.finished_at,
		req,
	});
}

// ─── Hook: onThreatEvent ─────────────────────────────────────────
/**
 * Call after threat telemetry is persisted.
 * Derives bucket from threat rows, elevates if needed, auto-patches portal.
 *
 * @param {string} networkId
 * @param {Array} threatRows – mapped threat rows (from mapPollResultsToThreatRows)
 * @param {object} [req] – Express req for audit context
 * @returns {{ changed, portalPatched, oldBucket, newBucket }}
 */
async function onThreatEvent(networkId, threatRows, req = null) {
	if (!networkId || !Array.isArray(threatRows) || threatRows.length === 0) {
		return { changed: false, portalPatched: false };
	}

	// Only consider DETECTED threats (not CLEARED)
	const activeThreats = threatRows.filter(t => t.status !== 'CLEARED');
	if (activeThreats.length === 0) {
		// All cleared — potentially downgrade
		// Read current state and check if we should lower bucket
		const { data: net } = await supabaseClient
			.from('networks')
			.select('risk_bucket, last_scan_id')
			.eq('network_id', networkId)
			.maybeSingle();

		if (!net) return { changed: false, portalPatched: false };

		// If we have a recent scan, re-derive bucket from it
		if (net.last_scan_id) {
			const { data: scan } = await supabaseClient
				.from('vulnerability_scans')
				.select('scan_data')
				.eq('scan_id', net.last_scan_id)
				.maybeSingle();

			if (scan?.scan_data) {
				const scanBucket = deriveBucketFromScanData(scan.scan_data);
				return updateNetworkRisk(networkId, {
					newBucket: scanBucket,
					newScore: 0,
					reason: 'threat_cleared',
					req,
				});
			}
		}

		return { changed: false, portalPatched: false };
	}

	// Derive bucket from active threats
	const threatBucket = deriveBucketFromThreats(activeThreats);

	// Read current network bucket — threats can only elevate, not lower
	const { data: net } = await supabaseClient
		.from('networks')
		.select('risk_bucket')
		.eq('network_id', networkId)
		.maybeSingle();

	if (!net) return { changed: false, portalPatched: false };

	const currentBucket = net.risk_bucket || 'LOW';
	const effectiveBucket = maxBucket(currentBucket, threatBucket);

	return updateNetworkRisk(networkId, {
		newBucket: effectiveBucket,
		newScore: 0,
		reason: 'threat_detected',
		req,
	});
}

module.exports = {
	bucketize,
	maxBucket,
	deriveBucketFromScanData,
	deriveBucketFromThreats,
	updateNetworkRisk,
	onScanCompleted,
	onThreatEvent,
};
