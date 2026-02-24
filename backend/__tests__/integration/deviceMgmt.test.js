// __tests__/integration/deviceMgmt.test.js
// Integration tests for device management routes: /enable-ap, /ap-state
// Uses supertest against the real Express stack with mocked Supabase + FastAPI.

const request = require("supertest");
const { createTestApp } = require("../helpers/testApp");
const {
  NETWORK_ID,
  SCAN_ID,
  networkRow,
  networkRowInitialized,
  freshScan,
  mismatchedScan,
  oldScan,
  enableBody,
  enableBodyNoScan,
  disableBody,
  fastapiSuccess,
  portalPatchSuccess,
} = require("../fixtures/deviceMgmtPayloads");

// ── Mocks ───────────────────────────────────────────────────────

// Mock jose so authJWT accepts any Bearer token
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

// We control supabaseClient per-test via mockImplementation
const mockFrom = jest.fn();
jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: {
    from: (...args) => mockFrom(...args),
  },
}));

// Mock captivePortalController helpers used by deviceMgmtRoutes on first-enable
jest.mock("../../controllers/captivePortalController", () => ({
  seedDefaultContent: jest.fn().mockResolvedValue(1),
  buildPortalPayloadFromDB: jest.fn().mockResolvedValue({
    network_id: "30:40:74:8E:8D:2A | TestNet",
    patch: {
      portal_content: {
        announcements: { updated_at: 1740000000, announcement_text: "Welcome" },
        terms: { version: "2026-02-25", updated_at: 1740000000, text: "Terms" },
        tips: { updated_at: 1740000000, items: ["Tip 1", "Tip 2", "Tip 3"] },
      },
      security: {
        score: 0,
        risk_level: "LOW",
        ui_color: "#22C55E",
        description: "Low risk — minimal threats detected",
        updated_at: 1740000000,
      },
    },
  }),
}));

const {
  seedDefaultContent,
  buildPortalPayloadFromDB,
} = require("../../controllers/captivePortalController");

let app;
let fetchCalls; // track calls to global.fetch

beforeAll(() => {
  app = createTestApp();
});

beforeEach(() => {
  fetchCalls = [];
  jest.restoreAllMocks();
  seedDefaultContent.mockClear();
  buildPortalPayloadFromDB.mockClear();
});

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Build a chainable mock for supabaseClient.from("table").
 * Supports: select().eq().single(), select().eq() (thenable), update().eq()
 */
function chain({ singleResult = { data: null, error: null }, listResult = { data: [], error: null }, updateResult = { data: null, error: null } } = {}) {
  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn(() => ({
      eq: jest.fn().mockResolvedValue(updateResult),
    })),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(singleResult),
    maybeSingle: jest.fn().mockResolvedValue(singleResult),
  };
}

/**
 * Configure mockFrom to return different results per table name.
 */
function setupSupabase(tableMap) {
  mockFrom.mockImplementation((table) => {
    if (tableMap[table]) return tableMap[table];
    // Default: return empty chain
    return chain();
  });
}

/**
 * Mock global.fetch to intercept FastAPI calls.
 */
function mockFetch(responses = {}) {
  global.fetch = jest.fn(async (url, opts) => {
    fetchCalls.push({ url, opts });
    const body = responses[url] || fastapiSuccess;
    const ok = !body.__fail;
    return {
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// A. GET /api/device/ap-state/:networkId
// ─────────────────────────────────────────────────────────────────

describe("GET /api/device/ap-state/:networkId", () => {
  test("returns ap_enabled and portal_initialized from DB", async () => {
    setupSupabase({
      networks: chain({
        singleResult: {
          data: { ap_enabled: true, portal_initialized: true },
          error: null,
        },
      }),
    });

    const res = await request(app).get(`/api/device/ap-state/${NETWORK_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.ap_enabled).toBe(true);
    expect(res.body.portal_initialized).toBe(true);
  });

  test("defaults to false when columns are null", async () => {
    setupSupabase({
      networks: chain({
        singleResult: {
          data: { ap_enabled: null, portal_initialized: null },
          error: null,
        },
      }),
    });

    const res = await request(app).get(`/api/device/ap-state/${NETWORK_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.ap_enabled).toBe(false);
    expect(res.body.portal_initialized).toBe(false);
  });

  test("returns 500 when DB query fails", async () => {
    setupSupabase({
      networks: chain({
        singleResult: { data: null, error: { message: "something broke" } },
      }),
    });

    const res = await request(app).get(`/api/device/ap-state/${NETWORK_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to fetch AP state");
  });
});

// ─────────────────────────────────────────────────────────────────
// B. POST /api/device/enable-ap — VALIDATION
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/enable-ap — validation", () => {
  test("400 when network_id is missing", async () => {
    const res = await request(app)
      .post("/api/device/enable-ap")
      .send({ ap_status: "enable" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing or invalid");
  });

  test("400 when ap_status is invalid", async () => {
    const res = await request(app)
      .post("/api/device/enable-ap")
      .send({ network_id: NETWORK_ID, ap_status: "toggle" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing or invalid");
  });

  test("400 SCAN_REQUIRED when enable without scan_id", async () => {
    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(enableBodyNoScan);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SCAN_REQUIRED");
  });
});

// ─────────────────────────────────────────────────────────────────
// C. POST /api/device/enable-ap — ENABLE path
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/enable-ap — enable", () => {
  test("400 SCAN_REQUIRED when scan not found in DB", async () => {
    setupSupabase({
      scans: chain({
        singleResult: { data: null, error: { message: "not found" } },
      }),
    });

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SCAN_REQUIRED");
  });

  test("400 SCAN_NETWORK_MISMATCH when scan belongs to different network", async () => {
    const scanChain = chain({
      singleResult: { data: mismatchedScan(), error: null },
    });
    const netChain = chain({
      singleResult: { data: networkRow, error: null },
    });

    setupSupabase({ scans: scanChain, networks: netChain });

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SCAN_NETWORK_MISMATCH");
  });

  test("400 SCAN_TOO_OLD when scan exceeds max age", async () => {
    const scanChain = chain({
      singleResult: { data: oldScan(), error: null },
    });
    const netChain = chain({
      singleResult: { data: networkRow, error: null },
    });

    setupSupabase({ scans: scanChain, networks: netChain });

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SCAN_TOO_OLD");
    expect(res.body).toHaveProperty("scan_age_seconds");
    expect(res.body).toHaveProperty("max_age_seconds");
  });

  test("first enable → calls portal/patch THEN orchestrate/apply, sets ap_enabled + portal_initialized", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({ singleResult: { data: { ...networkRow, portal_initialized: false }, error: null } });

    setupSupabase({ scans: scanChain, networks: netChain });
    mockFetch({});

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.ap_status).toBe("enable");

    // Verify seedDefaultContent + buildPortalPayloadFromDB were called
    expect(seedDefaultContent).toHaveBeenCalledWith(NETWORK_ID);
    expect(buildPortalPayloadFromDB).toHaveBeenCalledWith(
      NETWORK_ID, networkRow.bssid, networkRow.ssid
    );

    // Verify portal/patch was called BEFORE orchestrate/apply
    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toContain("/portal/patch");
    expect(fetchCalls[1].url).toContain("/orchestrate/apply");

    // Verify portal/patch payload includes risk classification fields (real score)
    const portalPayload = JSON.parse(fetchCalls[0].opts.body);
    expect(portalPayload.patch.security).toHaveProperty("ui_color");
    expect(portalPayload.patch.security).toHaveProperty("description");
    expect(portalPayload.patch.security.risk_level).not.toBe("NOT YET ASSESSED");

    // Verify orchestrate/apply payload uses DB config (not from request body)
    const apPayload = JSON.parse(fetchCalls[1].opts.body);
    expect(apPayload.ssid).toBe(networkRow.ssid);
    expect(apPayload.bssid).toBe(networkRow.bssid);
    expect(apPayload.channel).toBe(networkRow.channel);
    expect(apPayload.ap_status).toBe("enable");
  });

  test("second enable (portal already initialized) → skips portal/patch", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
      singleResult: { data: networkRowInitialized, error: null },
    });

    setupSupabase({ scans: scanChain, networks: netChain });
    mockFetch({});

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(200);

    // Only orchestrate/apply — no portal/patch
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("/orchestrate/apply");
  });

  test("enable includes ap_password in orchestrate/apply when provided", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
      singleResult: { data: networkRowInitialized, error: null },
    });

    setupSupabase({ scans: scanChain, networks: netChain });
    mockFetch({});

    await request(app)
      .post("/api/device/enable-ap")
      .send({ ...enableBody, ap_password: "secret123" });

    const apPayload = JSON.parse(fetchCalls[0].opts.body);
    expect(apPayload.ap_password).toBe("secret123");
  });

  test("500 when orchestrate/apply returns error", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
      singleResult: { data: networkRowInitialized, error: null },
    });

    setupSupabase({ scans: scanChain, networks: netChain });

    // Make orchestrate/apply fail
    global.fetch = jest.fn(async (url) => {
      fetchCalls.push({ url });
      return {
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: "Pi unreachable" }),
      };
    });

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("AP toggle failed");
  });
});

// ─────────────────────────────────────────────────────────────────
// D. POST /api/device/enable-ap — DISABLE path
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/enable-ap — disable", () => {
  test("disable works without scan_id", async () => {
    const netChain = chain({
      singleResult: { data: networkRow, error: null },
    });

    setupSupabase({ networks: netChain });
    mockFetch({});

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(disableBody);

    expect(res.status).toBe(200);
    expect(res.body.ap_status).toBe("disable");

    // Only orchestrate/apply — no portal/patch
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("/orchestrate/apply");

    // Verify disable payload
    const payload = JSON.parse(fetchCalls[0].opts.body);
    expect(payload.ap_status).toBe("disable");
    expect(payload.ssid).toBe(networkRow.ssid);
  });

  test("disable does not include ap_password", async () => {
    const netChain = chain({
      singleResult: { data: networkRow, error: null },
    });

    setupSupabase({ networks: netChain });
    mockFetch({});

    await request(app)
      .post("/api/device/enable-ap")
      .send(disableBody);

    const payload = JSON.parse(fetchCalls[0].opts.body);
    expect(payload.ap_password).toBeUndefined();
  });

  test("500 when network not found in DB on disable", async () => {
    const netChain = chain({
      singleResult: { data: null, error: { message: "no rows" } },
    });

    setupSupabase({ networks: netChain });

    const res = await request(app)
      .post("/api/device/enable-ap")
      .send(disableBody);

    expect(res.status).toBe(500);
  });
});
