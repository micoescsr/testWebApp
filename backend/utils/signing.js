// utils/signing.js
// Build HMAC-SHA256 signed headers for Pi FastAPI gateway.
// Matches Pi verifier (PI_SIGNING_README):
//   Canonical string = METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nBODY_SHA256
//   Headers: X-Control-Timestamp, X-Control-Nonce, X-Control-Body-SHA256, X-Control-Signature

const crypto = require("crypto");

/**
 * Build signed headers for Pi FastAPI gateway.
 *
 * @param {Object} opts
 * @param {string} opts.method     - HTTP method (GET, POST, …) — uppercased internally
 * @param {string} opts.pathWithQuery - URL path INCLUDING query string (e.g. "/detect/poll?max_items=50")
 * @param {Buffer} opts.bodyBytes  - Exact bytes being sent (Buffer.alloc(0) for GET)
 * @param {string} opts.secret     - CONTROL_SIGNING_SECRET
 * @returns {{
 *   "X-Control-Timestamp": string,
 *   "X-Control-Nonce": string,
 *   "X-Control-Body-SHA256": string,
 *   "X-Control-Signature": string
 * }}
 */
function buildSignedHeaders({ method, pathWithQuery, bodyBytes, secret }) {
  if (!secret) throw new Error("CONTROL_SIGNING_SECRET missing");

  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();

  const bodySha256 = crypto
    .createHash("sha256")
    .update(bodyBytes)
    .digest("hex");

  // Canonical string: newline-separated, METHOD is uppercase
  const canonical = [
    method.toUpperCase(),
    pathWithQuery,
    ts,
    nonce,
    bodySha256,
  ].join("\n");

  const signature = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(canonical, "utf8"))
    .digest("hex");

  return {
    "X-Control-Timestamp": ts,
    "X-Control-Nonce": nonce,
    "X-Control-Body-SHA256": bodySha256,
    "X-Control-Signature": signature,
  };
}

module.exports = { buildSignedHeaders };
