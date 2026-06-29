// __tests__/unit/riskPipeline.onScanCompleted.test.js
// BUG-3B: onScanCompleted must persist the authoritative compute_scan_risk RPC
// score → bucketize → networks.risk_bucket, instead of the broken
// deriveBucketFromScanData heuristic that always yielded LOW.

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../config/supabaseClient', () => ({
	supabaseClient: {
		from: (...args) => mockFrom(...args),
		rpc: (...args) => mockRpc(...args),
	},
}));

jest.mock('../../utils/piFetch', () => ({ piFetch: jest.fn() }));
jest.mock('../../utils/auditLogger', () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/portalTipResolver', () => ({
	computePortalTipsetHash: jest.fn().mockReturnValue('hash'),
	resolveFinalPortalTipsForNetwork: jest.fn().mockResolvedValue({ tipsetHash: 'hash' }),
}));
jest.mock('../../controllers/captivePortalController', () => ({
	buildPortalPayloadFromDB: jest.fn().mockResolvedValue({}),
}));

const { onScanCompleted } = require('../../utils/riskPipeline');

function makeChain({ maybeSingleResult, singleResult, defaultResult, onUpdate } = {}) {
	const defaultRes = defaultResult ?? { data: null, error: null };
	const maybeRes = maybeSingleResult ?? defaultRes;
	const singleRes = singleResult ?? defaultRes;
	const updateRes = { data: null, error: null };

	const updateChain = {
		eq: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		single: jest.fn().mockResolvedValue(updateRes),
		maybeSingle: jest.fn().mockResolvedValue(updateRes),
		then: (resolve, reject) => Promise.resolve(updateRes).then(resolve, reject),
	};
	updateChain.eq.mockReturnValue(updateChain);
	updateChain.select.mockReturnValue(updateChain);

	return {
		select: jest.fn().mockReturnThis(),
		eq: jest.fn().mockReturnThis(),
		order: jest.fn().mockReturnThis(),
		limit: jest.fn().mockReturnThis(),
		update: jest.fn((payload) => {
			if (onUpdate) onUpdate(payload);
			return updateChain;
		}),
		maybeSingle: jest.fn().mockResolvedValue(maybeRes),
		single: jest.fn().mockResolvedValue(singleRes),
		then: (resolve, reject) => Promise.resolve(defaultRes).then(resolve, reject),
	};
}

describe('onScanCompleted — authoritative RPC risk source (BUG-3B)', () => {
	beforeEach(() => {
		mockFrom.mockReset();
		mockRpc.mockReset();
	});

	test('persists compute_scan_risk score/bucket; HIGH/CRITICAL is not flattened to LOW', async () => {
		let networkUpdate = null;

		// compute_scan_risk returns 94 → CRITICAL
		mockRpc.mockResolvedValue({ data: 94, error: null });

		mockFrom
			// 1) load vulnerability_scans row (UUID)
			.mockImplementationOnce(() =>
				makeChain({
					singleResult: {
						data: {
							scan_id: 'uuid-scan-1',
							network_id: 'net-1',
							status: 'COMPLETED',
							finished_at: '2026-06-29T00:00:00.000Z',
							error_code: null,
							scan_data: { findings: { encryption: { id: 'WFVT-001', status: 'DETECTED' } } },
						},
						error: null,
					},
				})
			)
			// 2) onScanCompleted networks read (last_threat_at, risk_bucket)
			.mockImplementationOnce(() =>
				makeChain({ maybeSingleResult: { data: { last_threat_at: null, risk_bucket: 'LOW' }, error: null } })
			)
			// 3) updateNetworkRisk current-state read
			.mockImplementationOnce(() =>
				makeChain({
					maybeSingleResult: {
						data: {
							risk_score: 0,
							risk_bucket: 'LOW',
							risk_score_version: 0,
							ap_enabled: false,
							portal_last_patched_at: null,
							portal_tipset_hash: null,
						},
						error: null,
					},
				})
			)
			// 4) updateNetworkRisk persist
			.mockImplementationOnce(() => makeChain({ onUpdate: (p) => { networkUpdate = p; } }));

		const result = await onScanCompleted('uuid-scan-1', null, { legacyScanId: 123 });

		// RPC called with the BIGINT legacy id
		expect(mockRpc).toHaveBeenCalledWith('compute_scan_risk', { p_scan_id: 123 });

		expect(result.changed).toBe(true);
		expect(result.newBucket).toBe('CRITICAL');

		expect(networkUpdate).toBeTruthy();
		expect(networkUpdate.risk_bucket).toBe('CRITICAL');
		expect(networkUpdate.risk_score).toBe(94);
		expect(networkUpdate.risk_score_version).toBe(1);
	});

	test('falls back to scan_data heuristic when RPC errors (no crash)', async () => {
		let networkUpdate = null;
		mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc down' } });

		mockFrom
			.mockImplementationOnce(() =>
				makeChain({
					singleResult: {
						data: {
							scan_id: 'uuid-scan-2',
							network_id: 'net-2',
							status: 'COMPLETED',
							finished_at: '2026-06-29T00:00:00.000Z',
							error_code: null,
							scan_data: [{ severity: 'HIGH' }],
						},
						error: null,
					},
				})
			)
			.mockImplementationOnce(() =>
				makeChain({ maybeSingleResult: { data: { last_threat_at: null, risk_bucket: 'LOW' }, error: null } })
			)
			.mockImplementationOnce(() =>
				makeChain({
					maybeSingleResult: {
						data: { risk_score: 0, risk_bucket: 'LOW', risk_score_version: 0, ap_enabled: false, portal_last_patched_at: null, portal_tipset_hash: null },
						error: null,
					},
				})
			)
			.mockImplementationOnce(() => makeChain({ onUpdate: (p) => { networkUpdate = p; } }));

		const result = await onScanCompleted('uuid-scan-2', null, { legacyScanId: 456 });

		// Heuristic fallback recognizes the array-with-severity shape → HIGH
		expect(result.newBucket).toBe('HIGH');
		expect(networkUpdate.risk_bucket).toBe('HIGH');
	});
});
