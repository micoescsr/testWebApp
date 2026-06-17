// __tests__/integration/mfaController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn(),
}));

const buildChain = (singleData) => ({
  select: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: singleData, error: null }),
});

const mockListFactors = jest.fn();
const mockDeleteFactor = jest.fn();

const mockAdminClient = {
  from: jest.fn(() => buildChain({ status: "active", role: "superadmin" })),
  auth: {
    admin: {
      mfa: {
        listFactors: mockListFactors,
        deleteFactor: mockDeleteFactor,
      },
    },
  },
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockAdminClient),
}));

jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: {
    from: jest.fn(() => buildChain({ id: "user-1", mfa_enrolled: true })),
  },
}));

const { jwtVerify } = require("jose");
const { logAuditEvent } = require("../../utils/auditLogger");
const { supabaseClient } = require("../../config/supabaseClient");

function mockToken(overrides = {}) {
  jwtVerify.mockResolvedValue({
    payload: {
      sub: overrides.sub || "user-1",
      email: overrides.email || "user@example.com",
      role: "authenticated",
      aud: "authenticated",
      aal: overrides.aal || "aal2",
    },
  });
}

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const mfaRoutes = require("../../routes/mfaRoutes");
  app.use("/api/auth/mfa", mfaRoutes);
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const TARGET_UUID = "11111111-1111-1111-1111-111111111111";

describe("POST /api/auth/mfa/sync-status", () => {
  test("verified factor present → mfa_enrolled true, audit logged, 200", async () => {
    mockToken();
    mockListFactors.mockResolvedValue({
      data: { factors: [{ id: "f1", status: "verified" }] },
      error: null,
    });
    supabaseClient.from.mockReturnValue(buildChain({ id: "user-1", mfa_enrolled: true }));

    const res = await request(app)
      .post("/api/auth/mfa/sync-status")
      .set("Authorization", "Bearer test-token")
      .send({ enrolled: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mfaEnrolled: true });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "USER.MFA_ENROLLED", entityIdUuid: "user-1" })
    );
  });

  test("no verified factors → mfa_enrolled false, audit logged, 200", async () => {
    mockToken();
    mockListFactors.mockResolvedValue({
      data: { factors: [{ id: "f1", status: "unverified" }] },
      error: null,
    });
    supabaseClient.from.mockReturnValue(buildChain({ id: "user-1", mfa_enrolled: false }));

    const res = await request(app)
      .post("/api/auth/mfa/sync-status")
      .set("Authorization", "Bearer test-token")
      .send({ enrolled: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mfaEnrolled: false });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "USER.MFA_UNENROLLED", entityIdUuid: "user-1" })
    );
  });

  test("does not require AAL2 — aal1 token still succeeds", async () => {
    mockToken({ aal: "aal1" });
    mockListFactors.mockResolvedValue({ data: { factors: [] }, error: null });
    supabaseClient.from.mockReturnValue(buildChain({ id: "user-1", mfa_enrolled: false }));

    const res = await request(app)
      .post("/api/auth/mfa/sync-status")
      .set("Authorization", "Bearer test-token")
      .send({ enrolled: false });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/mfa/admin-unenroll/:id", () => {
  test("non-superadmin → 403", async () => {
    mockToken();
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "admin" }));

    const res = await request(app)
      .post(`/api/auth/mfa/admin-unenroll/${TARGET_UUID}`)
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(403);
  });

  test("superadmin with aal1 token → 403 MFA_REQUIRED (requireAAL2 wired before controller)", async () => {
    mockToken({ aal: "aal1" });
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "superadmin" }));

    const res = await request(app)
      .post(`/api/auth/mfa/admin-unenroll/${TARGET_UUID}`)
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MFA_REQUIRED");
    expect(mockListFactors).not.toHaveBeenCalled();
  });

  test("superadmin with aal2 token → 200, factors deleted, mfa_enrolled=false, USER.MFA_RESET audit", async () => {
    mockToken();
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "superadmin" }));
    mockListFactors.mockResolvedValue({
      data: { factors: [{ id: "f1", status: "verified" }, { id: "f2", status: "unverified" }] },
      error: null,
    });
    mockDeleteFactor.mockResolvedValue({ data: {}, error: null });
    supabaseClient.from.mockReturnValue(buildChain({ id: TARGET_UUID, mfa_enrolled: false }));

    const res = await request(app)
      .post(`/api/auth/mfa/admin-unenroll/${TARGET_UUID}`)
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      message: "MFA factors removed. User must re-enroll on next login.",
    });
    expect(mockDeleteFactor).toHaveBeenCalledTimes(2);
    expect(mockDeleteFactor).toHaveBeenCalledWith({ userId: TARGET_UUID, id: "f1" });
    expect(mockDeleteFactor).toHaveBeenCalledWith({ userId: TARGET_UUID, id: "f2" });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "USER.MFA_RESET", entityIdUuid: TARGET_UUID })
    );
  });

  test("invalid UUID → 400", async () => {
    mockToken();
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "superadmin" }));

    const res = await request(app)
      .post("/api/auth/mfa/admin-unenroll/not-a-uuid")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(400);
  });
});
