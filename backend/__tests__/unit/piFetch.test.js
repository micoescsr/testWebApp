// __tests__/unit/piFetch.test.js
// Tests: HMAC signing behavior, dev-mode skip, timeout wrapping

const mockBuildSignedHeaders = jest.fn().mockReturnValue({
  "X-Control-Timestamp": "1000000",
  "X-Control-Nonce": "abc",
  "X-Control-Body-SHA256": "sha",
  "X-Control-Signature": "sig",
});

jest.mock("../../utils/signing", () => ({ buildSignedHeaders: mockBuildSignedHeaders }));

const okText = '{"result":"ok"}';
const makeOkFetch = () =>
  jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(okText),
  });

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.CONTROL_SIGNING_SECRET;
  delete process.env.PI_SIGNING_OPTIONAL;
  delete process.env.NODE_ENV;
  delete global.fetch;
});

const { piFetch } = require("../../utils/piFetch");

// ─── signing — with secret ────────────────────────────────────────

describe("piFetch — calls buildSignedHeaders when secret is set", () => {
  test("signed GET request", async () => {
    process.env.CONTROL_SIGNING_SECRET = "my-secret";
    process.env.PI_SIGNING_OPTIONAL = "true"; // irrelevant when secret is present
    global.fetch = makeOkFetch();

    await piFetch("/device/status");

    expect(mockBuildSignedHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "my-secret",
        method: "GET",
        pathWithQuery: "/device/status",
      })
    );
  });

  test("signed POST with JSON body", async () => {
    process.env.CONTROL_SIGNING_SECRET = "my-secret";
    process.env.PI_SIGNING_OPTIONAL = "true";
    global.fetch = makeOkFetch();

    await piFetch("/detect/start", { method: "POST", jsonBody: { scan_id: 1 } });

    expect(mockBuildSignedHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", secret: "my-secret" })
    );
  });
});

// ─── signing — dev-mode skip ──────────────────────────────────────

describe("piFetch — signing skipped in dev when PI_SIGNING_OPTIONAL=true", () => {
  test("no secret + PI_SIGNING_OPTIONAL=true → no signing, no throw", async () => {
    process.env.NODE_ENV = "development";
    process.env.PI_SIGNING_OPTIONAL = "true";
    global.fetch = makeOkFetch();

    await expect(piFetch("/device/status")).resolves.toBeDefined();
    expect(mockBuildSignedHeaders).not.toHaveBeenCalled();
  });
});

// ─── signing — throws when required ──────────────────────────────

describe("piFetch — throws when signing required but no secret", () => {
  test("dev, no PI_SIGNING_OPTIONAL → throws", async () => {
    process.env.NODE_ENV = "development";

    await expect(piFetch("/device/status")).rejects.toThrow("CONTROL_SIGNING_SECRET is not set");
  });

  test("production, PI_SIGNING_OPTIONAL=true → throws (production always requires signing)", async () => {
    process.env.NODE_ENV = "production";
    process.env.PI_SIGNING_OPTIONAL = "true";

    await expect(piFetch("/device/status")).rejects.toThrow("CONTROL_SIGNING_SECRET is not set");
  });
});

// ─── response shape ───────────────────────────────────────────────

describe("piFetch — response shape", () => {
  beforeEach(() => {
    process.env.PI_SIGNING_OPTIONAL = "true";
  });

  test("returns { ok, status, data, rawText }", async () => {
    global.fetch = makeOkFetch();
    const result = await piFetch("/device/status");
    expect(result).toEqual({ ok: true, status: 200, data: { result: "ok" }, rawText: okText });
  });

  test("non-JSON response wrapped in { raw }", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("not-json"),
    });
    const result = await piFetch("/device/status");
    expect(result.data).toEqual({ raw: "not-json" });
  });

  test("non-ok HTTP response returned (not thrown)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('{"detail":"service unavailable"}'),
    });
    const result = await piFetch("/device/status");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });
});

// ─── timeout + network errors ─────────────────────────────────────

describe("piFetch — error wrapping", () => {
  beforeEach(() => {
    process.env.PI_SIGNING_OPTIONAL = "true";
  });

  test("AbortError → wrapped as timeout with status 504", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    global.fetch = jest.fn().mockRejectedValue(abortErr);

    const err = await piFetch("/device/status", { timeoutMs: 50 }).catch((e) => e);
    expect(err.message).toContain("timed out");
    expect(err.status).toBe(504);
    expect(err.data).toEqual(expect.objectContaining({ error: "pi_unreachable" }));
  });

  test("generic network error → wrapped with status 504", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const err = await piFetch("/device/status").catch((e) => e);
    expect(err.message).toContain("Pi request failed");
    expect(err.status).toBe(504);
  });
});

// ─── query string handling ────────────────────────────────────────

describe("piFetch — query string", () => {
  beforeEach(() => {
    process.env.PI_SIGNING_OPTIONAL = "true";
  });

  test("object query serialized to URLSearchParams", async () => {
    process.env.CONTROL_SIGNING_SECRET = "secret";
    global.fetch = makeOkFetch();

    await piFetch("/detect/poll", { query: { max_items: 50, page: 2 } });
    const [[url]] = global.fetch.mock.calls;
    expect(url).toContain("max_items=50");
    expect(url).toContain("page=2");
  });

  test("string query appended as-is", async () => {
    process.env.CONTROL_SIGNING_SECRET = "secret";
    global.fetch = makeOkFetch();

    await piFetch("/detect/poll", { query: "max_items=50" });
    const [[url]] = global.fetch.mock.calls;
    expect(url).toContain("max_items=50");
  });
});
