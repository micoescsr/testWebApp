// __tests__/unit/auditLogger.test.js
// Tests: normalizeEventName (pure), logAuditEvent (silent catch, status mapping, IP stripping)

const mockInsert = jest.fn();
jest.mock("../../repositories/auditRepository", () => ({
  insertAuditLog: mockInsert,
}));

const { logAuditEvent, normalizeEventName } = require("../../utils/auditLogger");

afterEach(() => jest.clearAllMocks());

// ─── normalizeEventName ───────────────────────────────────────────

describe("normalizeEventName", () => {
  test("null → UNKNOWN", () => expect(normalizeEventName(null)).toBe("UNKNOWN"));
  test("undefined → UNKNOWN", () => expect(normalizeEventName(undefined)).toBe("UNKNOWN"));
  test("empty string → UNKNOWN", () => expect(normalizeEventName("")).toBe("UNKNOWN"));

  test.each([
    ["LOGIN_SUCCESS",   "AUTH.LOGIN"],
    ["SCAN_TRIGGER",    "SCAN.START"],
    ["USER_DELETE",     "USER.DELETE"],
    ["DETECTION_STOP",  "DETECTION.STOP"],
    ["PORTAL_PATCH",    "PORTAL.SYNC"],
  ])("migrates %s → %s", (input, expected) => {
    expect(normalizeEventName(input)).toBe(expected);
  });

  test("already dot-notation returned uppercased", () => {
    expect(normalizeEventName("auth.login")).toBe("AUTH.LOGIN");
    expect(normalizeEventName("DETECTION.STOP")).toBe("DETECTION.STOP");
  });

  test("unknown name returned uppercased", () => {
    expect(normalizeEventName("my_custom_event")).toBe("MY_CUSTOM_EVENT");
  });
});

// ─── logAuditEvent ────────────────────────────────────────────────

const mockReq = {
  headers: { "x-forwarded-for": "10.0.0.1", "user-agent": "TestAgent/1.0" },
  requestId: "req-test-123",
};

describe("logAuditEvent — status mapping", () => {
  beforeEach(() => mockInsert.mockResolvedValue({}));

  test.each([
    ["SUCCESS", "OK"],
    ["OK",      "OK"],
    ["FAILED",  "FAIL"],
    ["FAIL",    "FAIL"],
    ["DENIED",  "DENY"],
    ["DENY",    "DENY"],
  ])("eventStatus %s → DB enum %s", async (input, expected) => {
    await logAuditEvent({ req: mockReq, actorId: "a", eventName: "AUTH.LOGIN", eventStatus: input, entityType: "AUTH" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ event_status: expected }));
  });

  test("unknown eventStatus → FAIL fallback", async () => {
    await logAuditEvent({ req: mockReq, actorId: "a", eventName: "AUTH.LOGIN", eventStatus: "BAD_STATUS", entityType: "AUTH" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ event_status: "FAIL" }));
  });
});

describe("logAuditEvent — actorId guard", () => {
  test("skips and does not throw when actorId is null", async () => {
    await expect(
      logAuditEvent({ req: mockReq, actorId: null, eventName: "AUTH.LOGIN", eventStatus: "SUCCESS", entityType: "AUTH" })
    ).resolves.toBeUndefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test("skips when actorId is empty string", async () => {
    await expect(
      logAuditEvent({ req: mockReq, actorId: "", eventName: "AUTH.LOGIN", eventStatus: "SUCCESS", entityType: "AUTH" })
    ).resolves.toBeUndefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("logAuditEvent — silent catch", () => {
  test("DB error never throws back to caller", async () => {
    mockInsert.mockRejectedValueOnce(new Error("DB offline"));
    await expect(
      logAuditEvent({ req: mockReq, actorId: "a", eventName: "AUTH.LOGIN", eventStatus: "SUCCESS", entityType: "AUTH" })
    ).resolves.toBeUndefined();
  });
});

describe("logAuditEvent — request context", () => {
  beforeEach(() => mockInsert.mockResolvedValue({}));

  test("extracts first IP from x-forwarded-for", async () => {
    await logAuditEvent({ req: mockReq, actorId: "a", eventName: "AUTH.LOGIN", eventStatus: "OK", entityType: "AUTH" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ actor_ip: "10.0.0.1" }));
  });

  test("strips ::ffff: IPv6-mapped prefix", async () => {
    const req = { headers: { "x-forwarded-for": "::ffff:192.168.1.1" }, requestId: null };
    await logAuditEvent({ req, actorId: "a", eventName: "AUTH.LOGIN", eventStatus: "OK", entityType: "AUTH" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ actor_ip: "192.168.1.1" }));
  });

  test("passes user-agent and request_id", async () => {
    await logAuditEvent({ req: mockReq, actorId: "a", eventName: "AUTH.LOGIN", eventStatus: "OK", entityType: "AUTH" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_agent: "TestAgent/1.0",
      request_id: "req-test-123",
    }));
  });

  test("normalizes event name (legacy migration)", async () => {
    await logAuditEvent({ req: mockReq, actorId: "a", eventName: "LOGIN_SUCCESS", eventStatus: "OK", entityType: "AUTH" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ event_name: "AUTH.LOGIN" }));
  });
});

describe("logAuditEvent — entity ID logic", () => {
  beforeEach(() => mockInsert.mockResolvedValue({}));

  test("entity_id_uuid falls back to actorId when neither ID supplied", async () => {
    await logAuditEvent({ req: mockReq, actorId: "actor-uuid", eventName: "AUTH.LOGIN", eventStatus: "OK", entityType: "AUTH" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ entity_id_uuid: "actor-uuid" }));
  });

  test("explicit entityIdUuid is used when provided", async () => {
    await logAuditEvent({ req: mockReq, actorId: "actor-uuid", eventName: "AUTH.LOGIN", eventStatus: "OK", entityType: "AUTH", entityIdUuid: "target-uuid" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ entity_id_uuid: "target-uuid" }));
  });

  test("entityIdBigint present → entity_id_uuid is null", async () => {
    await logAuditEvent({ req: mockReq, actorId: "actor-uuid", eventName: "SCAN.START", eventStatus: "OK", entityType: "SCAN", entityIdBigint: 42 });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ entity_id_uuid: null, entity_id_bigint: 42 }));
  });
});
