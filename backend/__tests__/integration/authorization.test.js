// __tests__/integration/authorization.test.js
// Integration tests for authorization checks.
// Verifies role-based access control: non-admin → 403, admin → 200.

const request = require("supertest");
const { createTestApp } = require("../helpers/testApp");

// ── Configurable jose mock ──────────────────────────────────────────────────
// We override jwtVerify per-test to return different roles.
// Variable MUST be prefixed with "mock" so Jest allows it inside jest.mock().

const mockJoseModule = {
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn(),
};

jest.mock("jose", () => mockJoseModule);

// Mock @supabase/supabase-js so statusMiddleware.js's createClient returns a mock.
// This is separate from config/supabaseClient.js.
const mockSupabaseAdmin = {
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
  })),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabaseAdmin),
}));

// Mock Supabase client (required by middleware/routes)
jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      ilike: jest.fn().mockReturnThis(),
    })),
  },
}));

let app;
beforeAll(() => {
  app = createTestApp();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockUserToken(overrides = {}) {
  mockJoseModule.jwtVerify.mockResolvedValue({
    payload: {
      sub: overrides.id || "user-123",
      email: overrides.email || "user@example.com",
      role: overrides.role || "authenticated",
      aud: "authenticated",
    },
  });
}

// ─── A. Non-admin calling admin endpoint → 403 ─────────────────────────────

describe("Authorization — role-based access", () => {
  test("non-admin user receives 403 from admin endpoint", async () => {
    mockUserToken({ role: "authenticated" }); // regular user

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", "Bearer regular-user-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Superadmin");
  });

  test("superadmin user receives 200 from admin endpoint", async () => {
    mockUserToken({ role: "superadmin" });

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", "Bearer admin-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("users");
  });

  test("admin user (non-superadmin) receives 403 from admin endpoint", async () => {
    mockUserToken({ role: "admin" });

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", "Bearer admin-role-token");

    expect(res.status).toBe(403);
  });
});

// ─── B. Missing / invalid token → 401 ──────────────────────────────────────

describe("Authorization — authentication required", () => {
  test("missing Authorization header returns 401", async () => {
    // jwtVerify won't be called — middleware catches missing header
    const res = await request(app).get("/api/protected");

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Missing token");
  });

  test("malformed Bearer token returns 401", async () => {
    mockJoseModule.jwtVerify.mockRejectedValueOnce(new Error("Invalid token"));

    const res = await request(app)
      .get("/api/protected")
      .set("Authorization", "Bearer invalid-garbage");

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid");
  });

  test("expired token returns 401", async () => {
    const err = new Error("Token expired");
    err.code = "ERR_JWT_EXPIRED";
    mockJoseModule.jwtVerify.mockRejectedValueOnce(err);

    const res = await request(app)
      .get("/api/protected")
      .set("Authorization", "Bearer expired-token");

    expect(res.status).toBe(401);
  });
});

// ─── C. Protected + active profile check ────────────────────────────────────

describe("Authorization — active profile middleware", () => {
  test("active user accesses protected/active route", async () => {
    mockUserToken({ role: "authenticated" });

    // statusMiddleware uses its own supabaseAdmin (from @supabase/supabase-js)
    mockSupabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { status: "active" },
        error: null,
      }),
    });

    const res = await request(app)
      .get("/api/protected/active")
      .set("Authorization", "Bearer active-user-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("on_hold user receives 403 from active-only route", async () => {
    mockUserToken({ role: "authenticated" });

    mockSupabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { status: "on_hold" },
        error: null,
      }),
    });

    const res = await request(app)
      .get("/api/protected/active")
      .set("Authorization", "Bearer onhold-user-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("not active");
    expect(res.body.status).toBe("on_hold");
  });

  test("inactive user receives 403", async () => {
    mockUserToken({ role: "authenticated" });

    mockSupabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { status: "inactive" },
        error: null,
      }),
    });

    const res = await request(app)
      .get("/api/protected/active")
      .set("Authorization", "Bearer inactive-user-token");

    expect(res.status).toBe(403);
  });
});

// ─── D. AAL2 (MFA) enforcement ──────────────────────────────────────────────

describe("Authorization — AAL2 (MFA) enforcement", () => {
  function mockUserTokenWithAal(aal) {
    mockJoseModule.jwtVerify.mockResolvedValue({
      payload: {
        sub: "user-123",
        email: "user@example.com",
        role: "authenticated",
        aud: "authenticated",
        aal,
      },
    });
  }

  // A prior describe block's test ("inactive user receives 403") leaves
  // mockSupabaseAdmin.from returning an inactive-status chain — mockReturnValue
  // persists across afterEach's clearAllMocks(). Reset to active so authJWT's
  // own inline status check (and requireActiveProfile, if a route adds it)
  // don't 403 before requireAAL2 ever runs.
  beforeEach(() => {
    mockSupabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
    });
  });

  test("aal1 token on AAL2-gated route → 403 MFA_REQUIRED", async () => {
    mockUserTokenWithAal("aal1");

    const res = await request(app)
      .get("/api/protected/aal2")
      .set("Authorization", "Bearer aal1-token");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MFA_REQUIRED");
  });

  test("missing aal claim on AAL2-gated route → 403 MFA_REQUIRED", async () => {
    mockJoseModule.jwtVerify.mockResolvedValue({
      payload: { sub: "user-123", email: "user@example.com", role: "authenticated", aud: "authenticated" },
    });

    const res = await request(app)
      .get("/api/protected/aal2")
      .set("Authorization", "Bearer no-aal-token");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MFA_REQUIRED");
  });

  test("aal2 token on AAL2-gated route → 200", async () => {
    mockUserTokenWithAal("aal2");

    const res = await request(app)
      .get("/api/protected/aal2")
      .set("Authorization", "Bearer aal2-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
