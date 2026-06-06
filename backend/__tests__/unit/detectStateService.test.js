// __tests__/unit/detectStateService.test.js
// Tests: startOrSwitch scan_id validation, ensureRow, getStatusAndMaybeFail heartbeat

jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/piFetch", () => ({ piFetch: jest.fn() }));
jest.mock("../../utils/riskPipeline", () => ({
  bucketize: jest.fn().mockReturnValue("LOW"),
  updateNetworkRisk: jest.fn().mockResolvedValue({ changed: false }),
}));
jest.mock("../../utils/scoring", () => ({ computeRiskScore: jest.fn().mockReturnValue(0) }));

const mockDb = {
  from: jest.fn(),
  rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
};
jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockDb }));

const service = require("../../services/detectStateService");

afterEach(() => jest.clearAllMocks());

const NETWORK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const now = () => new Date().toISOString();

const buildRow = (overrides = {}) => ({
  device_id: 1,
  status: "STOPPED",
  active_network_id: null,
  active_scan_id: null,
  started_by_profile_id: null,
  started_at: null,
  stopped_at: null,
  last_heartbeat_at: now(),
  failure_reason: null,
  updated_at: now(),
  ...overrides,
});

const makeSelectChain = (data) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  single: jest.fn().mockResolvedValue({ data, error: null }),
});

const makeUpdateChain = (data) => ({
  update: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  then: jest.fn((fn) => fn({ data, error: null })),
});

// ─── startOrSwitch — scan_id validation ──────────────────────────

describe("startOrSwitch — scan_id validation", () => {
  beforeEach(() => {
    mockDb.from.mockReturnValue(makeSelectChain(buildRow()));
  });

  test("throws when scan_id is a UUID string", async () => {
    await expect(
      service.startOrSwitch({}, "actor-uuid", NETWORK_ID, "11111111-1111-1111-1111-111111111111")
    ).rejects.toThrow("scan_id must be a positive number");
  });

  test("throws when scan_id is 0", async () => {
    await expect(
      service.startOrSwitch({}, "actor-uuid", NETWORK_ID, 0)
    ).rejects.toThrow("scan_id must be a positive number");
  });

  test("throws when scan_id is negative", async () => {
    await expect(
      service.startOrSwitch({}, "actor-uuid", NETWORK_ID, -5)
    ).rejects.toThrow("scan_id must be a positive number");
  });

  test("throws when scan_id is NaN", async () => {
    await expect(
      service.startOrSwitch({}, "actor-uuid", NETWORK_ID, NaN)
    ).rejects.toThrow("scan_id must be a positive number");
  });

  test("throws when scan_id is a non-numeric string", async () => {
    await expect(
      service.startOrSwitch({}, "actor-uuid", NETWORK_ID, "not-a-number")
    ).rejects.toThrow("scan_id must be a positive number");
  });
});

// ─── ensureRow ────────────────────────────────────────────────────

describe("ensureRow", () => {
  test("returns existing row when found", async () => {
    const existing = buildRow({ status: "STOPPED" });
    mockDb.from.mockReturnValue(makeSelectChain(existing));

    const result = await service.ensureRow();
    expect(result).toEqual(existing);
  });

  test("inserts new row when none found", async () => {
    const newRow = buildRow({ status: "STOPPED" });
    let call = 0;
    mockDb.from.mockImplementation(() => {
      call++;
      if (call === 1) {
        // fetchRow → null
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      // insert call
      return {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: newRow, error: null }),
      };
    });

    const result = await service.ensureRow();
    expect(result).toEqual(newRow);
  });

  test("handles race condition (23505 duplicate insert) by re-fetching", async () => {
    const existing = buildRow({ status: "STOPPED" });
    let call = 0;
    mockDb.from.mockImplementation(() => {
      call++;
      if (call === 1) {
        // fetchRow → null
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (call === 2) {
        // insert → 23505 unique violation
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: { code: "23505" } }),
        };
      }
      // re-fetch after race
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
      };
    });

    const result = await service.ensureRow();
    expect(result).toEqual(existing);
  });
});

// ─── getStatusAndMaybeFail ────────────────────────────────────────

describe("getStatusAndMaybeFail — heartbeat timeout", () => {
  test("RUNNING with fresh heartbeat → returns row unchanged", async () => {
    const row = buildRow({ status: "RUNNING", last_heartbeat_at: now() });
    mockDb.from.mockReturnValue(makeSelectChain(row));

    const result = await service.getStatusAndMaybeFail(null);
    expect(result.status).toBe("RUNNING");
  });

  test("STOPPED → returned as-is (no DB calls after ensureRow)", async () => {
    const row = buildRow({ status: "STOPPED" });
    mockDb.from.mockReturnValue(makeSelectChain(row));

    const result = await service.getStatusAndMaybeFail(null);
    expect(result.status).toBe("STOPPED");
  });

  test("RUNNING with stale heartbeat → lockedUpdate called to mark FAILED", async () => {
    const staleTs = new Date(Date.now() - 60_000).toISOString();
    // active_scan_id: null skips the finalization block (rpc + scan_end update)
    // so this test stays focused on the status transition only.
    const runningRow = buildRow({
      status: "RUNNING",
      last_heartbeat_at: staleTs,
      started_by_profile_id: null,
      active_scan_id: null,
      active_network_id: NETWORK_ID,
      updated_at: staleTs,
    });
    const failedRow = { ...runningRow, status: "FAILED", failure_reason: "heartbeat timeout" };

    let call = 0;
    mockDb.from.mockImplementation((table) => {
      call++;
      if (call === 1) {
        // ensureRow → fetchRow returns RUNNING row
        return makeSelectChain(runningRow);
      }
      if (table === "detection_state") {
        // lockedUpdate → returns failed row
        return makeUpdateChain(failedRow);
      }
      // Any further DB calls (scan update, rpc, etc.)
      return {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: jest.fn((fn) => fn({ data: null, error: null })),
      };
    });
    mockDb.rpc = jest.fn().mockResolvedValue({ data: 0, error: null });

    const result = await service.getStatusAndMaybeFail(null);
    expect(result.status).toBe("FAILED");
  });
});
