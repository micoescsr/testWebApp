// __tests__/integration/auth.test.js
// Integration tests for the auth & session flow.
// Uses supertest.agent() for cookie persistence across requests.
//
// Strategy: Mock global.fetch to simulate Supabase REST responses.
// The real Express middleware stack (cookieParser, JSON, CORS) runs.

const request = require("supertest");
const { createTestApp } = require("../helpers/testApp");

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock jose so authJWT middleware accepts any Bearer token in tests.
jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: "user-123",
      email: "test@example.com",
      role: "authenticated",
      aud: "authenticated",
    },
  }),
}));

// Mock @supabase/supabase-js so authJWT profile status lookup works
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: { status: "active" },
            error: null,
          }),
        })),
      })),
    })),
  })),
}));

// Mock the supabaseClient module (used by some routes)
jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// We need a fresh app per test suite because middleware keeps state.
let app;
beforeAll(() => {
  app = createTestApp();
});

// ── Helper: mock global.fetch responses for Supabase auth ───────────────────

const supabaseLoginSuccess = {
  access_token: "test-access-token-abc123",
  refresh_token: "test-refresh-token-xyz789",
  expires_in: 3600,
  user: { id: "user-123", email: "test@example.com" },
};

const supabaseLoginFailure = {
  error: "invalid_grant",
  error_description: "Invalid login credentials",
};

const supabaseRefreshSuccess = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  expires_in: 3600,
};

// ─── A. Auth & Session Flow (supertest.agent) ───────────────────────────────

describe("POST /api/auth/login", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns 200 with token on valid credentials", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(supabaseLoginSuccess),
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token", "test-access-token-abc123");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe("test@example.com");
  });

  test("returns 401 on invalid credentials", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve(supabaseLoginFailure),
    });

    const res = await request(app)
      .post("/api/auth/login")
		.send({ email: "bad@example.com", password: "wrongpw" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toContain("Invalid");
  });

  test("returns 400 when email or password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({});

    expect(res.status).toBe(400);
		expect(Array.isArray(res.body.errors)).toBe(true);
		expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

describe("POST /api/auth/set-refresh", () => {
  afterEach(() => jest.restoreAllMocks());

  test("sets HttpOnly cookie on valid refresh_token", async () => {
    const res = await request(app)
      .post("/api/auth/set-refresh")
      .send({ refresh_token: "test-refresh-token" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify Set-Cookie header
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    expect(cookieStr).toContain("sb_refresh");
    expect(cookieStr.toLowerCase()).toContain("httponly");
  });

  test("returns 400 when refresh_token is missing", async () => {
    const res = await request(app)
      .post("/api/auth/set-refresh")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing");
  });
});

describe("POST /api/auth/refresh", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns new access_token when valid cookie present", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(supabaseRefreshSuccess),
    });

    // Use agent to persist cookies across requests
    const agent = request.agent(app);

    // First: set the refresh cookie
    await agent
      .post("/api/auth/set-refresh")
      .send({ refresh_token: "initial-refresh-token" });

    // Then: refresh using the cookie
    const res = await agent.post("/api/auth/refresh");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("access_token", "new-access-token");
    expect(res.body).toHaveProperty("expires_in", 3600);

    // Should also rotate the refresh cookie
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
  });

  test("returns 401 without refresh cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("No refresh cookie");
  });
});

describe("POST /api/auth/logout", () => {
  test("clears refresh cookie", async () => {
    const agent = request.agent(app);

    // Set cookie first
    await agent
      .post("/api/auth/set-refresh")
      .send({ refresh_token: "token-to-clear" });

    // Logout
    const res = await agent.post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Cookie should be cleared (Set-Cookie with past expiry)
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    // Cleared cookies have Expires in the past or Max-Age=0
    expect(
      cookieStr.includes("Expires=Thu, 01 Jan 1970") ||
      cookieStr.includes("expires=Thu, 01 Jan 1970") ||
      cookieStr.toLowerCase().includes("max-age=0")
    ).toBe(true);
  });
});

// ─── B. Protected route access ──────────────────────────────────────────────

describe("GET /api/protected", () => {
  test("returns 401 without Authorization header", async () => {
    // Middleware checks for Bearer header before calling jwtVerify
    // so no mock override needed — missing header → 401 directly.
    const res = await request(app).get("/api/protected");

    expect(res.status).toBe(401);
  });

  test("returns 200 with valid Bearer token", async () => {
    // Default jose mock (top of file) returns valid payload.
    const res = await request(app)
      .get("/api/protected")
      .set("Authorization", "Bearer valid-test-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toHaveProperty("id", "user-123");
  });
});
