// __tests__/unit/portalTipResolver.test.js
// Unit tests for utils/portalTipResolver.js — conditional tip resolution + hashing.

const {
	MAX_PORTAL_TIPS,
	MAX_PORTAL_TIP_TEXT_CHARS,
	isOpenEncryption,
	finalizePortalTips,
	computePortalTipsetHash,
	getDetectedPortalCodesForNetwork,
	resolveConditionalPortalTips,
	resolveFinalPortalTipsForNetwork,
} = require('../../utils/portalTipResolver');

function chain({
	defaultResult = { data: null, error: null },
	maybeSingleResult,
	singleResult,
} = {}) {
	const maybeRes = maybeSingleResult ?? defaultResult;
	const singleRes = singleResult ?? defaultResult;

	return {
		select: jest.fn().mockReturnThis(),
		eq: jest.fn().mockReturnThis(),
		is: jest.fn().mockReturnThis(),
		in: jest.fn().mockReturnThis(),
		order: jest.fn().mockReturnThis(),
		limit: jest.fn().mockReturnThis(),
		single: jest.fn().mockResolvedValue(singleRes),
		maybeSingle: jest.fn().mockResolvedValue(maybeRes),
		then: (resolve, reject) => Promise.resolve(defaultResult).then(resolve, reject),
	};
}

function makeSupabase(tableMap = {}) {
	return {
		from: jest.fn((table) => tableMap[table] ?? chain()),
	};
}

describe('portalTipResolver', () => {
	test('isOpenEncryption matches common open values', () => {
		expect(isOpenEncryption('Open')).toBe(true);
		expect(isOpenEncryption(' none ')).toBe(true);
		expect(isOpenEncryption('UNENCRYPTED')).toBe(true);
		expect(isOpenEncryption('wpa2')).toBe(false);
	});

	test('finalizePortalTips dedupes (case-insensitive), sorts, caps, and truncates', () => {
		const long = 'A'.repeat(MAX_PORTAL_TIP_TEXT_CHARS + 50);
		const raw = [
			{ tip_text: 'Use a VPN when possible.', sort_order: 10, is_active: true },
			{ tip_text: 'use a vpn when possible.', sort_order: 1, is_active: true }, // duplicate (case-insensitive)
			{ tip_text: '   ', sort_order: 2, is_active: true }, // blank
			{ tip_text: long, sort_order: '3', is_active: true }, // string sort_order + truncate
		];

		// Add many more tips to force cap
		for (let i = 0; i < 30; i++) {
			raw.push({ tip_text: `Tip ${i}`, sort_order: 100 + i, is_active: true });
		}

		const final = finalizePortalTips(raw);
		expect(final.length).toBe(MAX_PORTAL_TIPS);

		// Deduped — only one VPN tip remains
		const vpnTips = final.filter((t) => t.tip_text.toLowerCase().includes('use a vpn'));
		expect(vpnTips.length).toBe(1);

		// Truncated to max length
		const longTip = final.find((t) => t.tip_text.startsWith('A'));
		expect(longTip.tip_text.length).toBe(MAX_PORTAL_TIP_TEXT_CHARS);

		// Sorted by sort_order then tip_text
		for (let i = 1; i < final.length; i++) {
			expect(final[i].sort_order).toBeGreaterThanOrEqual(final[i - 1].sort_order);
		}
	});

	test('computePortalTipsetHash is deterministic and order-insensitive', () => {
		const a = [
			{ tip_text: 'Alpha', sort_order: 2, is_active: true },
			{ tip_text: 'Bravo', sort_order: 1, is_active: true },
			{ tip_text: 'bravo', sort_order: 99, is_active: true }, // dup by text
		];
		const b = [
			{ tip_text: 'Bravo', sort_order: 1, is_active: true },
			{ tip_text: 'Alpha', sort_order: 2, is_active: true },
		];

		const ha = computePortalTipsetHash(a);
		const hb = computePortalTipsetHash(b);
		expect(ha).toBe(hb);

		const hc = computePortalTipsetHash([
			{ tip_text: 'Bravo', sort_order: 1, is_active: true },
			{ tip_text: 'Charlie', sort_order: 2, is_active: true },
		]);
		expect(hc).not.toBe(ha);
	});

	test('getDetectedPortalCodesForNetwork derives WFVT-001 and merges scan + threat codes', async () => {
		const supabase = makeSupabase({
			networks: chain({
				maybeSingleResult: { data: { encryption_status: 'Open' }, error: null },
			}),
			vulnerability_scans: chain({
				maybeSingleResult: {
					data: {
						scan_id: 'scan-uuid-1',
						finished_at: '2026-02-24T12:00:00.000Z',
						scan_data: {
							findings: {
								encryption: { id: 'WFVT-007', status: 'DETECTED' },
								evil_twin: { id: 'WFVT-002', status: 'CLEARED' },
							},
						},
					},
					error: null,
				},
			}),
			scans: chain({
				maybeSingleResult: { data: { scan_id: 101 }, error: null },
			}),
			vulnerabilities_threat: chain({
				defaultResult: {
					data: [
						{ vt_status: 'DETECTED', detail: { vt_code: 'WFVT-003' } },
						{ vt_status: 'CLEARED', detail: { vt_code: 'WFVT-004' } },
					],
					error: null,
				},
			}),
		});

		const codes = await getDetectedPortalCodesForNetwork(supabase, 'net-1');
		const sorted = [...codes].sort();

		expect(sorted).toEqual(['WFVT-001', 'WFVT-003', 'WFVT-007'].sort());
	});

	test('resolveConditionalPortalTips returns specific tips when codes match', async () => {
		const supabase = makeSupabase({
			networks: chain({
				maybeSingleResult: { data: { encryption_status: 'wpa2' }, error: null },
			}),
			vulnerability_scans: chain({
				maybeSingleResult: {
					data: {
						scan_data: { findings: { x: { id: 'WFVT-005', status: 'DETECTED' } } },
					},
					error: null,
				},
			}),
			scans: chain({
				maybeSingleResult: { data: null, error: null },
			}),
			portal_tips: chain({
				defaultResult: {
					data: [
						{ tip_text: 'Avoid entering passwords on this Wi‑Fi.', sort_order: 2, is_active: true },
						{ tip_text: 'Use HTTPS websites when possible.', sort_order: 1, is_active: true },
					],
					error: null,
				},
			}),
		});

		const resolved = await resolveConditionalPortalTips(supabase, 'net-2');
		expect(resolved).toBeTruthy();
		expect(resolved.usedBaseline).toBe(false);
		expect(resolved.detectedCodes).toContain('WFVT-005');
		expect(resolved.tips).toHaveLength(2);
		expect(resolved.tips[0].sort_order).toBe(1);
		expect(resolved.tipsetHash).toMatch(/^[a-f0-9]{64}$/);
	});

	test('resolveConditionalPortalTips falls back to baseline when no specifics match', async () => {
		const supabase = makeSupabase({
			networks: chain({
				maybeSingleResult: { data: { encryption_status: 'wpa2' }, error: null },
			}),
			vulnerability_scans: chain({
				maybeSingleResult: { data: null, error: null },
			}),
			scans: chain({
				maybeSingleResult: { data: null, error: null },
			}),
			portal_tips: chain({
				defaultResult: {
					data: [
						{ tip_text: 'Keep your device software up to date.', sort_order: 2, is_active: true },
						{ tip_text: 'Use a VPN when possible.', sort_order: 1, is_active: true },
					],
					error: null,
				},
			}),
		});

		const resolved = await resolveConditionalPortalTips(supabase, 'net-3');
		expect(resolved).toBeTruthy();
		expect(resolved.usedBaseline).toBe(true);
		expect(resolved.tips).toHaveLength(2);
		// Sorted
		expect(resolved.tips[0].sort_order).toBe(1);
	});

	test('resolveFinalPortalTipsForNetwork falls back to legacy tips when portal_tips unavailable', async () => {
		// Silence expected warning logs from resolver
		jest.spyOn(console, 'warn').mockImplementation(() => {});

		const supabase = makeSupabase({
			networks: chain({
				maybeSingleResult: { data: { encryption_status: 'Open' }, error: null },
			}),
			vulnerability_scans: chain({
				maybeSingleResult: { data: null, error: null },
			}),
			scans: chain({
				maybeSingleResult: { data: null, error: null },
			}),
			portal_tips: chain({
				defaultResult: {
					data: null,
					error: { message: 'relation "portal_tips" does not exist' },
				},
			}),
			captive_portal: chain({
				maybeSingleResult: { data: { captive_portal_id: 55 }, error: null },
			}),
			captive_portal_tips: chain({
				defaultResult: {
					data: [
						{ tip_text: 'Legacy tip A', sort_order: 2, is_active: true },
						{ tip_text: 'Legacy tip B', sort_order: 1, is_active: true },
					],
					error: null,
				},
			}),
		});

		const resolved = await resolveFinalPortalTipsForNetwork(supabase, 'net-4');
		expect(resolved.source).toBe('captive_portal_tips');
		expect(resolved.tips).toHaveLength(2);
		expect(resolved.tips[0].tip_text).toBe('Legacy tip B');
		expect(resolved.tipsetHash).toMatch(/^[a-f0-9]{64}$/);
	});

	test('resolveFinalPortalTipsForNetwork falls back to hardcoded defaults when no DB tips exist', async () => {
		jest.spyOn(console, 'warn').mockImplementation(() => {});

		const supabase = makeSupabase({
			networks: chain({
				maybeSingleResult: { data: { encryption_status: 'wpa2' }, error: null },
			}),
			vulnerability_scans: chain({
				maybeSingleResult: { data: null, error: null },
			}),
			scans: chain({
				maybeSingleResult: { data: null, error: null },
			}),
			portal_tips: chain({
				defaultResult: { data: [], error: null },
			}),
			captive_portal: chain({
				maybeSingleResult: { data: null, error: null },
			}),
		});

		const resolved = await resolveFinalPortalTipsForNetwork(supabase, 'net-5');
		expect(resolved.source).toBe('defaults');
		expect(resolved.tips.length).toBeGreaterThan(0);
		expect(resolved.usedBaseline).toBe(true);
	});
});
