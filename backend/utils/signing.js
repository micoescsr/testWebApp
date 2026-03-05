// utils/signing.js
// Build HMAC-SHA256 signed headers for Pi FastAPI gateway.
// Matches Pi verifier: METHOD|PATH|TS|NONCE|SHA256(body_bytes)

const crypto = require("crypto");

/**
 * Build signed headers for Pi FastAPI gateway.
 *
 * @param {Object} opts
 * @param {string} opts.method  - HTTP method (GET, POST, …)
 * @param {string} opts.path    - URL path only, no domain or querystring (e.g. "/device/status")
 * @param {Buffer} opts.bodyBytes - Exact bytes being sent (Buffer.alloc(0) for GET)
 * @param {string} opts.secret  - CONTROL_SIGNING_SECRET
 * @returns {{ "X-Req-Ts": string, "X-Req-Nonce": string, "X-Req-Sig": string }}
 */
function buildSignedHeaders({ method, path, bodyBytes, secret }) {
  if (!secret) throw new Error("CONTROL_SIGNING_SECRET missing");

  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();

  const bodyHashHex = crypto
    .createHash("sha256")
    .update(bodyBytes)
    .digest("hex");

  const msg = `${method.toUpperCase()}|${path}|${ts}|${nonce}|${bodyHashHex}`;

  const sigHex = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(msg, "utf8"))
    .digest("hex");

  return {
    "X-Req-Ts": ts,
    "X-Req-Nonce": nonce,
    "X-Req-Sig": sigHex,
  };
}

module.exports = { buildSignedHeaders };
