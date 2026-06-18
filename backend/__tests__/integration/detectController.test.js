// __tests__/integration/detectController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("../../utils/piFetch", () => ({ piFetch: jest.fn() }));
jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/riskPipeline", () => ({
  bucketize: jest.fn().mockReturnValue("LOW"),
  updateNetworkRisk: jest.fn().mockResolvedValue(undefined),
}));

const mockDetectService = {
  startOrSwitch: jest.fn().mockResolvedValue({ status: "RUNNING", active_network_id: "net-1", active_scan_id: 42 }),
  stop: jest.fn().mockResolvedValue({ status: "IDLE", active_scan_id: 42, active_network_id: "net-1" }),
  heartbeat: jest.fn().mockResolvedValue({ status: "RUNNING" }),
  getStatusAndMaybeFail: jest.fn().mockResolvedValue({ status: "IDLE", active_network_id: null, active_scan_id: null }),
  ensureRow: jest.fn().mockResolvedValue({}),
  startServerHeartbeatLoop: jest.fn(),
};
jest.mock("../../services/detectStateService", () => mockDetectService);

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "user-uuid", email: "test@example.com", role: "authenticated", aud: "authenticated", aal: "aal2" },
  }),
}));

const buildChain = () => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: { ssid: "TestNet" }, error: null }),
  single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
  update: jest.fn().mockReturnThis(),
  then: jest.fn((fn) => fn({ data: [], error: null })),
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: jest.fn(() => buildChain()) })),
}));

const mockDb = {
  from: jest.fn(() => buildChain()),
  rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
};
jest.mock("../../config/supabaseClient", () => ({ supabaseClient: mockDb }));

const { piFetch } = require("../../utils/piFetch");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/detect", require("../../routes/detectRoutes"));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const AUTH = "Bearer test-token";

// ─── getStatus ────────────────────────────────────────────────────────────────

describe("GET /api/detect/status — getStatus", () => {
  test("returns detection state", async () => {
    mockDetectService.getStatusAndMaybeFail.mockResolvedValueOnce({
      status: "IDLE", active_network_id: null, active_scan_id: null,
    });
    const res = await request(app)
      .get("/api/detect/status")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IDLE");
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/detect/status");
    expect(res.status).toBe(401);
  });
});

const VALID_NET_UUID = "22222222-2222-2222-2222-222222222222";

// ─── start ────────────────────────────────────────────────────────────────────

describe("POST /api/detect/start — start", () => {
  test("returns 400 (VALIDATION_ERROR) when network_id missing", async () => {
    const res = await request(app)
      .post("/api/detect/start")
      .set("Authorization", AUTH)
      .send({ scan_id: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  test("returns 400 (VALIDATION_ERROR) when scan_id is UUID format", async () => {
    const res = await request(app)
      .post("/api/detect/start")
      .set("Authorization", AUTH)
      .send({ network_id: VALID_NET_UUID, scan_id: "11111111-1111-1111-1111-111111111111" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    const msgs = res.body.errors.map((e) => e.msg);
    expect(msgs.some((m) => m.includes("scan_id"))).toBe(true);
  });

  test("returns detection state on success", async () => {
    mockDetectService.startOrSwitch.mockResolvedValueOnce({ status: "RUNNING" });
    const res = await request(app)
      .post("/api/detect/start")
      .set("Authorization", AUTH)
      .send({ network_id: VALID_NET_UUID, scan_id: 42 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RUNNING");
  });
});

// ─── stopDetection ────────────────────────────────────────────────────────────

describe("POST /api/detect/stop — stopDetection", () => {
  test("returns 400 (VALIDATION_ERROR) on invalid reason_code", async () => {
    const res = await request(app)
      .post("/api/detect/stop")
      .set("Authorization", AUTH)
      .send({ reason_code: "INVALID_CODE" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  test("returns 400 when OTHER reason_code has no reason_note", async () => {
    const res = await request(app)
      .post("/api/detect/stop")
      .set("Authorization", AUTH)
      .send({ reason_code: "OTHER" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reason_note");
  });

  test("stops detection and returns state", async () => {
    mockDetectService.stop.mockResolvedValueOnce({ status: "IDLE", active_scan_id: null, active_network_id: null });
    const res = await request(app)
      .post("/api/detect/stop")
      .set("Authorization", AUTH)
      .send({ reason_code: "MAINTENANCE" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IDLE");
  });
});

// ─── heartbeat ────────────────────────────────────────────────────────────────

describe("POST /api/detect/heartbeat — heartbeat", () => {
  test("returns updated state", async () => {
    mockDetectService.heartbeat.mockResolvedValueOnce({ status: "RUNNING", active_network_id: "net-1" });
    const res = await request(app)
      .post("/api/detect/heartbeat")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RUNNING");
  });
});

// ─── poll ─────────────────────────────────────────────────────────────────────

describe("GET /api/detect/poll — poll", () => {
  test("returns empty results when status is IDLE", async () => {
    mockDetectService.getStatusAndMaybeFail.mockResolvedValueOnce({ status: "IDLE", active_network_id: null });
    const res = await request(app)
      .get("/api/detect/poll")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.running).toBe(false);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  test("proxies to Pi when RUNNING", async () => {
    mockDetectService.getStatusAndMaybeFail.mockResolvedValueOnce({
      status: "RUNNING", active_network_id: "net-1", active_scan_id: 42,
    });
    piFetch.mockResolvedValueOnce({ ok: true, data: { results: [] } });
    mockDb.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      then: jest.fn((fn) => fn({ data: [], error: null })),
    });
    const res = await request(app)
      .get("/api/detect/poll")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(piFetch).toHaveBeenCalled();
  });
});
