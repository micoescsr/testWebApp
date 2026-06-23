// middleware/statusMiddleware.js
//
// Defense-in-depth: rejects non-active profiles even if authJWT passed.
// When authJWT already verified the profile (req.user.profileStatus is set),
// this middleware reuses that result to avoid a duplicate DB round-trip.
// If placed in a chain without authJWT, falls back to its own DB query.
const { createClient } = require("@supabase/supabase-js");
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.requireActiveProfile = async (req, res, next) => {
  const supaUser = req.user;
  if (!supaUser?.id) {
    return res.status(401).json({ error: "No authenticated user" });
  }

  // Fast path: authJWT already verified status and stamped it on req.user
  if (supaUser.profileStatus === "active") {
    return next();
  }

  // Slow path: authJWT didn't run or didn't stamp — query DB directly
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("status")
    .eq("id", supaUser.id)
    .single();

  if (error || !profile) {
    return res.status(401).json({ error: "Profile not found" });
  }

  if (profile.status !== "active") {
    return res.status(403).json({
      error: "Account is not active",
      status: profile.status,
    });
  }

  next();
};
