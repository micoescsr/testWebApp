// __tests__/integration/userController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "superadmin-uuid", email: "admin@example.com", role: "authenticated", aud: "authenticated" },
  }),
}));

const mockProfile = {
  id: "target-uuid-1111-1111-1111-111111111111",
  first_name: "Jane",
  last_name: "Doe",
  username: "janedoe",
  email: "jane@example.com",
  role: "admin",
  status: "active",
  must_change_password: false,
  temp_expires_at: null,
};

const buildChain = (singleData) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: singleData, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: singleData, error: null }),
  then: jest.fn((fn) => fn({ data: [singleData], error: null })),
});

const mockAdminClient = {
  from: jest.fn(() => buildChain({ status: "active", role: "superadmin" })),
  auth: {
    admin: {
      updateUserById: jest.fn().mockResolvedValue({ error: null }),
      deleteUser: jest.fn().mockResolvedValue({ error: null }),
    },
  },
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockAdminClient),
}));

const mockSupabaseClient = {
  from: jest.fn(() => buildChain({ ...mockProfile, role: "superadmin", status: "active" })),
};
jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockSupabaseClient }));

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const webAppRoutes = require("../../routes/webAppRoutes");
  app.use("/api/webapp", webAppRoutes);
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const AUTH = "Bearer test-token";
const TARGET_UUID = "11111111-1111-1111-1111-111111111111";
const SELF_UUID = "superadmin-uuid";

// ─── getCurrentProfile ────────────────────────────────────────────────────────

describe("GET /api/webapp/users/profiles/me — getCurrentProfile", () => {
  test("returns profile for authenticated user", async () => {
    mockSupabaseClient.from.mockReturnValueOnce(buildChain({ status: "active" }));
    mockSupabaseClient.from.mockReturnValueOnce(buildChain({ ...mockProfile }));
    const res = await request(app)
      .get("/api/webapp/users/profiles/me")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });

  test("returns 401 without Authorization", async () => {
    const res = await request(app).get("/api/webapp/users/profiles/me");
    expect(res.status).toBe(401);
  });
});

// ─── getAllUsers ──────────────────────────────────────────────────────────────

describe("GET /api/webapp/users/profiles — getAllUsers", () => {
  test("superadmin gets 200 with user list", async () => {
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "superadmin" }));
    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [mockProfile], error: null }),
    });
    const res = await request(app)
      .get("/api/webapp/users/profiles")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });

  test("non-superadmin gets 403", async () => {
    // authJWT + requireActiveProfile each call from("profiles") for status check,
    // then getAllUsers.getCurrentUserRole calls it for role check.
    mockAdminClient.from.mockReset();
    mockAdminClient.from
      .mockImplementationOnce(() => buildChain({ status: "active" })) // authJWT
      .mockImplementationOnce(() => buildChain({ status: "active" })) // requireActiveProfile
      .mockImplementationOnce(() => buildChain({ role: "admin" }));   // getCurrentUserRole
    const res = await request(app)
      .get("/api/webapp/users/profiles")
      .set("Authorization", AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Superadmin");
  });
});

// ─── deleteUser ───────────────────────────────────────────────────────────────

describe("DELETE /api/webapp/users/profiles/:id — deleteUser", () => {
  test("superadmin deletes another user → 200", async () => {
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "superadmin" }));
    mockSupabaseClient.from.mockReturnValue(buildChain({ ...mockProfile }));
    const res = await request(app)
      .delete(`/api/webapp/users/profiles/${TARGET_UUID}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deleted");
  });

  test("self-deletion returns 403", async () => {
    const { jwtVerify } = require("jose");
    jwtVerify.mockResolvedValueOnce({
      payload: { sub: TARGET_UUID, email: "self@test.com", role: "authenticated", aud: "authenticated" },
    });
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "superadmin" }));
    const res = await request(app)
      .delete(`/api/webapp/users/profiles/${TARGET_UUID}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Cannot delete your own account");
  });

  test("returns 400 on invalid UUID", async () => {
    const res = await request(app)
      .delete("/api/webapp/users/profiles/not-a-uuid")
      .set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_UUID");
  });
});

// ─── reactivateUser ───────────────────────────────────────────────────────────

describe("POST /api/webapp/users/profiles/:id/reactivate — reactivateUser", () => {
  test("returns 400 when target account is not inactive", async () => {
    mockAdminClient.from.mockReturnValue(buildChain({ status: "active", role: "superadmin" }));
    mockSupabaseClient.from.mockReturnValue(buildChain({ ...mockProfile, status: "active" }));
    const res = await request(app)
      .post(`/api/webapp/users/profiles/${TARGET_UUID}/reactivate`)
      .set("Authorization", AUTH)
      .send({ targetStatus: "active" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not inactive");
  });

  test("returns 400 (VALIDATION_ERROR) for invalid targetStatus", async () => {
    const res = await request(app)
      .post(`/api/webapp/users/profiles/${TARGET_UUID}/reactivate`)
      .set("Authorization", AUTH)
      .send({ targetStatus: "unknown_status" });
    expect(res.status).toBe(400);
    // Validator catches invalid targetStatus before controller runs
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});
