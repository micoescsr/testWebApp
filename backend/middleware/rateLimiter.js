// middleware/rateLimiter.js
// ─── Rate limiting (Phase 1-D from Security Hardening Plan) ─────────
// In-memory store — resets on restart, not shared across instances.
// For multi-instance (Railway auto-scale): swap to rate-limit-redis.

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,                     // 10 login attempts per window per IP
  standardHeaders: true,       // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,        // Disable `X-RateLimit-*` headers
  message: { error: 'Too many login attempts, please try again later' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 refresh attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts' },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // 300 requests per window per IP for all other routes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

module.exports = { loginLimiter, refreshLimiter, globalLimiter };
