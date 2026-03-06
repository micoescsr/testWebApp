// services/piGatewayService.js
//
// Thin HTTP client that sends signed requests to the Pi FastAPI gateway
// (nginx on port 9000, exposed via Tailscale Funnel).
//
// Env vars required on Railway:
//   PI_BASE_URL             – e.g. https://mothership.ts.net
//   CONTROL_SIGNING_SECRET  – shared HMAC key (must match Pi)

const { buildSignedHeaders } = require("../utils/signing");

const PI_BASE_URL = () => process.env.PI_BASE_URL;
const SECRET = () => process.env.CONTROL_SIGNING_SECRET;

/**
 * Make a signed request to the Pi gateway.
 *
 * @param {string} path       – Pi endpoint path, e.g. "/device/status"
 * @param {object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {*}      [opts.jsonBody]       – Will be JSON-stringified and sent as body
 * @param {string} [opts.queryString]    – Raw query string to append (without leading ?)
 * @returns {Promise<object>}            – Parsed JSON response
 */
async function piFetch(path, { method = "GET", jsonBody = undefined, queryString = undefined } = {}) {
  const baseUrl = PI_BASE_URL();
  const secret = SECRET();

  if (!baseUrl) throw new Error("PI_BASE_URL env var is not set");
  if (!secret) throw new Error("CONTROL_SIGNING_SECRET env var is not set");

  // Build path with query (used both in URL and in the signature)
  let pathWithQuery = path;
  if (queryString) {
    pathWithQuery += `?${queryString}`;
  }
  const url = `${baseUrl}${pathWithQuery}`;

  // Body bytes must match exactly what we send
  let bodyBytes = Buffer.alloc(0);
  let body = undefined;
  const headers = {};

  if (jsonBody !== undefined) {
    const s = JSON.stringify(jsonBody);
    bodyBytes = Buffer.from(s, "utf8");
    body = s;
    headers["Content-Type"] = "application/json";
  }

  // Sign using path WITH query — matches Pi verifier canonical string
  const signed = buildSignedHeaders({
    method,
    pathWithQuery,
    bodyBytes,
    secret,
  });

  Object.assign(headers, signed);

  const res = await fetch(url, { method, headers, body });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`Pi request failed ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

module.exports = { piFetch };
