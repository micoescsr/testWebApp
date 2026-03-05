// utils/piFetch.js
// Centralized Pi FastAPI caller with HMAC signing.
// Every Express → Pi request goes through this helper so signing
// is consistent and cannot be accidentally skipped.

const { buildSignedHeaders } = require("./signing");

// PI_BASE_URL is canonical; FASTAPI_BASE_URL kept as migration fallback.
const PI_BASE_URL = () =>
  process.env.PI_BASE_URL || process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000";

const SIGNING_SECRET = () => process.env.CONTROL_SIGNING_SECRET || "";

/**
 * Fetch a Pi FastAPI endpoint with HMAC-signed headers.
 *
 * @param {string} path       - URL path, may include query string
 *                               (e.g. "/device/status" or "/detect/poll?max_items=50").
 * @param {Object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {Object} [opts.jsonBody]     - Will be JSON-stringified and sent as body.
 * @param {string} [opts.query]        - Querystring to append (e.g. "max_items=50").
 *                                        Merged into path for URL and signing.
 * @param {Object} [opts.extraHeaders] - Additional headers to merge.
 * @param {number} [opts.timeoutMs=10000] - Abort timeout in milliseconds.
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function piFetch(path, {
  method = "GET",
  jsonBody,
  query,
  extraHeaders = {},
  timeoutMs = 10_000,
} = {}) {
  const base = PI_BASE_URL();
  const secret = SIGNING_SECRET();

  // Build full path with query — used for both URL and signing.
  let pathWithQuery = path;
  if (query) {
    pathWithQuery += (path.includes("?") ? "&" : "?") + query;
  }

  const url = `${base}${pathWithQuery}`;

  // Body bytes must match exactly what gets sent
  let bodyBytes = Buffer.alloc(0);
  let body;
  const headers = { ...extraHeaders };

  if (jsonBody !== undefined) {
    const s = JSON.stringify(jsonBody);
    bodyBytes = Buffer.from(s, "utf8");
    body = s;
    headers["Content-Type"] = "application/json";
  }

  // Sign using full pathWithQuery — matches Pi verifier (PI_SIGNING_README).
  if (secret) {
    const signed = buildSignedHeaders({ method, pathWithQuery, bodyBytes, secret });
    Object.assign(headers, signed);
  }

  // Accept JSON by default
  if (!headers["Accept"]) headers["Accept"] = "application/json";

  // Abort controller for timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Always return — let callers decide how to handle non-OK responses.
    // This avoids swallowing status-specific logic at call sites.
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);

    // Wrap network/timeout errors
    const wrapped = new Error(
      err.name === "AbortError"
        ? `Pi request timed out after ${timeoutMs}ms`
        : `Pi request failed: ${err.message}`
    );
    wrapped.status = 504;
    wrapped.data = { error: "pi_unreachable", detail: wrapped.message };
    throw wrapped;
  }
}

module.exports = { piFetch };
