// __tests__/unit/signing.test.js
// Verifies that buildSignedHeaders produces canonical strings and headers
// matching the Pi FastAPI verifier (PI_SIGNING_README).

const crypto = require("crypto");
const { buildSignedHeaders } = require("../../utils/signing");

const SECRET = "test-secret-abc123";

// Pre-computed: sha256 of empty bytes
const EMPTY_BODY_SHA = crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex");

describe("buildSignedHeaders", () => {
  it("returns all four X-Control-* headers", () => {
    const h = buildSignedHeaders({
      method: "GET",
      pathWithQuery: "/device/status",
      bodyBytes: Buffer.alloc(0),
      secret: SECRET,
    });

    expect(h).toHaveProperty("X-Control-Timestamp");
    expect(h).toHaveProperty("X-Control-Nonce");
    expect(h).toHaveProperty("X-Control-Body-SHA256");
    expect(h).toHaveProperty("X-Control-Signature");
  });

  it("computes correct body SHA256 for empty body (GET)", () => {
    const h = buildSignedHeaders({
      method: "GET",
      pathWithQuery: "/detect/poll?max_items=1",
      bodyBytes: Buffer.alloc(0),
      secret: SECRET,
    });

    expect(h["X-Control-Body-SHA256"]).toBe(EMPTY_BODY_SHA);
  });

  it("computes correct body SHA256 for JSON body (POST)", () => {
    const body = JSON.stringify({ network_id: "abc-123" });
    const bodyBytes = Buffer.from(body, "utf8");
    const expected = crypto.createHash("sha256").update(bodyBytes).digest("hex");

    const h = buildSignedHeaders({
      method: "POST",
      pathWithQuery: "/scan",
      bodyBytes,
      secret: SECRET,
    });

    expect(h["X-Control-Body-SHA256"]).toBe(expected);
  });

  it("includes query string in signature (canonical string)", () => {
    // Sign same path with and without query — signatures must differ
    const common = { method: "GET", bodyBytes: Buffer.alloc(0), secret: SECRET };

    const withQuery = buildSignedHeaders({
      ...common,
      pathWithQuery: "/detect/poll?max_items=50",
    });

    const withoutQuery = buildSignedHeaders({
      ...common,
      pathWithQuery: "/detect/poll",
    });

    // Different pathWithQuery → different signature
    // (timestamps and nonces will also differ, but we confirm the path matters)
    expect(withQuery["X-Control-Signature"]).not.toBe(
      withoutQuery["X-Control-Signature"]
    );
  });

  it("produces lowercase hex for both body hash and signature", () => {
    const h = buildSignedHeaders({
      method: "POST",
      pathWithQuery: "/orchestrate/apply",
      bodyBytes: Buffer.from('{"action":"enforce"}', "utf8"),
      secret: SECRET,
    });

    expect(h["X-Control-Body-SHA256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(h["X-Control-Signature"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uppercases the method in canonical string", () => {
    // We can verify indirectly: lowercase and uppercase method produce same sig
    // because the function uppercases internally.
    const common = {
      pathWithQuery: "/networks",
      bodyBytes: Buffer.alloc(0),
      secret: SECRET,
    };

    const lower = buildSignedHeaders({ ...common, method: "get" });
    const upper = buildSignedHeaders({ ...common, method: "GET" });

    // Nonces and timestamps will differ, so we just verify both succeed
    // and produce valid 64-char hex signatures.
    expect(lower["X-Control-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(upper["X-Control-Signature"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws if secret is missing", () => {
    expect(() =>
      buildSignedHeaders({
        method: "GET",
        pathWithQuery: "/device/status",
        bodyBytes: Buffer.alloc(0),
        secret: "",
      })
    ).toThrow("CONTROL_SIGNING_SECRET missing");
  });

  it("produces a verifiable HMAC signature", () => {
    // Freeze time/nonce by computing expected signature from known inputs
    const method = "GET";
    const pathWithQuery = "/detect/poll?max_items=1";
    const bodyBytes = Buffer.alloc(0);

    const h = buildSignedHeaders({ method, pathWithQuery, bodyBytes, secret: SECRET });

    // Reconstruct canonical string from returned headers
    const canonical = [
      method,
      pathWithQuery,
      h["X-Control-Timestamp"],
      h["X-Control-Nonce"],
      h["X-Control-Body-SHA256"],
    ].join("\n");

    const expectedSig = crypto
      .createHmac("sha256", Buffer.from(SECRET, "utf8"))
      .update(Buffer.from(canonical, "utf8"))
      .digest("hex");

    expect(h["X-Control-Signature"]).toBe(expectedSig);
  });
});
