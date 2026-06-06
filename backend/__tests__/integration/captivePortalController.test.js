// __tests__/integration/captivePortalController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("../../utils/piFetch", () => ({ piFetch: jest.fn() }));
jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/portalTipResolver", () => ({
  resolveFinalPortalTipsForNetwork: jest.fn().mockResolvedValue([]),
  computePortalTipsetHash: jest.fn().mockReturnValue("hash-abc"),
}));

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "user-uuid", email: "test@example.com", role: "authenticated", aud: "authenticated" },
  }),
}));

const buildChain = (data) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: data ?? { id: "row-1" }, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: data ?? null, error: null }),
  then: jest.fn((fn) => fn({ data: Array.isArray(data) ? data : [data ?? { id: "row-1" }], error: null })),
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: jest.fn(() => buildChain({ status: "active" })) })),
}));

const mockDb = { from: jest.fn(() => buildChain({ id: "row-1", content: "Test announcement", is_active: true })) };
jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockDb }));

const { piFetch } = require("../../utils/piFetch");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/captivePortal", require("../../routes/captivePortalRoutes"));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const AUTH = "Bearer test-token";
const NETWORK_ID = "11111111-1111-1111-1111-111111111111";

// ─── getAnnouncement ──────────────────────────────────────────────────────────

describe("GET /api/captivePortal/announcement", () => {
  test("returns 200 with announcement", async () => {
    mockDb.from.mockReturnValueOnce(buildChain({ content: "Welcome!", is_active: true }));
    const res = await request(app)
      .get(`/api/captivePortal/announcement?network_id=${NETWORK_ID}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get(`/api/captivePortal/announcement?network_id=${NETWORK_ID}`);
    expect(res.status).toBe(401);
  });
});

// ─── getTips ──────────────────────────────────────────────────────────────────

describe("GET /api/captivePortal/tips", () => {
  test("returns 200 with tips array", async () => {
    mockDb.from.mockReturnValueOnce(buildChain([{ tip_text: "Use HTTPS" }]));
    const res = await request(app)
      .get(`/api/captivePortal/tips?network_id=${NETWORK_ID}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });
});

// ─── getRiskClassifications ───────────────────────────────────────────────────

describe("GET /api/captivePortal/risk-classifications", () => {
  test("returns 200", async () => {
    mockDb.from.mockReturnValueOnce(buildChain([{ risk_level: "LOW", color: "green" }]));
    const res = await request(app)
      .get("/api/captivePortal/risk-classifications")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });
});

// ─── publishAnnouncement ──────────────────────────────────────────────────────

describe("POST /api/captivePortal/announcement", () => {
  test("returns 400 on validation failure (missing network_id)", async () => {
    const res = await request(app)
      .post("/api/captivePortal/announcement")
      .set("Authorization", AUTH)
      .send({ content: "Hello!" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  test("creates announcement on valid body", async () => {
    mockDb.from.mockReturnValue(buildChain({ id: "new-1", content: "New announcement" }));
    const res = await request(app)
      .post("/api/captivePortal/announcement")
      .set("Authorization", AUTH)
      .send({ content: "Hello visitors!", network_id: NETWORK_ID });
    expect(res.status).toBe(200);
  });
});

// ─── upsertTips ───────────────────────────────────────────────────────────────

describe("POST /api/captivePortal/tips", () => {
  test("returns 400 on missing tips array", async () => {
    const res = await request(app)
      .post("/api/captivePortal/tips")
      .set("Authorization", AUTH)
      .send({ network_id: NETWORK_ID });
    expect(res.status).toBe(400);
  });

  test("returns 400 (VALIDATION_ERROR) on empty tips array (min 1 required)", async () => {
    const res = await request(app)
      .post("/api/captivePortal/tips")
      .set("Authorization", AUTH)
      .send({ network_id: NETWORK_ID, tips: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});

// ─── syncPortal ───────────────────────────────────────────────────────────────

describe("POST /api/captivePortal/sync", () => {
  test("returns 400 on missing network_id", async () => {
    const res = await request(app)
      .post("/api/captivePortal/sync")
      .set("Authorization", AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  test("returns 500 when Pi sync fails", async () => {
    mockDb.from.mockReturnValue(buildChain({ id: "row-1", content: "test", is_active: true, bssid: "AA:BB:CC:DD:EE:FF", ssid: "TestNet" }));
    piFetch.mockResolvedValueOnce({ ok: false, status: 503, data: { detail: "Pi offline" } });
    const res = await request(app)
      .post("/api/captivePortal/sync")
      .set("Authorization", AUTH)
      .send({ network_id: NETWORK_ID });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to sync portal");
  });
});
