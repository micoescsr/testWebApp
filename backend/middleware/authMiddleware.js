// middleware/authMiddleware.js
// JWKS-based JWT verification for Supabase ECC (P-256) signed tokens.
// Fetches the public key set from Supabase's JWKS endpoint; jose caches it
// automatically so this does NOT make a network call on every request.
//
// Account-status enforcement (C8 fix): after JWT verification, the user's
// profile status is checked against the database. Inactive, on_hold, and
// other non-active statuses are rejected with 403. This ensures that
// deactivated users with still-valid JWTs cannot access any protected route.
const { createRemoteJWKSet, jwtVerify } = require("jose");
const { createClient } = require("@supabase/supabase-js");

// Build JWKS fetcher once at startup — jose handles caching & rotation.
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

// Admin client for profile status lookups (service role bypasses RLS).
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.authJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      // audience: Supabase sets aud to "authenticated" for logged-in users
      audience: "authenticated",
    });

    // payload contains: sub (user id), email, role, exp, iat, aud, aal, etc.
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      aud: payload.aud,
      aal: payload.aal || "aal1",
    };

    // ── Account-status enforcement (C8) ─────────────────────────
    // Check the user's profile status on every authenticated request.
    // This blocks deactivated/on_hold users even if their JWT is still valid.
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("status")
      .eq("id", payload.sub)
      .single();

    if (profileErr || !profile) {
      return res.status(401).json({ error: "Profile not found" });
    }

    if (profile.status !== "active") {
      return res.status(403).json({
        error: "Account is not active",
        status: profile.status,
      });
    }

    req.user.profileStatus = profile.status;
    next();
  } catch (err) {
    // err.code === "ERR_JWT_EXPIRED" for expired tokens, etc.
    console.error("[authJWT] verification failed:", err.code || "UNKNOWN");
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

/**
 * Optional JWT middleware: tries to verify the token and populate req.user,
 * but does NOT reject the request if the token is missing or invalid.
 * Useful for endpoints like /logout that should work regardless but benefit
 * from knowing the actor for audit logging.
 */
exports.optionalAuthJWT = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(); // no token — continue without req.user
  }

  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: "authenticated",
    });
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      aud: payload.aud,
      aal: payload.aal || "aal1",
    };
  } catch (_err) {
    // Token invalid/expired — ignore, req.user stays undefined
  }
  next();
};


