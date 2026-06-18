// __tests__/integration/dashboardController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

const mockDashboardService = {
  getSummaryData: jest.fn().mockResolvedValue({ totalNetworks: 5, criticalCount: 1 }),
  getNetworksList: jest.fn().mockResolvedValue([{ network_id: "net-1", ssid: "TestNet" }]),
  getNetworkDashboard: jest.fn().mockResolvedValue({ network: { ssid: "TestNet" }, scans: [] }),
  getScansForNetwork: jest.fn().mockResolvedValue([{ scan_id: "scan-1" }]),
};
jest.mock("../../services/dashboardService", () => mockDashboardService);

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "user-uuid", email: "test@example.com", role: "authenticated", aud: "authenticated", aal: "aal2" },
  }),
}));

const buildChain = () => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: jest.fn(() => buildChain()) })),
}));

jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: { from: jest.fn(() => buildChain()) },
}));

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/dashboard", require("../../routes/dashboardRoutes"));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const AUTH = "Bearer test-token";
const VALID_UUID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/dashboard/summary", () => {
  test("returns 200 with summary data", async () => {
    const res = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.totalNetworks).toBe(5);
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });

  test("returns 500 when service throws", async () => {
    mockDashboardService.getSummaryData.mockRejectedValueOnce(new Error("DB down"));
    const res = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to load summary");
  });
});

describe("GET /api/dashboard/networks", () => {
  test("returns 200 with network list", async () => {
    const res = await request(app)
      .get("/api/dashboard/networks")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/dashboard/network/:networkId", () => {
  test("returns 200 with network dashboard", async () => {
    const res = await request(app)
      .get(`/api/dashboard/network/${VALID_UUID}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.network.ssid).toBe("TestNet");
  });

  test("returns 400 on invalid UUID", async () => {
    const res = await request(app)
      .get("/api/dashboard/network/not-a-uuid")
      .set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_UUID");
  });
});

describe("GET /api/dashboard/network/:networkId/scans", () => {
  test("returns 200 with scans list", async () => {
    mockDashboardService.getScansForNetwork = jest.fn().mockResolvedValue([{ scan_id: "scan-1" }]);
    const res = await request(app)
      .get(`/api/dashboard/network/${VALID_UUID}/scans`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });
});
