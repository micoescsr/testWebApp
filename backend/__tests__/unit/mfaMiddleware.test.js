// __tests__/unit/mfaMiddleware.test.js
// Tests: requireAAL2 — allows aal2, denies aal1/undefined with 403 + audit log

const mockLogAuditEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("../../utils/auditLogger", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

const { requireAAL2 } = require("../../middleware/mfaMiddleware");

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

afterEach(() => jest.clearAllMocks());

describe("requireAAL2", () => {
  test("aal2 → calls next(), no response, no audit log", async () => {
    const req = { user: { id: "user-1", aal: "aal2" }, originalUrl: "/api/x" };
    const res = makeRes();
    const next = jest.fn();

    await requireAAL2(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  test("aal1 → 403 MFA_REQUIRED, next NOT called, audit log denial recorded", async () => {
    const req = { user: { id: "user-1", aal: "aal1" }, originalUrl: "/api/x" };
    const res = makeRes();
    const next = jest.fn();

    await requireAAL2(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "This action requires multi-factor authentication (AAL2).",
      code: "MFA_REQUIRED",
    });
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        actorId: "user-1",
        eventName: "AUTHORIZATION.DENIED",
        eventStatus: "DENIED",
        entityType: "AUTH",
        entityIdUuid: "user-1",
        meta: expect.objectContaining({ reason: "aal_insufficient" }),
      })
    );
  });

  test("undefined aal → same 403 denial behavior as aal1", async () => {
    const req = { user: { id: "user-2" }, originalUrl: "/api/y" };
    const res = makeRes();
    const next = jest.fn();

    await requireAAL2(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "MFA_REQUIRED" })
    );
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "user-2", eventName: "AUTHORIZATION.DENIED" })
    );
  });

  test("req.user undefined → 403 denial, audit log attempted with undefined actorId", async () => {
    const req = { originalUrl: "/api/z" };
    const res = makeRes();
    const next = jest.fn();

    await requireAAL2(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: undefined, eventName: "AUTHORIZATION.DENIED" })
    );
  });

  test("audit log failure does not block the 403 response", async () => {
    mockLogAuditEvent.mockRejectedValueOnce(new Error("db down"));
    const req = { user: { id: "user-3", aal: "aal1" }, originalUrl: "/api/x" };
    const res = makeRes();
    const next = jest.fn();

    await requireAAL2(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
