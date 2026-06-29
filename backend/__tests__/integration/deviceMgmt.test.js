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
  fastapiAccepted,
  orchestratePollOngoing,
  orchestratePollDone,
  orchestratePollFailed,
  apPollEnabled,
  apPollDisabled,
  portalPatchSuccess,
} = require("../fixtures/deviceMgmtPayloads");
const apJobStore = require("../../services/apJobStore");

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
      aal: "aal2",
    },
  }),
}));

// Mock @supabase/supabase-js so authMiddleware's supabaseAdmin profile lookup works
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
        tips: {
          updated_at: 1740000000,
          items: [
            { tip_text: "Tip 1", sort_order: 1, is_active: true },
            { tip_text: "Tip 2", sort_order: 2, is_active: true },
            { tip_text: "Tip 3", sort_order: 3, is_active: true },
          ],
        },
      },
      security: {
        score: 0,
        risk_level: "LOW",
        riskColor: "#22C55E",
        riskDescription: "Low risk — minimal threats detected",
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
  apJobStore._reset();
});

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Build a chainable mock for supabaseClient.from("table").
 * Supports: select().eq().single(), select().eq() (thenable), update().eq()
 */
function chain({ singleResult = { data: null, error: null }, listResult = { data: [], error: null }, updateResult = { data: null, error: null } } = {}) {
  // Build a deeply‑chainable update sub‑chain so queries like
  //   .update({}).eq().eq().select().maybeSingle()
  // resolve correctly.
  const updateChain = {
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(updateResult),
    maybeSingle: jest.fn().mockResolvedValue(updateResult),
  };
  // Make .eq() return the same sub‑chain (allows unlimited chaining)
  updateChain.eq.mockReturnValue(updateChain);
  updateChain.select.mockReturnValue(updateChain);

  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn(() => updateChain),
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
    const status = body.__status ?? (ok ? 200 : 500);
    const payload = { ...body };
    delete payload.__fail;
    delete payload.__status;
    return {
      ok,
      status,
      text: () => Promise.resolve(JSON.stringify(payload)),
      json: () => Promise.resolve(payload),
    };
  });
}

/** Supertest helpers that include auth header */
const AUTH_HEADER = { Authorization: "Bearer test-token" };
const authGet = (path) => request(app).get(path).set(AUTH_HEADER);
const authPost = (path) => request(app).post(path).set(AUTH_HEADER);

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

    const res = await authGet(`/api/device/ap-state/${NETWORK_ID}`);

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

    const res = await authGet(`/api/device/ap-state/${NETWORK_ID}`);

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

    const res = await authGet(`/api/device/ap-state/${NETWORK_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to fetch AP state");
  });
});

// ─────────────────────────────────────────────────────────────────
// B. POST /api/device/enable-ap — VALIDATION
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/enable-ap — validation", () => {
  test("400 when network_id is missing", async () => {
    const res = await authPost("/api/device/enable-ap")
      .send({ ap_status: "enable" });

    expect(res.status).toBe(400);
		expect(res.body.error).toBe("VALIDATION_ERROR");
		expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test("400 when ap_status is invalid", async () => {
    const res = await authPost("/api/device/enable-ap")
      .send({ network_id: NETWORK_ID, ap_status: "toggle" });

    expect(res.status).toBe(400);
		expect(res.body.error).toBe("VALIDATION_ERROR");
		expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test("400 SCAN_REQUIRED when enable without scan_id", async () => {
    const res = await authPost("/api/device/enable-ap")
      .send(enableBodyNoScan);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SCAN_REQUIRED");
  });
});

// ─────────────────────────────────────────────────────────────────
// C. POST /api/device/enable-ap — ENABLE path
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/enable-ap — enable", () => {
  test("400 SCAN_NOT_FOUND when scan not found in DB", async () => {
    setupSupabase({
      vulnerability_scans: chain({
        singleResult: { data: null, error: { message: "not found" } },
      }),
		networks: chain({
			singleResult: { data: networkRow, error: null },
			updateResult: { data: { network_id: NETWORK_ID }, error: null },
		}),
    });

    const res = await authPost("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(400);
		expect(res.body.error).toBe("SCAN_NOT_FOUND");
  });

  test("400 SCAN_NETWORK_MISMATCH when scan belongs to different network", async () => {
    const scanChain = chain({
      singleResult: { data: mismatchedScan(), error: null },
    });
    const netChain = chain({
		singleResult: { data: networkRow, error: null },
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

		setupSupabase({ vulnerability_scans: scanChain, networks: netChain });

    const res = await authPost("/api/device/enable-ap")
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
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

		setupSupabase({ vulnerability_scans: scanChain, networks: netChain });

    const res = await authPost("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SCAN_TOO_OLD");
    expect(res.body).toHaveProperty("scan_age_seconds");
    expect(res.body).toHaveProperty("max_age_seconds");
  });

  test("first enable → calls portal/patch THEN orchestrate/apply, sets ap_enabled + portal_initialized", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
		singleResult: { data: { ...networkRow, portal_initialized: false }, error: null },
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
	});

		setupSupabase({ vulnerability_scans: scanChain, networks: netChain });
    mockFetch({});

    const res = await authPost("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ap_enabled).toBe(true);
    expect(res.body.portal_initialized).toBe(true);

    // Verify seedDefaultContent + buildPortalPayloadFromDB were called
    expect(seedDefaultContent).toHaveBeenCalledWith(NETWORK_ID);
    // Step 7 (portal init) calls buildPortalPayloadFromDB once.
    // Step 10 is skipped for first-time enable because Step 7 already patched.
    expect(buildPortalPayloadFromDB).toHaveBeenCalledTimes(1);
    expect(buildPortalPayloadFromDB).toHaveBeenNthCalledWith(
      1,
      NETWORK_ID,
      networkRow.bssid,
      networkRow.ssid
    );

    // Verify portal/patch (init) was called BEFORE orchestrate/apply.
    // No second portal/patch — Step 7 already pushed content; Step 10 skips.
    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toContain("/portal/patch");
    expect(fetchCalls[1].url).toContain("/orchestrate/apply");

    // Verify portal/patch payload includes risk classification fields (real score)
    const portalPayload = JSON.parse(fetchCalls[0].opts.body);
    expect(portalPayload.patch.security).toHaveProperty("riskColor");
    expect(portalPayload.patch.security).toHaveProperty("riskDescription");
    expect(portalPayload.patch.security.risk_level).not.toBe("NOT YET ASSESSED");

    // Verify orchestrate/apply payload uses DB config (not from request body)
    const apPayload = JSON.parse(fetchCalls[1].opts.body);
    expect(apPayload.ssid).toBe(networkRow.ssid);
    expect(apPayload.bssid).toBe(networkRow.bssid);
    expect(apPayload.channel).toBe(networkRow.channel);
    expect(apPayload.ap_status).toBe("enable");
  });

  test("second enable (portal already initialized) → skips portal init, defers portal patch", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
      singleResult: { data: networkRowInitialized, error: null },
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

		setupSupabase({ vulnerability_scans: scanChain, networks: netChain });
    mockFetch({});

    const res = await authPost("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(200);

    // orchestrate/apply runs first; portal/patch runs as fire-and-forget
    // via setImmediate (non-blocking for the client response). Both are
    // visible in the test because supertest drains the event loop.
    // Allow a tick for the deferred callback to execute.
    await new Promise((r) => setImmediate(r));
    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toContain("/orchestrate/apply");
    expect(fetchCalls[1].url).toContain("/portal/patch");
    expect(seedDefaultContent).not.toHaveBeenCalled();
    expect(buildPortalPayloadFromDB).toHaveBeenCalledTimes(1);
  });

  test("enable includes ap_password in orchestrate/apply when provided", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
      singleResult: { data: networkRowInitialized, error: null },
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

		setupSupabase({ vulnerability_scans: scanChain, networks: netChain });
    mockFetch({});

    await authPost("/api/device/enable-ap")
      .send({ ...enableBody, ap_password: "secret123" });

    const apPayload = JSON.parse(fetchCalls[0].opts.body);
    expect(apPayload.ap_password).toBe("secret123");
  });

  test("502 when orchestrate/apply returns error", async () => {
    const scanData = freshScan();
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
      singleResult: { data: networkRowInitialized, error: null },
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

		setupSupabase({ vulnerability_scans: scanChain, networks: netChain });

    // Make orchestrate/apply fail
    global.fetch = jest.fn(async (url) => {
      fetchCalls.push({ url });
      return {
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ detail: "Pi unreachable" })),
      };
    });

    const res = await authPost("/api/device/enable-ap")
      .send(enableBody);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("FASTAPI_APPLY_FAILED");
  });
});

// ─────────────────────────────────────────────────────────────────
// D. POST /api/device/enable-ap — DISABLE path
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/enable-ap — disable", () => {
  test("disable works without scan_id", async () => {
    const netChain = chain({
		singleResult: { data: networkRow, error: null },
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

    setupSupabase({ networks: netChain });
    mockFetch({});

    const res = await authPost("/api/device/enable-ap")
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
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

    setupSupabase({ networks: netChain });
    mockFetch({});

    await authPost("/api/device/enable-ap")
      .send(disableBody);

    const payload = JSON.parse(fetchCalls[0].opts.body);
    expect(payload.ap_password).toBeUndefined();
  });

  test("500 when network not found in DB on disable", async () => {
    const netChain = chain({
      singleResult: { data: null, error: { message: "no rows" } },
		updateResult: { data: { network_id: NETWORK_ID }, error: null },
    });

    setupSupabase({ networks: netChain });

    const res = await authPost("/api/device/enable-ap")
      .send(disableBody);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────
// E. Enable-ap — ASYNC (ACCEPTED) path
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/enable-ap — async ACCEPTED", () => {
  // Valid UUIDs to pass route validation (fixtures use non-UUID IDs)
  const UUID_NET = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const UUID_SCAN = "f0e1d2c3-b4a5-6789-0abc-def123456789";

  const asyncEnableBody = { network_id: UUID_NET, scan_id: UUID_SCAN, ap_status: "enable", ap_password: "#Dns1125" };

  test("returns ACCEPTED with job_id when Pi accepts async", async () => {
    const scanData = {
      scan_id: UUID_SCAN,
      network_id: UUID_NET,
      created_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: "COMPLETED",
      error_code: null,
      scan_data: { devices: [] },
      risk_score: 14,
    };
    const scanChain = chain({ singleResult: { data: scanData, error: null } });
    const netChain = chain({
      singleResult: { data: { ...networkRowInitialized, network_id: UUID_NET }, error: null },
      updateResult: { data: { network_id: UUID_NET }, error: null },
    });

    setupSupabase({ vulnerability_scans: scanChain, networks: netChain });

    // Pi returns ACCEPTED
    global.fetch = jest.fn(async (url) => {
      fetchCalls.push({ url });
      if (url.includes("/orchestrate/apply")) {
        return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(fastapiAccepted)) };
      }
      return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(fastapiSuccess)) };
    });

    const res = await authPost("/api/device/enable-ap")
      .send(asyncEnableBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACCEPTED");
    expect(res.body.job_id).toBe(fastapiAccepted.job_id);
    expect(res.body.ok).toBe(true);
  });

  test("409 when async job is already active for network", async () => {
    // Pre-create an active job in the store
    apJobStore.create({
      job_id: fastapiAccepted.job_id,
      network_id: UUID_NET,
      scan_id: UUID_SCAN,
      target_ap_status: "enable",
      payload_snapshot: {},
    });

    const res = await authPost("/api/device/enable-ap")
      .send(asyncEnableBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("REQUEST_IN_PROGRESS");
    expect(res.body.job_id).toBe(fastapiAccepted.job_id);
  });
});

// ─────────────────────────────────────────────────────────────────
// F. GET /api/device/jobs/:jobId — job polling
// ─────────────────────────────────────────────────────────────────

describe("GET /api/device/jobs/:jobId", () => {
  test("400 for invalid jobId format", async () => {
    const res = await authGet("/api/device/jobs/bad-format!");
    expect(res.status).toBe(400);
  });

  test("returns ONGOING when Pi reports ongoing", async () => {
    apJobStore.create({
      job_id: fastapiAccepted.job_id,
      network_id: NETWORK_ID,
      scan_id: SCAN_ID,
      target_ap_status: "enable",
      payload_snapshot: {},
    });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(orchestratePollOngoing)),
    }));

    const res = await authGet(`/api/device/jobs/${fastapiAccepted.job_id}`);

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("ONGOING");
    expect(res.body.ok).toBe(true);
  });

  test("returns DONE and finalizes job when Pi reports done", async () => {
    apJobStore.create({
      job_id: fastapiAccepted.job_id,
      network_id: NETWORK_ID,
      scan_id: SCAN_ID,
      target_ap_status: "enable",
      payload_snapshot: {},
    });

    // Need supabase for finalization
    const netChain = chain({
      singleResult: { data: { ...networkRowInitialized, ap_apply_in_progress: true, bssid: networkRow.bssid, ssid: networkRow.ssid }, error: null },
    });
    setupSupabase({ networks: netChain });

    global.fetch = jest.fn(async (url) => {
      fetchCalls.push({ url });
      if (url.includes("/orchestrate/poll")) {
        return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(orchestratePollDone)) };
      }
      // portal/patch during finalization
      return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(portalPatchSuccess)) };
    });

    const res = await authGet(`/api/device/jobs/${fastapiAccepted.job_id}`);

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("DONE");
    expect(res.body.ok).toBe(true);

    // Job should be marked finalized
    const job = apJobStore.get(fastapiAccepted.job_id);
    expect(job.finalized).toBe(true);
  });

  test("returns cached result for already-finalized job without hitting Pi", async () => {
    apJobStore.create({
      job_id: fastapiAccepted.job_id,
      network_id: NETWORK_ID,
      scan_id: SCAN_ID,
      target_ap_status: "enable",
      payload_snapshot: {},
    });
    apJobStore.update(fastapiAccepted.job_id, { status: "DONE", result: { status: "ok" } });
    apJobStore.markFinalized(fastapiAccepted.job_id);

    global.fetch = jest.fn(); // should NOT be called

    const res = await authGet(`/api/device/jobs/${fastapiAccepted.job_id}`);

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("DONE");
    expect(res.body.ok).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("returns FAILED when Pi result is ERROR", async () => {
    apJobStore.create({
      job_id: fastapiAccepted.job_id,
      network_id: NETWORK_ID,
      scan_id: SCAN_ID,
      target_ap_status: "enable",
      payload_snapshot: {},
    });

    const netChain = chain({
      singleResult: { data: { ap_apply_in_progress: true }, error: null },
    });
    setupSupabase({ networks: netChain });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(orchestratePollFailed)),
    }));

    const res = await authGet(`/api/device/jobs/${fastapiAccepted.job_id}`);

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("FAILED");
    expect(res.body.ok).toBe(false);
    expect(res.body.error_code).toBeTruthy();
  });

  test("PI_UNREACHABLE when fetch fails", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ detail: "Pi unreachable" })),
    }));

    const res = await authGet(`/api/device/jobs/${fastapiAccepted.job_id}`);

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("UNKNOWN");
    expect(res.body.error_code).toBe("PI_UNREACHABLE");
  });
});

// ─────────────────────────────────────────────────────────────────
// G. GET /api/device/ap-live — AP live state
// ─────────────────────────────────────────────────────────────────

describe("GET /api/device/ap-live", () => {
  test("returns ENABLED when Pi reports AP enabled", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(apPollEnabled)),
    }));

    const res = await authGet("/api/device/ap-live");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ap_status).toBe("ENABLED");
    expect(res.body.uplink_status).toBe("CONNECTED");
  });

  test("returns DISABLED when Pi reports AP disabled", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(apPollDisabled)),
    }));

    const res = await authGet("/api/device/ap-live");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ap_status).toBe("DISABLED");
  });

  test("returns UNKNOWN when Pi is unreachable", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ detail: "Pi unreachable" })),
    }));

    const res = await authGet("/api/device/ap-live");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.ap_status).toBe("UNKNOWN");
  });
});

// ─────────────────────────────────────────────────────────────────
// H. POST /api/device/portal/update — manual Update Portal (BUG-2B)
// ─────────────────────────────────────────────────────────────────

describe("POST /api/device/portal/update — manual Update Portal", () => {
  const UUID_NET = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const riskUpdateBody = {
    network_id: UUID_NET,
    update_type: "risk",
    reason: "manual_update",
    payload: { risk: { bucket: "HIGH" } },
  };

  test("successful update stamps current version + resolver tipset hash (clears staleness)", async () => {
    // Stale: portal version behind risk version, old tipset hash
    const netChain = chain({
      singleResult: {
        data: {
          ap_enabled: true,
          risk_score_version: 2,
          portal_last_patched_version: 1,
          portal_tipset_hash: "old-hash",
        },
        error: null,
      },
      updateResult: { data: { network_id: UUID_NET }, error: null },
    });
    setupSupabase({ networks: netChain });
    mockFetch({}); // /portal/patch → success

    const res = await authPost("/api/device/portal/update").send(riskUpdateBody);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.patched).toBe(true);
    // Version stamped up to the current risk_score_version → riskOutOfDate clears
    expect(res.body.stamped.portal_last_patched_version).toBe(2);
    // Tipset hash stamped from the resolver (the value the state endpoint
    // compares against) → tipsetOutOfDate clears. Must be a real hash, not null.
    expect(typeof res.body.stamped.portal_tipset_hash).toBe("string");
    expect(res.body.stamped.portal_tipset_hash.length).toBeGreaterThan(0);
  });

  test("does NOT falsely mark fresh when Pi patch fails (502, no stamp)", async () => {
    const netChain = chain({
      singleResult: {
        data: {
          ap_enabled: true,
          risk_score_version: 2,
          portal_last_patched_version: 1,
          portal_tipset_hash: "old-hash",
        },
        error: null,
      },
    });
    setupSupabase({ networks: netChain });

    // /portal/patch fails on the Pi
    global.fetch = jest.fn(async (url) => {
      fetchCalls.push({ url });
      return {
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ detail: "Pi patch failed" })),
      };
    });

    const res = await authPost("/api/device/portal/update").send(riskUpdateBody);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("FASTAPI_PORTAL_PATCH_FAILED");
    expect(res.body.ok).toBeUndefined();
    expect(res.body.stamped).toBeUndefined();
  });

  test("409 when AP is not enabled", async () => {
    const netChain = chain({
      singleResult: {
        data: { ap_enabled: false, risk_score_version: 2, portal_last_patched_version: 1 },
        error: null,
      },
    });
    setupSupabase({ networks: netChain });

    const res = await authPost("/api/device/portal/update").send(riskUpdateBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("AP_NOT_ENABLED");
  });
});
