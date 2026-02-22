// middleware/authMiddleware.js
// JWKS-based JWT verification for Supabase ECC (P-256) signed tokens.
// Fetches the public key set from Supabase's JWKS endpoint; jose caches it
// automatically so this does NOT make a network call on every request.
const { createRemoteJWKSet, jwtVerify } = require("jose");

// Build JWKS fetcher once at startup — jose handles caching & rotation.
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
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

    // payload contains: sub (user id), email, role, exp, iat, aud, etc.
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      aud: payload.aud,
    };
    next();
  } catch (err) {
    // err.code === "ERR_JWT_EXPIRED" for expired tokens, etc.
    console.log("[authJWT] verification FAILED:", err.code, err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};


