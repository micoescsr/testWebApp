// __tests__/integration/scanIngestion.test.js
// Integration tests for the scan ingestion pipeline.
//
// Strategy (Option 1): Mock supabaseClient at repository/config layer.
// Real Express routes + middleware run; only DB I/O is stubbed.

const request = require("supertest");
const { createTestApp } = require("../helpers/testApp");
const { validScanPayload, triggerScanPayload } = require("../fixtures/scanPayloads");

const AUTH_HEADER = { Authorization: "Bearer test-token" };

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock jose (auth middleware)
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

// Mock @supabase/supabase-js so authJWT profile lookup works
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

// Chainable Supabase mock with configurable responses
const mockChain = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({
    data: { network_id: "net-1", scan_id: "scan-1" },
    error: null,
  }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};

jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: {
    from: jest.fn(() => ({ ...mockChain })),
    rpc: jest.fn(),
  },
}));

const { supabaseClient } = require("../../config/supabaseClient");

let app;
beforeAll(() => {
  app = createTestApp();
});

afterEach(() => {
  jest.restoreAllMocks();
  // Reset mock call counts
  Object.values(mockChain).forEach((fn) => fn.mockClear?.());
  supabaseClient.rpc.mockClear();
});

// ─── A. POST /api/rasPi/networks (saveNetworkMetadataScan) ──────────────────

describe("POST /api/rasPi/networks — scan ingestion pipeline", () => {
  test("returns 201 with valid scan payload", async () => {
    // Mock: network lookup returns null (new network), then insert succeeds
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockChain.single
      .mockResolvedValueOnce({
        data: { network_id: "net-new", ssid: "TestNetwork_5G", bssid: "AA:BB:CC:DD:EE:FF" },
        error: null,
      }) // network insert
      .mockResolvedValueOnce({
        data: { scan_id: "scan-new" },
        error: null,
      }); // scan insert

    // Mock: vulnerability_threat_details lookups for each finding
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: { vt_detail_id: "d1", vt_name: "Lack of Encryption", vt_kind: "vulnerability", vt_cvss_base_score: 9.1 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { vt_detail_id: "d2", vt_name: "WPS Enabled", vt_kind: "vulnerability", vt_cvss_base_score: 7.5 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { vt_detail_id: "d5", vt_name: "PMF Disabled", vt_kind: "vulnerability", vt_cvss_base_score: 5.3 },
        error: null,
      });

    supabaseClient.rpc.mockResolvedValueOnce({ data: 14, error: null });

    const res = await request(app)
      .post("/api/rasPi/networks")
      .set(AUTH_HEADER)
      .send(validScanPayload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OK");
    expect(res.body).toHaveProperty("network_id");
  });

  test("returns 400 with missing required fields", async () => {
    const res = await request(app)
      .post("/api/rasPi/networks")
      .set(AUTH_HEADER)
      .send({ ssid: "Test" }); // missing bssid + channel

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test("returns 400 with empty body", async () => {
    const res = await request(app)
      .post("/api/rasPi/networks")
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

// ─── B. POST /api/rasPi/scan (triggerScan → FastAPI proxy) ──────────────────

describe("POST /api/rasPi/scan — trigger scan proxy", () => {
  test("proxies to FastAPI and returns 200 on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            status: "OK",
            scan_id: "fast-scan-1",
            message: "Scan started",
          })
        ),
    });

    const res = await request(app)
      .post("/api/rasPi/scan")
      .set(AUTH_HEADER)
      .send(triggerScanPayload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/scan"),
      expect.objectContaining({ method: "POST" })
    );
  });

  test("returns 400 when ssid/bssid/channel missing", async () => {
    const res = await request(app)
      .post("/api/rasPi/scan")
      .set(AUTH_HEADER)
      .send({ ssid: "Test" }); // missing bssid, channel

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test("returns 502 when FastAPI is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app)
      .post("/api/rasPi/scan")
      .set(AUTH_HEADER)
      .send(triggerScanPayload);

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("failed");
  });
});

// ─── C. POST /api/device/signal_ap ──────────────────────────────────────────

describe("POST /api/device/signal_ap — device toggle", () => {
  test("acknowledges toggle ON", async () => {
    const res = await request(app)
      .post("/api/device/signal_ap")
      .set(AUTH_HEADER)
      .send({ toggleState: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("Active");
  });

  test("acknowledges toggle OFF", async () => {
    const res = await request(app)
      .post("/api/device/signal_ap")
      .set(AUTH_HEADER)
      .send({ toggleState: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("Disabled");
  });
});
