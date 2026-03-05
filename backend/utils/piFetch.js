// utils/piFetch.js
// Centralized Pi FastAPI caller with HMAC signing.
// Every Express → Pi request goes through this helper so signing
// is consistent and cannot be accidentally skipped.

const { buildSignedHeaders } = require("./signing");

const PI_BASE_URL = () =>
  process.env.PI_BASE_URL || process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000";

const SIGNING_SECRET = () => process.env.CONTROL_SIGNING_SECRET || "";

/**
 * Fetch a Pi FastAPI endpoint with HMAC-signed headers.
 *
 * @param {string} path       - URL path (e.g. "/device/status"). NO querystring.
 * @param {Object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {Object} [opts.jsonBody]     - Will be JSON-stringified and sent as body.
 * @param {string} [opts.query]        - Querystring to append (e.g. "max_items=50").
 *                                        Included in the signature (matches Pi verifier).
 * @param {Object} [opts.extraHeaders] - Additional headers to merge (e.g. x-portal-token).
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

  // Build URL (path + optional querystring)
  let url = `${base}${path}`;
  if (query) url += `?${query}`;

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

  // Sign using path WITH query — matches Pi verifier canonical string
  if (secret) {
    let pathWithQuery = path;
    if (query) pathWithQuery += `?${query}`;
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
