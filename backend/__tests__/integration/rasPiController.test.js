// __tests__/integration/rasPiController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("../../utils/piFetch", () => ({ piFetch: jest.fn() }));
jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/detectStateService", () => ({
  startOrSwitch: jest.fn().mockResolvedValue({}),
  ensureRow: jest.fn().mockResolvedValue({}),
  startServerHeartbeatLoop: jest.fn(),
  getStatusAndMaybeFail: jest.fn().mockResolvedValue({ status: "IDLE" }),
  heartbeat: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../utils/riskPipeline", () => ({
  onScanCompleted: jest.fn().mockResolvedValue(undefined),
  bucketize: jest.fn().mockReturnValue("LOW"),
  updateNetworkRisk: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "user-uuid-1111", email: "test@example.com", role: "authenticated", aud: "authenticated" },
  }),
}));

const mockChainFactory = (overrides = {}) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
  single: jest.fn().mockResolvedValue(overrides.single ?? { data: { status: "active" }, error: null }),
  maybeSingle: jest.fn().mockResolvedValue(overrides.maybeSingle ?? { data: null, error: null }),
  then: jest.fn((fn) => fn(overrides.thenResult ?? { data: [], error: null })),
});

const mockAdminChain = mockChainFactory({ single: { data: { status: "active" }, error: null } });

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: jest.fn(() => mockAdminChain) })),
}));

const mockDbChain = mockChainFactory({ single: { data: { network_id: "net-id-1" }, error: null } });
const mockDb = { from: jest.fn(() => mockDbChain), rpc: jest.fn().mockResolvedValue({ data: 50, error: null }) };

jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockDb }));

const { piFetch } = require("../../utils/piFetch");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/rasPi", require("../../routes/rasPiRoutes"));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const AUTH = "Bearer test-token";

// ─── triggerScan ─────────────────────────────────────────────────────────────

describe("POST /api/rasPi/scan — triggerScan", () => {
  test("returns 400 when ssid/bssid/channel missing", async () => {
    const res = await request(app)
      .post("/api/rasPi/scan")
      .set("Authorization", AUTH)
      .send({ ssid: "TestNet" });
    expect(res.status).toBe(400);
  });

  test("proxies Pi response on success", async () => {
    piFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { result: "ok" } });
    const res = await request(app)
      .post("/api/rasPi/scan")
      .set("Authorization", AUTH)
      .send({ ssid: "TestNet", bssid: "AA:BB:CC:DD:EE:FF", channel: 6 });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("ok");
  });

  test("returns 502 and no err.message when Pi unreachable", async () => {
    piFetch.mockRejectedValueOnce(new Error("ECONNREFUSED internal detail"));
    const res = await request(app)
      .post("/api/rasPi/scan")
      .set("Authorization", AUTH)
      .send({ ssid: "TestNet", bssid: "AA:BB:CC:DD:EE:FF", channel: 6 });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED internal detail");
    expect(res.body.error).toBe("Scan failed");
  });

  test("returns 401 without Authorization header", async () => {
    const res = await request(app)
      .post("/api/rasPi/scan")
      .send({ ssid: "TestNet", bssid: "AA:BB:CC:DD:EE:FF", channel: 6 });
    expect(res.status).toBe(401);
  });
});

// ─── saveNetworkMetadataScan ──────────────────────────────────────────────────

describe("POST /api/rasPi/networks — saveNetworkMetadataScan", () => {
  test("returns 400 when ssid/bssid/channel missing", async () => {
    const res = await request(app)
      .post("/api/rasPi/networks")
      .set("Authorization", AUTH)
      .send({ city: "Manila" });
    expect(res.status).toBe(400);
  });

  test("returns 500 with no err.message on DB error", async () => {
    mockDb.from.mockReturnValueOnce({
      ...mockDbChain,
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: "Postgres error: secret_internal_detail" } }),
    });
    const res = await request(app)
      .post("/api/rasPi/networks")
      .set("Authorization", AUTH)
      .send({ ssid: "TestNet", bssid: "AA:BB:CC:DD:EE:FF", channel: 6 });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret_internal_detail");
    expect(res.body.error).toBe("Failed to save network data");
  });
});

// ─── getNetworks ─────────────────────────────────────────────────────────────

describe("GET /api/rasPi/networks — getAccessPointDetails", () => {
  test("returns 200 with network array on success", async () => {
    mockDb.from.mockReturnValueOnce({
      ...mockDbChain,
      select: jest.fn().mockReturnThis(),
      then: jest.fn((fn) => fn({ data: [{ SSID: "TestNet", Status: "up" }], error: null })),
    });
    const res = await request(app)
      .get("/api/rasPi/networks")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/rasPi/networks");
    expect(res.status).toBe(401);
  });
});

// ─── getNetworkById ───────────────────────────────────────────────────────────

describe("GET /api/rasPi/networks/:networkId — getNetworkById", () => {
  const VALID_UUID = "11111111-1111-1111-1111-111111111111";

  test("returns 200 with network data on found", async () => {
    mockDb.from.mockReturnValueOnce({
      ...mockDbChain,
      single: jest.fn().mockResolvedValue({
        data: { ssid: "TestNet", bssid: "AA:BB", channel: 6, encryption_status: "WPA2" },
        error: null,
      }),
    });
    const res = await request(app)
      .get(`/api/rasPi/networks/${VALID_UUID}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ssid).toBe("TestNet");
  });

  test("returns 400 on invalid UUID format", async () => {
    const res = await request(app)
      .get("/api/rasPi/networks/not-a-uuid")
      .set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_UUID");
  });

  test("returns 500 on DB error", async () => {
    mockDb.from.mockReturnValueOnce({
      ...mockDbChain,
      single: jest.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
    });
    const res = await request(app)
      .get(`/api/rasPi/networks/${VALID_UUID}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to load network config");
  });
});
