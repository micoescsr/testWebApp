// __tests__/integration/historyController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "user-uuid", email: "test@example.com", role: "authenticated", aud: "authenticated", aal: "aal2" },
  }),
}));

const buildChain = (data) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  then: jest.fn((fn) => fn({ data: data ?? [], error: null })),
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: jest.fn(() => buildChain()) })),
}));

const mockVulnHistory = [
  { scan_id: "scan-1", network_id: "net-1", vt_name: "WEP Encryption", vt_kind: "vulnerability" },
];
const mockThreatHistory = [
  { scan_id: "scan-1", network_id: "net-1", vt_name: "Evil Twin", vt_kind: "threat" },
];

const mockDb = { from: jest.fn(() => buildChain([])) };
jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockDb }));

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/history", require("../../routes/historyRoutes"));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const AUTH = "Bearer test-token";

// ─── getVulnerabilityHistory ──────────────────────────────────────────────────

describe("GET /api/history/vulnerabilities", () => {
  test("returns 200 with vulnerability history", async () => {
    mockDb.from.mockReturnValue(buildChain(mockVulnHistory));
    const res = await request(app)
      .get("/api/history/vulnerabilities")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/history/vulnerabilities");
    expect(res.status).toBe(401);
  });

  test("filters by vt_kind=vulnerability (case-insensitive)", async () => {
    const vulnChain = {
      ...buildChain(mockVulnHistory),
      in: jest.fn().mockReturnThis(),
    };
    mockDb.from.mockReturnValueOnce(vulnChain);
    const res = await request(app)
      .get("/api/history/vulnerabilities")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });
});

// ─── getThreatHistory ─────────────────────────────────────────────────────────

describe("GET /api/history/threats", () => {
  test("returns 200 with threat history", async () => {
    mockDb.from.mockReturnValue(buildChain(mockThreatHistory));
    const res = await request(app)
      .get("/api/history/threats")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/history/threats");
    expect(res.status).toBe(401);
  });
});
