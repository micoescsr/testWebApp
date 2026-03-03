// middleware/requestIdMiddleware.js
//
// Generates a unique UUID (v4) for every incoming request and attaches it
// to `req.requestId`. This ID is propagated into audit log entries for
// end-to-end request correlation / tracing.

const crypto = require("crypto");

/**
 * Middleware: attach a unique request ID to every request.
 *
 * - If the client sends an `x-request-id` header it is reused (useful for
 *   distributed tracing), otherwise a new UUID v4 is generated.
 * - The ID is also set on the response via `x-request-id` so that clients
 *   and load-balancers can correlate responses.
 */
function requestIdMiddleware(req, res, next) {
  const id = req.headers["x-request-id"] || crypto.randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

module.exports = { requestIdMiddleware };
