// __tests__/integration/metadataController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "user-uuid-1111", email: "test@example.com", role: "authenticated", aud: "authenticated", aal: "aal2" },
  }),
}));

// Admin client used by requireActiveProfile — always reports an active profile.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
    })),
  })),
}));

// Per-table mock chains for the app-level supabaseClient used by the controller.
const buildChain = (overrides = {}) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue(overrides.single ?? { data: null, error: null }),
  maybeSingle: jest.fn().mockResolvedValue(overrides.maybeSingle ?? { data: null, error: null }),
  then: jest.fn((fn) => fn(overrides.thenResult ?? { data: [], error: null })),
});

let networksMock = { single: { data: { network_id: "net-1" }, error: null } };
let scansMock = { maybeSingle: { data: { scan_id: 102 }, error: null } };
let vulnsMock = { thenResult: { data: [], error: null } };

const mockDb = {
  from: jest.fn((table) => {
    if (table === "networks") return buildChain(networksMock);
    if (table === "scans") return buildChain(scansMock);
    if (table === "vulnerabilities_threat") return buildChain(vulnsMock);
    return buildChain();
  }),
};
jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockDb }));

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/webapp", require("../../routes/webAppRoutes"));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => {
  jest.clearAllMocks();
  networksMock = { single: { data: { network_id: "net-1" }, error: null } };
  scansMock = { maybeSingle: { data: { scan_id: 102 }, error: null } };
  vulnsMock = { thenResult: { data: [], error: null } };
});

const AUTH = "Bearer test-token";

describe("GET /api/webapp/vulnerabilities_latest", () => {
  test("returns 401 without Authorization header", async () => {
    const res = await request(app).get("/api/webapp/vulnerabilities_latest?bssid=AA:BB:CC:DD:EE:FF");
    expect(res.status).toBe(401);
  });

  test("returns 400 when bssid is missing", async () => {
    const res = await request(app)
      .get("/api/webapp/vulnerabilities_latest")
      .set("Authorization", AUTH);
    expect(res.status).toBe(400);
  });

  test("returns 500 when network cannot be resolved", async () => {
    networksMock = { single: { data: null, error: { message: "not found" } } };
    const res = await request(app)
      .get("/api/webapp/vulnerabilities_latest?bssid=AA:BB:CC:DD:EE:FF")
      .set("Authorization", AUTH);
    expect(res.status).toBe(500);
  });

  test("returns empty rows when the network has no scans yet", async () => {
    scansMock = { maybeSingle: { data: null, error: null } };
    const res = await request(app)
      .get("/api/webapp/vulnerabilities_latest?bssid=AA:BB:CC:DD:EE:FF")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "OK", rows: [] });
  });

  // Regression test for the "previous scan results still show after a new
  // scan" bug: vulnerabilities_threat rows are scoped per scan_id, but the
  // network can have many historical scans. The endpoint must only return
  // rows tied to the most recent scan_id, not every scan ever run.
  test("only returns vulnerabilities from the latest scan, not older scans for the same network", async () => {
    scansMock = { maybeSingle: { data: { scan_id: 102 }, error: null } };
    vulnsMock = {
      thenResult: {
        data: [
          {
            vt_id: 1,
            vt_name: "Open Network",
            vt_status: "DETECTED",
            vt_value: "Open",
            vt_kind: "vulnerability",
            scans: { scan_id: 102, scan_start: "2026-06-23T10:00:00Z", network_id: "net-1", networks: { bssid: "AA:BB:CC:DD:EE:FF", ssid: "TestNet" } },
            detail: { vt_code: "WFVT-001", vt_severity_rating: "HIGH", vt_cvss_base_score: 7.5 },
          },
        ],
        error: null,
      },
    };

    const res = await request(app)
      .get("/api/webapp/vulnerabilities_latest?bssid=AA:BB:CC:DD:EE:FF")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].scan_id).toBe(102);

    // Assert the vulnerabilities_threat query was scoped to the resolved
    // latest scan_id (102), not just the network_id.
    const lastVulnChain = mockDb.from.mock.calls
      .map((args, i) => ({ table: args[0], chain: mockDb.from.mock.results[i].value }))
      .filter((c) => c.table === "vulnerabilities_threat")
      .pop().chain;
    expect(lastVulnChain.eq).toHaveBeenCalledWith("scan_id", 102);
  });
});
