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
 * Should signing be enforced right now?
 * Production: always.  Dev: skip ONLY if PI_SIGNING_OPTIONAL=true.
 */
function signingRequired() {
  const env = (process.env.NODE_ENV || "development").toLowerCase();
  if (env === "production") return true;
  return process.env.PI_SIGNING_OPTIONAL !== "true";
}

/**
 * Fetch a Pi FastAPI endpoint with HMAC-signed headers.
 *
 * @param {string} path       - URL path (e.g. "/device/status" or "/detect/poll").
 * @param {Object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {Object} [opts.jsonBody]     - Will be JSON-stringified and sent as body.
 * @param {string|Object} [opts.query] - Querystring to append.
 *                                        String: "max_items=50" (no leading "?").
 *                                        Object: { max_items: 50 } — serialized via URLSearchParams.
 * @param {Object} [opts.extraHeaders] - Additional headers to merge.
 * @param {number} [opts.timeoutMs=10000] - Abort timeout in milliseconds.
 * @returns {Promise<{ ok: boolean, status: number, data: any, rawText: string }>}
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

  // Normalize query — accept string or object
  let qs = "";
  if (query && typeof query === "object") {
    qs = new URLSearchParams(query).toString();
  } else if (query) {
    qs = String(query);
  }

  // Build full path with query — used for both URL and signing.
  let pathWithQuery = path;
  if (qs) {
    pathWithQuery += (path.includes("?") ? "&" : "?") + qs;
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
  } else if (signingRequired()) {
    // Never silently omit signing in production.
    throw new Error(
      "CONTROL_SIGNING_SECRET is not set — cannot sign Pi request. " +
      "Set PI_SIGNING_OPTIONAL=true in dev or provide the secret."
    );
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

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }

    // Log non-OK responses (never log secrets or full signature).
    if (!res.ok) {
      console.error(
        `[piFetch] ${method} ${pathWithQuery} → ${res.status}`,
        typeof data === "object" ? (data.detail || data.error || "") : ""
      );
    }

    // Always return — let callers decide how to handle non-OK responses.
    // This avoids swallowing status-specific logic at call sites.
    return { ok: res.ok, status: res.status, data, rawText };
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
