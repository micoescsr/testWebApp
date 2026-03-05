// utils/signing.js
//
// Build HMAC-SHA256 signed headers for the Pi FastAPI nginx gateway.
//
// Canonical string (newline-separated):
//   METHOD\nPATH_WITH_QUERY\nTS\nNONCE\nSHA256(body)
//
// Headers produced:
//   X-Control-Timestamp   – epoch seconds (integer string)
//   X-Control-Nonce       – 16-byte random hex (32 chars)
//   X-Control-Body-SHA256 – hex SHA-256 of body bytes
//   X-Control-Signature   – hex HMAC-SHA256 of canonical string

const crypto = require("crypto");

/**
 * Build signed headers for Pi FastAPI gateway.
 *
 * @param {Object} opts
 * @param {string} opts.method        - HTTP method (GET, POST, …)
 * @param {string} opts.pathWithQuery - URL path including query string (e.g. "/detect/poll?max_items=50")
 * @param {Buffer} opts.bodyBytes     - Exact bytes being sent (Buffer.alloc(0) for GET)
 * @param {string} opts.secret        - CONTROL_SIGNING_SECRET
 * @returns {Object} The four X-Control-* headers
 */
function buildSignedHeaders({ method, pathWithQuery, bodyBytes, secret }) {
  if (!secret) throw new Error("CONTROL_SIGNING_SECRET missing");

  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex"); // 32 hex chars

  const bodyHashHex = crypto
    .createHash("sha256")
    .update(bodyBytes)
    .digest("hex");

  // Canonical string: newline-separated, path includes query
  const canonical = `${method.toUpperCase()}\n${pathWithQuery}\n${ts}\n${nonce}\n${bodyHashHex}`;

  const sigHex = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(canonical, "utf8"))
    .digest("hex");

  return {
    "X-Control-Timestamp": ts,
    "X-Control-Nonce": nonce,
    "X-Control-Body-SHA256": bodyHashHex,
    "X-Control-Signature": sigHex,
  };
}

module.exports = { buildSignedHeaders };
