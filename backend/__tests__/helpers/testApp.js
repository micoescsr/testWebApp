// __tests__/helpers/testApp.js
// Creates a minimal Express app with real middleware & routes for supertest.
// External I/O (Supabase REST, FastAPI) is mocked at the `fetch` / module level.

const express = require("express");
const cookieParser = require("cookie-parser");

/**
 * Build an Express app configured identically to server.js but without listen().
 * Use jest.mock() in your test file to intercept Supabase / FastAPI calls.
 */
function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Mount auth routes (login, set-refresh, refresh, logout)
  const authRoutes = require("../../routes/authRoutes");
  app.use("/api/auth", authRoutes);

  // Mount rasPi routes (scan, networks, save)
  const rasPiRoutes = require("../../routes/rasPiRoutes");
  app.use("/api/rasPi", rasPiRoutes);

  // Mount device management routes
  const deviceMgmtRoutes = require("../../routes/deviceMgmtRoutes");
  app.use("/api/device", deviceMgmtRoutes);

  // Mount SAM routes (requires auth)
  const samRoutes = require("../../routes/samRoutes");
  app.use("/api/sam", samRoutes);

  // Simple protected endpoint for auth testing
  const { authJWT } = require("../../middleware/authMiddleware");
  const { requireActiveProfile } = require("../../middleware/statusMiddleware");
  const { requireAAL2 } = require("../../middleware/mfaMiddleware");

  app.get("/api/protected", authJWT, (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  app.get("/api/protected/active", authJWT, requireActiveProfile, (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  // AAL2-gated endpoint for MFA enforcement tests
  app.get("/api/protected/aal2", authJWT, requireAAL2, (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  // Admin-only endpoint for authorization tests
  app.get("/api/admin/users", authJWT, async (req, res) => {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin only" });
    }
    res.json({ users: [] });
  });

  return app;
}

module.exports = { createTestApp };
