// Login.jsx
import "./Login.css";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import api, { setAccessToken } from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { Link } from "react-router-dom";
import MFAChallenge from "../Auth/MFAChallenge";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState(null);

  // Steps that used to run unconditionally right after password sign-in.
  // Now shared between "no MFA challenge needed" and "challenge verified"
  // paths, since both end up with a session to finish logging in with.
  const finishLogin = async (session) => {
    try {
      // 2) Store access token in memory for axios
      setAccessToken(session.access_token);

      // 3) Send refresh token to backend → HttpOnly cookie
      await api.post("auth/set-refresh", {
        refresh_token: session.refresh_token,
      });

      // 4) Check profile status (Bearer from memory now)
      const res = await api.get("webapp/users/profiles/me");
      const profile = res?.data ?? null;

      // Defensive: normalize possible response shapes and avoid reading
      // properties from undefined (which caused the console error).
      const status = profile?.status ?? profile?.profile?.status ?? null;
      if (!status) {
        await api.post("auth/logout");
        setAccessToken(null);
        setError("Unable to verify account status. Please try again.");
        setLoading(false);
        setMfaFactorId(null);
        return;
      }

      if (status !== "active") {
        await api.post("auth/logout");
        setAccessToken(null);

        const statusMessages = {
          on_hold: "Your account is currently on hold. Please contact the administrator to restore access.",
          inactive: "Your account has been deactivated. Please contact the administrator.",
        };
        setError(statusMessages[status] || "Your account is not active. Please contact the administrator.");
        setLoading(false);
        setMfaFactorId(null);
        return;
      }

      // 5) Check if a forced password reset is required (temp password was issued)
      // AUTH-009: must_change_password flag set by backend when a superadmin issues a temp password.
      // Guard: only redirect if the flag is set AND temp_expires_at exists AND hasn't expired.
      // Without the expiry check, an established user whose clear-force-reset call ever failed
      // silently would be permanently trapped on the force-reset page.
      const mustReset = (() => {
        if (!profile?.must_change_password) return false;
        if (!profile?.temp_expires_at) return false; // flag set but no expiry — treat as stale
        return new Date(profile.temp_expires_at) > new Date(); // only redirect if still within window
      })();

      if (mustReset) {
        window.location.replace("/force-reset-password");
        return;
      }

      // 6) All good — full navigation so App bootstraps from cookie
      window.location.replace("/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
      setAccessToken(null);
      setError(getApiErrorMessage(err, "Login failed. Please try again."));
      setLoading(false);
      setMfaFactorId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1) Sign in via Supabase JS (tokens NOT persisted — persistSession: false)
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const session = data.session;
      if (!session) throw new Error("No session returned");

      // Prime the Supabase JS client session so supabase.auth.mfa.* calls
      // below have something to attach to (persistSession: false means
      // there's no session by default — same pattern as ForceResetPassword).
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (sessionError) {
        setError(sessionError.message || "Failed to establish session.");
        setLoading(false);
        return;
      }

      const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        setError(aalError.message || "Failed to check MFA status.");
        setLoading(false);
        return;
      }

      if (aalData.nextLevel === "aal2" && aalData.currentLevel === "aal1") {
        const { data: factorsData, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) {
          setError(factorsError.message || "Failed to load MFA factors.");
          setLoading(false);
          return;
        }

        const factor = factorsData.totp[0];
        if (!factor) {
          setError("MFA is required but no authenticator is enrolled. Contact an administrator.");
          setLoading(false);
          return;
        }

        setMfaFactorId(factor.id);
        return;
      }

      // No challenge needed (e.g. brand-new account with no factor enrolled
      // yet) — proceed; the forced /mfa-setup gate catches this case.
      await finishLogin(session);
    } catch (err) {
      console.error("Login failed:", err);
      setAccessToken(null);
      setError(getApiErrorMessage(err, "Login failed. Please try again."));
      setLoading(false);
    }
  };

  if (mfaFactorId) {
    return (
      <MFAChallenge
        factorId={mfaFactorId}
        onVerified={(session) => finishLogin(session)}
        onCancel={() => {
          setMfaFactorId(null);
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
        <h1 className="login-title">Login to your account</h1>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* ADDED Forgot password link here */}
          <p className="forgot-password-text">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Logging in..." : "Login now"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
