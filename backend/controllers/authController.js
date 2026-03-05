
// backend/controllers/authController.js
const { logAuditEvent } = require("../utils/auditLogger");
const { supabaseClient } = require("../config/supabaseClient");

// ── cookie options (Phase 1-J) ──────────────────────────
// If frontend and backend share the same Railway domain (single service):
//   sameSite: "lax"   ← stronger CSRF protection, cookies travel with same-site nav
// If frontend and backend are on DIFFERENT domains (separate Railway services):
//   sameSite: "none"  ← required for cross-origin cookies; Secure is mandatory
//
// CROSS_ORIGIN_COOKIES=true opts into the cross-origin mode. Default is same-origin.
function refreshCookieOpts() {
  const isProd = process.env.NODE_ENV === "production";
  const crossOrigin = process.env.CROSS_ORIGIN_COOKIES === "true";

  return {
    httpOnly: true,
    secure: isProd || crossOrigin, // always true when cross-origin (browsers require it)
    sameSite: crossOrigin ? "none" : "lax",
    path: "/api/auth", // cookie only sent to /api/auth/*
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

// ── CSRF origin check (Fix #1) ──────────────────────────
// Browser requests always send Origin on POST.
// Non-browser clients (Postman/cURL) typically omit Origin.
// In dev: allow missing Origin so Postman works.
// In prod: require Origin and it must be in the allow-list.
//
// Reads ALLOWED_ORIGINS from env (same source as CORS in server.js) so
// the allow-list stays consistent and works in Railway production.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function assertOrigin(req) {
  const origin = req.headers.origin;
  const isProd = process.env.NODE_ENV === "production";

  if (!origin) {
    // No Origin header — non-browser client
    if (isProd) {
      const err = new Error("Origin header required");
      err.status = 403;
      throw err;
    }
    // In dev/test: allow (Postman, cURL)
    return;
  }

  if (!allowedOrigins.includes(origin)) {
    const err = new Error("Forbidden origin");
    err.status = 403;
    throw err;
  }
}

// ── Supabase token refresh helper ───────────────────────
// Uses SUPABASE_ANON_KEY (public key), NOT service role.
async function supabaseRefresh(refreshToken) {
  const url = `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const json = await r.json();
  if (!r.ok) {
    const msg = json?.error_description || json?.error || "Refresh failed";
    throw new Error(msg);
  }
  return json; // { access_token, refresh_token, expires_in, ... }
}

// ── POST /api/auth/login ────────────────────────────────
// (Fix #2) Uses Supabase REST endpoint with anon key — no service role.
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const url = `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const json = await r.json();
    if (!r.ok) {
      const msg = json?.error_description || json?.error || "Login failed";

      // Audit: failed login — look up profile by email for FK
      let failedActorId = json?.user?.id || null;
      if (!failedActorId && email) {
        const { data: prof } = await supabaseClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        failedActorId = prof?.id || null;
      }
      if (failedActorId) {
        await logAuditEvent({
          req,
          actorId: failedActorId,
          eventName: "LOGIN_FAILED",
          eventStatus: "FAILED",
          entityType: "AUTH",
          entityIdUuid: failedActorId,
          meta: { email, reason: msg },
        }).catch(() => {});
      }
      // If no profile exists for this email, skip audit (can't satisfy FK)

      return res.status(401).json({ error: msg });
    }

    // Audit: successful login
    if (json?.user?.id) {
      await logAuditEvent({
        req,
        actorId: json.user.id,
        eventName: "LOGIN_SUCCESS",
        eventStatus: "SUCCESS",
        entityType: "AUTH",
        entityIdUuid: json.user.id,
      }).catch(() => {});
    }

    // ── Check temp password expiry ──────────────────────
    // If user has must_change_password and temp_expires_at has passed,
    // block login and tell them to request a new temp password.
    if (json?.user?.id) {
      const { data: prof } = await supabaseClient
        .from("profiles")
        .select("must_change_password, temp_expires_at")
        .eq("id", json.user.id)
        .maybeSingle();

      if (prof?.must_change_password && prof?.temp_expires_at) {
        const expiresAt = new Date(prof.temp_expires_at);
        if (expiresAt < new Date()) {
          // Temp PW expired — block login
          await logAuditEvent({
            req,
            actorId: json.user.id,
            eventName: "LOGIN_TEMP_EXPIRED",
            eventStatus: "FAILED",
            entityType: "AUTH",
            entityIdUuid: json.user.id,
            meta: { email, temp_expires_at: prof.temp_expires_at },
          }).catch(() => {});

          return res.status(401).json({
            error: "Temporary password has expired. Please request a new one from your administrator.",
            code: "TEMP_PASSWORD_EXPIRED",
          });
        }
      }

      // Include must_change_password flag in response so frontend can redirect
      if (prof?.must_change_password) {
        return res.json({
          token: json.access_token,
          user: json.user,
          mustChangePassword: true,
          tempExpiresAt: prof.temp_expires_at,
        });
      }
    }

    res.json({ token: json.access_token, user: json.user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ── POST /api/auth/set-refresh ──────────────────────────
// Called once after frontend login to persist refresh token as HttpOnly cookie.
exports.setRefresh = async (req, res) => {
  try {
    assertOrigin(req);
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: "Missing refresh_token" });
    }
    const opts = refreshCookieOpts();
    console.log("[auth/set-refresh] setting cookie, token length:", refresh_token.length, "opts:", JSON.stringify(opts));
    res.cookie("sb_refresh", refresh_token, opts);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};

// ── POST /api/auth/refresh ──────────────────────────────
// Reads HttpOnly cookie, exchanges with Supabase for new tokens.
exports.refresh = async (req, res) => {
  try {
    assertOrigin(req);

    // ── DEBUG: remove after testing ─────────────────────
    console.log("[auth/refresh] cookies:", JSON.stringify(req.cookies));
    console.log("[auth/refresh] raw cookie header:", req.headers.cookie);
    // ────────────────────────────────────────────────────

    const rt = req.cookies?.sb_refresh;
    if (!rt) return res.status(401).json({ error: "No refresh cookie" });

    const data = await supabaseRefresh(rt);

    // Rotate cookie if Supabase returned a new refresh token
    if (data.refresh_token) {
      res.cookie("sb_refresh", data.refresh_token, refreshCookieOpts());
    }

    // Audit: token refresh success (fire-and-forget)
    if (data.user?.id) {
      logAuditEvent({
        req,
        actorId: data.user.id,
        eventName: "AUTH.REFRESH",
        eventStatus: "SUCCESS",
        entityType: "AUTH",
        entityIdUuid: data.user.id,
      }).catch(() => {});
    }

    return res.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch (e) {
    // Clear bad cookie so user can re-login cleanly
    res.clearCookie("sb_refresh", { path: "/api/auth" });
    return res.status(401).json({ error: e.message || "Refresh failed" });
  }
};

// ── POST /api/auth/logout ───────────────────────────────
exports.logout = async (req, res) => {
  res.clearCookie("sb_refresh", { path: "/api/auth" });

  // Audit: logout (actor available via optionalAuthJWT)
  const actorId = req.user?.id;
  if (actorId) {
    logAuditEvent({
      req,
      actorId,
      eventName: "AUTH.LOGOUT",
      eventStatus: "SUCCESS",
      entityType: "AUTH",
      entityIdUuid: actorId,
    }).catch(() => {});
  }

  return res.json({ ok: true });
};

