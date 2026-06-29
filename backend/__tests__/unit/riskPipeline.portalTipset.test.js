// __tests__/unit/riskPipeline.portalTipset.test.js
// Unit tests for utils/riskPipeline.js — auto-portal repatch on tipset change.

// We control supabaseClient.from behavior per test.
const mockFrom = jest.fn();

jest.mock('../../config/supabaseClient', () => ({
	supabaseClient: {
		from: (...args) => mockFrom(...args),
	},
}));

jest.mock('../../utils/piFetch', () => ({
	piFetch: jest.fn(),
}));

jest.mock('../../utils/auditLogger', () => ({
	logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../controllers/captivePortalController', () => ({
	buildPortalPayloadFromDB: jest.fn(),
}));

jest.mock('../../utils/portalTipResolver', () => {
	const actual = jest.requireActual('../../utils/portalTipResolver');
	return {
		...actual,
		resolveFinalPortalTipsForNetwork: jest.fn(),
	};
});

const { piFetch } = require('../../utils/piFetch');
const { buildPortalPayloadFromDB } = require('../../controllers/captivePortalController');
const { resolveFinalPortalTipsForNetwork } = require('../../utils/portalTipResolver');
const { updateNetworkRisk } = require('../../utils/riskPipeline');

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
		update: jest.fn((payload) => {
			if (onUpdate) onUpdate(payload);
			return updateChain;
		}),
		maybeSingle: jest.fn().mockResolvedValue(maybeRes),
		single: jest.fn().mockResolvedValue(singleRes),
		then: (resolve, reject) => Promise.resolve(defaultRes).then(resolve, reject),
	};
}

describe('riskPipeline tipset-driven portal patching', () => {
	beforeEach(() => {
		mockFrom.mockReset();
		piFetch.mockReset();
		buildPortalPayloadFromDB.mockReset();
		resolveFinalPortalTipsForNetwork.mockReset();
	});

	test('auto-patches portal when tipset changes even if risk did not', async () => {
		const networkId = 'net-123';
		let stampedUpdate = null;

		resolveFinalPortalTipsForNetwork.mockResolvedValue({
			tips: [{ tip_text: 'Tip A', sort_order: 1, is_active: true }],
			tipsetHash: 'desired-hash',
			source: 'portal_tips',
		});

		const payload = {
			network_id: 'AA:BB:CC:DD:EE:FF | TestNet',
			patch: {
				portal_content: {
					announcements: { updated_at: 1740000000, announcement_text: 'Welcome' },
					tips: {
						updated_at: 1740000000,
						items: [{ tip_text: 'Tip A', sort_order: 1, is_active: true }],
					},
				},
				security: { score: 0, risk_level: 'LOW', updated_at: 1740000000 },
			},
		};

		buildPortalPayloadFromDB.mockResolvedValue(payload);
		piFetch.mockResolvedValue({ ok: true, status: 200, data: { ok: true } });

		mockFrom
			.mockImplementationOnce(() =>
				makeChain({
					maybeSingleResult: {
						data: {
							risk_score: 0,
							risk_bucket: 'LOW',
							risk_score_version: 1,
							ap_enabled: true,
							portal_last_patched_at: null,
							portal_tipset_hash: 'old-hash',
						},
						error: null,
					},
				})
			)
			.mockImplementationOnce(() =>
				makeChain({
					singleResult: {
						data: {
							risk_score_version: 1,
							risk_bucket: 'LOW',
							bssid: 'AA:BB:CC:DD:EE:FF',
							ssid: 'TestNet',
						},
						error: null,
					},
				})
			)
			.mockImplementationOnce(() =>
				makeChain({
					singleResult: {
						data: { risk_score_version: 1, risk_bucket: 'LOW' },
						error: null,
					},
				})
			)
			.mockImplementationOnce(() =>
				makeChain({
					onUpdate: (payload) => {
						stampedUpdate = payload;
					},
				})
			);

		const result = await updateNetworkRisk(networkId, {
			newBucket: 'LOW',
			newScore: 0,
			reason: 'scan_completed',
		});

		expect(result.changed).toBe(false);
		expect(result.portalPatched).toBe(true);

		expect(piFetch).toHaveBeenCalledTimes(1);
		const [path, opts] = piFetch.mock.calls[0];
		expect(path).toBe('/portal/patch');
		expect(opts.jsonBody.patch).toBeDefined(); // advisory patch payload

		expect(stampedUpdate).toBeTruthy();
		expect(stampedUpdate.portal_last_patched_version).toBe(1);
		// BUG-2A fix: advisory patch now stamps the resolver hash (the value the
		// state endpoint compares against), not the string-array payload hash.
		expect(stampedUpdate.portal_tipset_hash).toBe('desired-hash');
	});

	test('risk change triggers risk-only patch when tipset did not change', async () => {
		const networkId = 'net-456';
		let stampUpdate = null;
		let riskUpdate = null;

		resolveFinalPortalTipsForNetwork.mockResolvedValue({
			tips: [{ tip_text: 'Tip A', sort_order: 1, is_active: true }],
			tipsetHash: 'same-hash',
			source: 'portal_tips',
		});

		piFetch.mockResolvedValue({ ok: true, status: 200, data: { ok: true } });

		mockFrom
			.mockImplementationOnce(() =>
				makeChain({
					maybeSingleResult: {
						data: {
							risk_score: 0,
							risk_bucket: 'LOW',
							risk_score_version: 1,
							ap_enabled: true,
							portal_last_patched_at: null,
							portal_tipset_hash: 'same-hash',
						},
						error: null,
					},
				})
			)
			// updateNetworkRisk step 4: persist risk bump
			.mockImplementationOnce(() =>
				makeChain({
					onUpdate: (payload) => {
						riskUpdate = payload;
					},
				})
			)
			// autoPortalRiskPatch preNet snapshot
			.mockImplementationOnce(() =>
				makeChain({
					singleResult: {
						data: { risk_score_version: 2, risk_bucket: 'HIGH' },
						error: null,
					},
				})
			)
			// autoPortalRiskPatch postNet snapshot
			.mockImplementationOnce(() =>
				makeChain({
					singleResult: {
						data: { risk_score_version: 2, risk_bucket: 'HIGH' },
						error: null,
					},
				})
			)
			// autoPortalRiskPatch stamp
			.mockImplementationOnce(() =>
				makeChain({
					onUpdate: (payload) => {
						stampUpdate = payload;
					},
				})
			);

		const result = await updateNetworkRisk(networkId, {
			newBucket: 'HIGH',
			newScore: 0,
			reason: 'scan_completed',
		});

		expect(result.changed).toBe(true);
		expect(result.portalPatched).toBe(true);
		expect(riskUpdate).toMatchObject({ risk_bucket: 'HIGH' });

		expect(piFetch).toHaveBeenCalledTimes(1);
		const [path, opts] = piFetch.mock.calls[0];
		expect(path).toBe('/portal/patch');
		expect(opts.jsonBody.risk).toEqual({ bucket: 'HIGH' });
		expect(opts.jsonBody.patch).toBeUndefined();

		expect(stampUpdate).toBeTruthy();
		expect(stampUpdate.portal_last_patched_version).toBe(2);
		expect(stampUpdate.portal_tipset_hash).toBeUndefined();
	});
});
