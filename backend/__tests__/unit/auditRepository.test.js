// __tests__/unit/auditRepository.test.js
// Tests: insertAuditLog validation, getAuditLogs sort whitelist / limit cap / filters

const buildChain = ({ rangeResult, singleResult } = {}) => {
  const rr = rangeResult ?? { data: [], error: null, count: 0 };
  const sr = singleResult ?? { data: { audit_log_id: "new-1" }, error: null };
  // range() must return `this` so chaining can continue after it.
  // The chain is thenable: `await query` calls then() which resolves to rangeResult.
  const chain = {
    select:    jest.fn().mockReturnThis(),
    insert:    jest.fn().mockReturnThis(),
    delete:    jest.fn().mockReturnThis(),
    update:    jest.fn().mockReturnThis(),
    eq:        jest.fn().mockReturnThis(),
    or:        jest.fn().mockReturnThis(),
    not:       jest.fn().mockReturnThis(),
    gte:       jest.fn().mockReturnThis(),
    lte:       jest.fn().mockReturnThis(),
    lt:        jest.fn().mockReturnThis(),
    in:        jest.fn().mockReturnThis(),
    order:     jest.fn().mockReturnThis(),
    limit:     jest.fn().mockReturnThis(),
    range:     jest.fn().mockReturnThis(),
    single:    jest.fn().mockResolvedValue(sr),
    maybeSingle: jest.fn().mockResolvedValue(sr),
    then:      jest.fn((resolve, reject) => Promise.resolve(rr).then(resolve, reject)),
  };
  return chain;
};

const mockDb = { from: jest.fn() };
jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockDb }));

const repo = require("../../repositories/auditRepository");

afterEach(() => jest.clearAllMocks());

// ─── insertAuditLog — validation ─────────────────────────────────

describe("insertAuditLog — required field validation", () => {
  const valid = {
    actor_profile_id: "actor-uuid",
    event_name: "AUTH.LOGIN",
    event_status: "OK",
    entity_type: "AUTH",
  };

  test("throws when actor_profile_id missing", async () => {
    await expect(repo.insertAuditLog({ ...valid, actor_profile_id: undefined }))
      .rejects.toThrow("missing required field 'actor_profile_id'");
  });

  test("throws when event_name missing", async () => {
    await expect(repo.insertAuditLog({ ...valid, event_name: "" }))
      .rejects.toThrow("missing required field 'event_name'");
  });

  test("throws when event_status missing", async () => {
    await expect(repo.insertAuditLog({ ...valid, event_status: "" }))
      .rejects.toThrow("missing required field 'event_status'");
  });

  test("throws when entity_type missing", async () => {
    await expect(repo.insertAuditLog({ ...valid, entity_type: "" }))
      .rejects.toThrow("missing required field 'entity_type'");
  });
});

describe("insertAuditLog — event_status enum", () => {
  const valid = {
    actor_profile_id: "actor-uuid",
    event_name: "AUTH.LOGIN",
    event_status: "OK",
    entity_type: "AUTH",
  };

  test("throws on un-mapped value SUCCESS (callers must pre-map)", async () => {
    await expect(repo.insertAuditLog({ ...valid, event_status: "SUCCESS" }))
      .rejects.toThrow("invalid event_status 'SUCCESS'");
  });

  test("throws on arbitrary string", async () => {
    await expect(repo.insertAuditLog({ ...valid, event_status: "WHATEVER" }))
      .rejects.toThrow("invalid event_status");
  });

  test.each(["OK", "FAIL", "DENY"])("accepts valid enum value: %s", async (status) => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await expect(repo.insertAuditLog({ ...valid, event_status: status })).resolves.toBeDefined();
  });
});

// ─── getAuditLogs — sort whitelist ───────────────────────────────

describe("getAuditLogs — sort whitelist", () => {
  test("unknown sortBy falls back to created_at", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ sortBy: "DROP TABLE users" });
    expect(chain.order).toHaveBeenCalledWith("created_at", expect.any(Object));
  });

  test("known sortBy is passed through", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ sortBy: "event_name" });
    expect(chain.order).toHaveBeenCalledWith("event_name", expect.any(Object));
  });
});

// ─── getAuditLogs — pagination ───────────────────────────────────

describe("getAuditLogs — pagination", () => {
  test("caps limit at 100", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ limit: 9999 });
    // range(offset, offset+safeLimit-1): page=1, limit=100 → range(0, 99)
    expect(chain.range).toHaveBeenCalledWith(0, 99);
  });

  test("page 2 with limit 10 → range(10, 19)", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ page: 2, limit: 10 });
    expect(chain.range).toHaveBeenCalledWith(10, 19);
  });

  test("returns empty data array on empty result", async () => {
    const chain = buildChain({ rangeResult: { data: [], error: null, count: 0 } });
    mockDb.from.mockReturnValue(chain);
    const result = await repo.getAuditLogs();
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── getAuditLogs — filters ──────────────────────────────────────

describe("getAuditLogs — status filter", () => {
  test("status=SUCCESS → filters on event_status=OK", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ status: "SUCCESS" });
    expect(chain.eq).toHaveBeenCalledWith("event_status", "OK");
  });

  test("status=DENIED → filters on event_status=DENY", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ status: "DENIED" });
    expect(chain.eq).toHaveBeenCalledWith("event_status", "DENY");
  });

  test("unknown status → no eq filter applied", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ status: "UNKNOWN_STATUS" });
    // eq should not have been called with event_status
    expect(chain.eq).not.toHaveBeenCalledWith("event_status", expect.anything());
  });
});

describe("getAuditLogs — event category (module) filter", () => {
  test("AUTH → OR clause over AUTH prefix patterns (server-side)", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ eventCategory: "AUTH" });
    expect(chain.or).toHaveBeenCalledWith(
      "event_name.ilike.AUTH%,event_name.ilike.LOGIN%,event_name.ilike.LOGOUT%,event_name.ilike.TOKEN_REFRESH%,event_name.ilike.PASSWORD%"
    );
  });

  test("ACCOUNTS → OR clause on USER prefix", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ eventCategory: "ACCOUNTS" });
    expect(chain.or).toHaveBeenCalledWith("event_name.ilike.USER%");
  });

  test("case-insensitive value is accepted (auth → AUTH)", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ eventCategory: "auth" });
    expect(chain.or).toHaveBeenCalledTimes(1);
  });

  test("GENERAL → NOT ilike for every classified prefix (uncategorized only)", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ eventCategory: "GENERAL" });
    // No positive OR clause; excludes each known prefix instead.
    expect(chain.or).not.toHaveBeenCalled();
    expect(chain.not).toHaveBeenCalledWith("event_name", "ilike", "AUTH%");
    expect(chain.not).toHaveBeenCalledWith("event_name", "ilike", "USER%");
    expect(chain.not).toHaveBeenCalledWith("event_name", "ilike", "SCAN%");
  });

  test("unknown category → no category filter applied", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ eventCategory: "NONSENSE" });
    expect(chain.or).not.toHaveBeenCalled();
    expect(chain.not).not.toHaveBeenCalled();
  });

  test("empty category → no category filter applied", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ eventCategory: "" });
    expect(chain.not).not.toHaveBeenCalled();
  });
});

describe("getAuditLogs — date range", () => {
  test("endDate appends T23:59:59.999Z", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ endDate: "2026-01-31" });
    expect(chain.lte).toHaveBeenCalledWith("created_at", "2026-01-31T23:59:59.999Z");
  });

  test("startDate uses gte", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs({ startDate: "2026-01-01" });
    expect(chain.gte).toHaveBeenCalledWith("created_at", "2026-01-01");
  });

  test("no date filters → gte/lte not called", async () => {
    const chain = buildChain();
    mockDb.from.mockReturnValue(chain);
    await repo.getAuditLogs();
    expect(chain.gte).not.toHaveBeenCalled();
    expect(chain.lte).not.toHaveBeenCalled();
  });
});
