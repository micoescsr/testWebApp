import "./Login.css";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import api, { setAccessToken } from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { Link } from "react-router-dom";
import TwoFactorForm from "./TwoFactorForm";
import {
  GlobeHemisphereWest,
  EnvelopeSimple,
  LockSimple,
  Eye,
  EyeSlash,
  ArrowRight,
} from "@phosphor-icons/react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState(null);

  const finishLogin = async (session) => {
    try {
      setAccessToken(session.access_token);

      await api.post("auth/set-refresh", {
        refresh_token: session.refresh_token,
      });

      try {
        await api.post("auth/mfa/sync-status", {});
      } catch (syncErr) {
        console.error("mfa sync-status failed:", syncErr);
      }

      const res = await api.get("webapp/users/profiles/me");
      const profile = res?.data ?? null;

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
          on_hold:
            "Your account is currently on hold. Please contact the administrator to restore access.",
          inactive:
            "Your account has been deactivated. Please contact the administrator.",
        };
        setError(
          statusMessages[status] ||
            "Your account is not active. Please contact the administrator."
        );
        setLoading(false);
        setMfaFactorId(null);
        return;
      }

      const mustReset = (() => {
        if (!profile?.must_change_password) return false;
        if (!profile?.temp_expires_at) return false;
        return new Date(profile.temp_expires_at) > new Date();
      })();

      if (mustReset) {
        window.location.replace("/force-reset-password");
        return;
      }

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
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const session = data.session;
      if (!session) throw new Error("No session returned");

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
          setError(
            "MFA is required but no authenticator is enrolled. Contact an administrator."
          );
          setLoading(false);
          return;
        }

        setMfaFactorId(factor.id);
        return;
      }

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
      <TwoFactorForm
        factorId={mfaFactorId}
        email={email}
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
      <div className="login-backdrop">
        <div className="login-glow login-glow--one" />
        <div className="login-glow login-glow--two" />
      </div>

      <div className="login-card">
        <div className="login-app-mark">
          <GlobeHemisphereWest size={24} weight="duotone" />
        </div>
        <div className="login-wordmark">WHY-PII?</div>

        <h1>Log in to your account</h1>
        <p className="login-subhead">
          Wi-Fi security console — analyst access only.
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <EnvelopeSimple size={16} />
              </span>
              <input
                id="login-email"
                type="email"
                placeholder="analyst@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="login-field login-field--last">
            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <LockSimple size={16} />
              </span>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                className={showPassword ? "has-toggle" : ""}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="login-toggle-visibility"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="login-row-end">
            <Link className="login-link" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="login-btn-primary"
            disabled={loading}
          >
            {loading ? "Logging in…" : "Log in"}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="login-footer-meta">SECURE CONNECTION · TLS 1.3</div>
      </div>
    </div>
  );
};

export default Login;
