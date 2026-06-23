// server.js

require("dotenv").config();

// ── Fail-fast env validation (Phase 1-I) ─────────────────────────────
// Must run BEFORE any Express setup so we crash immediately on bad config.
const { validateEnv } = require("./config/envValidation");
validateEnv();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { piFetch } = require("./utils/piFetch");

const webAppRoutes = require("./routes/webAppRoutes");
const rasPiRoutes = require("./routes/rasPiRoutes");
const samRoutes = require("./routes/samRoutes");
const captivePortalRoutes = require("./routes/captivePortalRoutes");
//const scanRoutes = require('./routes/scanRoutes');
const deviceMgmtRoutes = require('./routes/deviceMgmtRoutes');
const authRoutes = require('./routes/authRoutes');
const auditRoutes = require('./routes/auditRoutes');
const detectRoutes = require('./routes/detectRoutes');
const historyRoutes = require('./routes/historyRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const piProxyRoutes = require('./routes/piProxyRoutes');
const mfaRoutes = require('./routes/mfaRoutes');
const detectStateService = require('./services/detectStateService');
const { requestIdMiddleware } = require('./middleware/requestIdMiddleware');

const { authJWT } = require("./middleware/authMiddleware");
const { requireActiveProfile } = require("./middleware/statusMiddleware");
const { requireAAL2 } = require("./middleware/mfaMiddleware");
const { supabaseClient } = require("./config/supabaseClient");

const app = express();

// ── Trust proxy (Phase 1-A) ──────────────────────────────────────────
// Railway uses a single-layer reverse proxy. Without this, express-rate-limit
// keys on the proxy IP (all users share one bucket) and req.ip is wrong.
app.set('trust proxy', 1);

// Hide Express fingerprint on ALL responses (including pre-middleware health check)
app.disable('x-powered-by');

// ── Health check (Phase 2-new) ──────────────────────────────────────
// Placed BEFORE any middleware so Railway uptime probes are never blocked
// by rate limiting, auth, or CORS.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Pi smoke test (deploy verification) ─────────────────────────────
// Calls /device/status through piFetch to confirm signing + connectivity.
// Protected: in production requires Authorization: Bearer <INTERNAL_SMOKE_TOKEN>.
// In dev (no token configured) it's open for convenience.
app.get('/internal/pi-smoke', async (req, res) => {
  const token = process.env.INTERNAL_SMOKE_TOKEN;
  if (token) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${token}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const { ok, status, data } = await piFetch('/device/status', { timeoutMs: 8000 });
    res.json({ pi_reachable: ok, pi_status: status, pi_data: data });
  } catch (err) {
    console.error('[pi-smoke] error:', err);
    res.status(502).json({
      pi_reachable: false,
      error: 'Pi unreachable',
    });
  }
});

app.use(cookieParser());

// ── Helmet + CSP (Phase 1-C) ────────────────────────────────────────
const connectSources = ["'self'"];
const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
if (appEnv === 'production') {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    connectSources.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }
  if (process.env.SUPABASE_URL) {
    connectSources.push(process.env.SUPABASE_URL);
  }
} else {
  connectSources.push('http://localhost:*', 'ws://localhost:*');
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      connectSrc: connectSources,
      imgSrc:     ["'self'", "data:", "blob:"],
    },
  },
  hsts: appEnv === 'production',
}));

// ── CORS (Phase 4-A) ────────────────────────────────────────────────
// Env-based origins: ALLOWED_ORIGINS="https://prod.example.com,https://www.prod.example.com"
// Falls back to Vite dev server for local development.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(requestIdMiddleware);

// ── Global rate limiter (Phase 1-F) ─────────────────────────────────
// Applied AFTER health check so uptime probes aren't throttled.
const { globalLimiter } = require('./middleware/rateLimiter');
app.use(globalLimiter);
app.use("/api/webapp", webAppRoutes); 
app.use("/api/rasPi", rasPiRoutes); //dpt ilagay dito ung raspi scan and detect routes
//app.use('/api/rasPi_scan', scanRoutes);
app.use('/api/device', deviceMgmtRoutes);
app.use('/api/sam', samRoutes);
app.use('/api/captivePortal', captivePortalRoutes);

// 6) Dashboard (JWT-protected, aggregated data)
app.use('/api/dashboard', dashboardRoutes);

// 1) Public auth routes (no JWT / status)
app.use("/api/auth", authRoutes); // /api/auth/login

// 1b) MFA enrollment/recovery routes
app.use("/api/auth/mfa", mfaRoutes);

// 2) Audit routes (superadmin only, JWT + role enforced per-route)
app.use("/api/audit", auditRoutes);

// 3) Detection lifecycle + poll (JWT-protected per-route)
app.use("/api/detect", detectRoutes);

// 4) History (JWT-protected, user-scoped per controller logic)
app.use("/api/history", historyRoutes);

// 5) Pi proxy (signed requests to Pi gateway)
app.use("/api/pi", piProxyRoutes);

// Phase 2-E: Dead global-auth middleware removed.
// Auth is now enforced per-route (Phase 2-A/B/C/D).
// Keeping this commented block was a false-safety trap —
// it looked like blanket auth existed when it didn't.

// Phase 2-D: Device status requires JWT (browser-called)
app.get("/api/device/status", authJWT, requireActiveProfile, requireAAL2, async (req, res) => {
  try {
    const { status, data } = await piFetch("/device/status");
    return res.status(status).json(data);
  } catch (err) {
    console.error('[device/status] FastAPI proxy error:', err);
    return res.status(err.status || 502).json({
      status: "ERROR",
      error: "Failed to reach device status endpoint",
    });
  }
});

// Old /api/detect/poll handler removed — now in controllers/detectController.js via detectRoutes

// Legacy helpers (getRiskLabel, loadThreatDefinitions, mapPollResultsToThreatRows,
// persistThreatRows) removed — canonical versions live in detectController.js
// and utils/scoring.js. See commit history for the original code.

//========================================
// History endpoints moved to controllers/historyController.js + routes/historyRoutes.js
// Mounted at: app.use("/api/history", historyRoutes)
// Endpoints:
//   GET /api/history/vulnerabilities  (JWT required, user-scoped)
//   GET /api/history/threats          (JWT required, user-scoped)
//========================================


// ─── Announcement / Terms / Tips / Risk / Portal Sync ────────────
// Moved to controllers/captivePortalController.js + routes/captivePortalRoutes.js
// Mounted at: app.use('/api/captivePortal', captivePortalRoutes)
// Endpoints:
//   GET  /api/captivePortal/announcement?network_id=
//   GET  /api/captivePortal/announcement/history?network_id=
//   POST /api/captivePortal/announcement            { content, network_id }
//   GET  /api/captivePortal/tips?network_id=
//   POST /api/captivePortal/tips                    { network_id, tips: [...] }
//   GET  /api/captivePortal/risk-classifications
//   GET  /api/captivePortal/summary?network_id=&score=
//   POST /api/captivePortal/sync                    { network_id, score? }

// NOTE: /enable-ap moved to routes/deviceMgmtRoutes.js

// The networks-by-id GET was moved into the rasPi router (rasPiRoutes)
// so that all rasPi-related endpoints live under /api/rasPi.



// COMMENTED OUT (moved to controllers/userController.js + routes/userRoutes.js for alignment)
// async function getCurrentUserRole(userId) {
//   const { data, error } = await supabaseClient
//     .from("profiles")
//     .select("role")
//     .eq("id", userId)
//     .single();
//
//   if (error) throw error;
//   return data.role;
// }

// app.post(
//   "/api/webApp/users/profiles/:id/activate-with-temp",
//   authJWT,
//   async (req, res) => { /* now handled in userRoutes/userController */ }
// );


// ── Global error handler (Phase 6 — error leak prevention) ──────────
// Express 4 error middleware must have exactly 4 params: (err, req, res, next).
// This catches unhandled throw / next(err) from any route or middleware
// and returns a safe generic message — no stack traces, no internal details.
app.use((err, _req, res, _next) => {
  // JSON parse errors from express.json()
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'INVALID_JSON', message: 'Malformed JSON in request body' });
  }
  // CORS errors
  if (err.message === 'CORS not allowed') {
    return res.status(403).json({ error: 'CORS_REJECTED' });
  }
  // Everything else — log internally, return generic
  console.error(`[global-error] ${err.message}`, { stack: err.stack });
  return res.status(err.status || 500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
});

const PORT = process.env.PORT || 3000;
const { execSync } = require('child_process');

function killPort(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8' }
    );
    const pids = [...new Set(
      out.trim().split('\n')
        .map(l => l.trim().split(/\s+/).pop())
        .filter(p => p && p !== '0')
    )];
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`Killed stale process PID ${pid} on port ${port}`);
      } catch (_) { /* already dead */ }
    }
    return pids.length > 0;
  } catch (_) {
    return false; // nothing listening
  }
}

let retried = false;

function startServer() {
  const server = app.listen(PORT, async () => {
    console.log(`API running on http://localhost:${PORT}`);
    // Ensure detection_state row exists on startup
    try {
      await detectStateService.ensureRow();
      console.log("[startup] detection_state row ensured");

      // Start server-side heartbeat loop — pings FastAPI independently
      // of any browser tab, so detection doesn't FAIL when users are idle.
      detectStateService.startServerHeartbeatLoop();
    } catch (err) {
      console.error("[startup] Failed to ensure detection_state row:", err.message);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !retried) {
      retried = true;
      console.log(`⚠️  Port ${PORT} in use — auto-killing stale process...`);
      if (killPort(PORT)) {
        setTimeout(() => startServer(), 1000);
      } else {
        console.error(`❌ Port ${PORT} is in use but could not identify the process. Kill it manually.`);
        process.exit(1);
      }
    } else if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} still in use after retry. Kill it manually.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
}

startServer();

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});