// __tests__/integration/auditController.test.js
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

jest.mock("../../utils/auditLogger", () => ({ logAuditEvent: jest.fn().mockResolvedValue(undefined) }));

const mockAuditRepo = {
  getAuditLogs: jest.fn().mockResolvedValue({
    data: [
      {
        audit_log_id: "log-1", created_at: "2026-01-01T00:00:00Z",
        request_id: "req-1", event_name: "SCAN_TRIGGER", event_status: "OK",
        entity_type: "SCAN", entity_id_uuid: "uuid-1", entity_id_bigint: null,
        old_values: null, new_values: null, meta: null,
        actor_ip: "127.0.0.1", user_agent: "test", actor_profile_id: "actor-1",
        profiles: { id: "actor-1", first_name: "Admin", last_name: "User", email: "a@b.com", username: "admin" },
      },
    ],
    total: 1, page: 1, limit: 25,
  }),
  getAuditLogsForExport: jest.fn().mockResolvedValue([]),
  archiveOldLogs: jest.fn().mockResolvedValue({ archived: 3 }),
};
jest.mock("../../repositories/auditRepository", () => mockAuditRepo);
jest.mock("../../utils/exportFormatters", () => ({ formatCSV: jest.fn().mockReturnValue("csv,data\n") }));

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "superadmin-uuid", email: "admin@example.com", role: "authenticated", aud: "authenticated" },
  }),
}));

const buildChain = () => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { status: "active", role: "superadmin" }, error: null }),
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: jest.fn(() => buildChain()) })),
}));

jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: { from: jest.fn(() => buildChain()) },
}));

const mockRequireSuperadmin = (req, res, next) => {
  const role = req.user?.role;
  if (role !== "superadmin") return res.status(403).json({ error: "Superadmin only" });
  next();
};

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  const { authJWT } = require("../../middleware/authMiddleware");
  const { requireActiveProfile } = require("../../middleware/statusMiddleware");
  const auditController = require("../../controllers/auditController");

  app.get("/api/audit/logs", authJWT, requireActiveProfile, mockRequireSuperadmin, auditController.getAuditLogs);
  app.get("/api/audit/export", authJWT, requireActiveProfile, mockRequireSuperadmin, auditController.exportAuditLogs);
  app.post("/api/audit/archive", authJWT, requireActiveProfile, mockRequireSuperadmin, auditController.archiveAuditLogs);
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

const AUTH = "Bearer test-token";

// ─── getAuditLogs ─────────────────────────────────────────────────────────────

describe("GET /api/audit/logs — getAuditLogs", () => {
  test("superadmin gets paginated logs", async () => {
    const { jwtVerify } = require("jose");
    jwtVerify.mockResolvedValueOnce({
      payload: { sub: "sa-uuid", email: "sa@test.com", role: "superadmin", aud: "authenticated" },
    });
    const res = await request(app)
      .get("/api/audit/logs")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.total).toBe(1);
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/audit/logs");
    expect(res.status).toBe(401);
  });

  test("returns 403 for non-superadmin", async () => {
    const res = await request(app)
      .get("/api/audit/logs")
      .set("Authorization", AUTH);
    expect(res.status).toBe(403);
  });

  test("passes search/pagination params to repository", async () => {
    const { jwtVerify } = require("jose");
    jwtVerify.mockResolvedValueOnce({
      payload: { sub: "sa-uuid", email: "sa@test.com", role: "superadmin", aud: "authenticated" },
    });
    await request(app)
      .get("/api/audit/logs?page=2&limit=10&search=SCAN&status=SUCCESS")
      .set("Authorization", AUTH);
    expect(mockAuditRepo.getAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 10, search: "SCAN", status: "SUCCESS" })
    );
  });
});

// ─── exportAuditLogs ──────────────────────────────────────────────────────────

describe("GET /api/audit/export — exportAuditLogs", () => {
  test("superadmin gets CSV", async () => {
    const { jwtVerify } = require("jose");
    jwtVerify.mockResolvedValueOnce({
      payload: { sub: "sa-uuid", email: "sa@test.com", role: "superadmin", aud: "authenticated" },
    });
    const res = await request(app)
      .get("/api/audit/export")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });
});

// ─── archiveAuditLogs ─────────────────────────────────────────────────────────

describe("POST /api/audit/archive — archiveAuditLogs", () => {
  test("superadmin triggers archive", async () => {
    const { jwtVerify } = require("jose");
    jwtVerify.mockResolvedValueOnce({
      payload: { sub: "sa-uuid", email: "sa@test.com", role: "superadmin", aud: "authenticated" },
    });
    const res = await request(app)
      .post("/api/audit/archive")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });
});
