// src/pages/Auth/ForceResetPassword.jsx
// AUTH-009 — Force password reset on first login when must_change_password is set.
// The user reaches this page immediately after login if the backend returns
// mustChangePassword: true (i.e. a temporary password was issued by a superadmin).
// The user cannot navigate away — attempting to visit /dashboard is harmless because
// App.jsx checks mustChangePassword before rendering the main layout (see App.jsx).
//
// NOTE: The Supabase client is configured with persistSession: false, so
// supabase.auth.updateUser() would fail with "Auth session missing" unless we
// prime the session first. We inject the in-memory access token via
// supabase.auth.setSession() before calling updateUser(). The refresh token
// field is required by the API but won't be used (no auto-refresh is configured).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import api, { getAccessToken } from "../../api/axios";
import { validatePassword } from "../../passwordValidation";
import PasswordChecklist from "./PasswordChecklist";
import AuthBackdrop from "../Login/AuthBackdrop";
import { LockKey, LockSimple, Eye, EyeSlash, ArrowRight } from "@phosphor-icons/react";
import "../Login/Login.css";

function ForceResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [confirmError, setConfirmError] = useState("");
  const [status, setStatus] = useState({
    submitting: false,
    message: "",
    error: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPasswordErrors([]);
    setConfirmError("");
    setStatus({ submitting: false, message: "", error: "" });

    // 1) Validate strength
    const { valid, errors } = validatePassword(password);
    if (!valid) {
      setPasswordErrors(errors);
      return;
    }

    // 2) Confirm match
    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      return;
    }

    setStatus({ submitting: true, message: "", error: "" });

    try {
      // 3) Prime the Supabase JS session from the in-memory access token.
      //    persistSession: false means supabase.auth has no session by default —
      //    setSession() injects the token so updateUser() can attach it to its request.
      const accessToken = getAccessToken();
      if (!accessToken) {
        setStatus({
          submitting: false,
          message: "",
          error: "Session expired. Please log in again.",
        });
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: "not-used", // required field; auto-refresh is disabled
      });

      if (sessionError) {
        setStatus({
          submitting: false,
          message: "",
          error: sessionError.message || "Failed to establish session.",
        });
        return;
      }

      // 4) Update Supabase Auth password (now has an active session)
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setStatus({
          submitting: false,
          message: "",
          error: updateError.message || "Failed to update password.",
        });
        return;
      }

      // 5) Tell the backend to clear must_change_password + temp_expires_at
      try {
        await api.post("auth/clear-force-reset");
      } catch {
        // Non-fatal — profile flag will be stale but login will still work.
        // The flag is cleared on next login once temp_expires_at passes too.
        console.warn("Could not clear must_change_password flag on backend.");
      }

      // 6) Success
      setStatus({
        submitting: false,
        message: "Password updated successfully! Redirecting to your dashboard…",
        error: "",
      });

      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (err) {
      setStatus({
        submitting: false,
        message: "",
        error: err?.message || "Unexpected error. Please try again.",
      });
    }
  };

  return (
    <div className="login-page">
      <AuthBackdrop />

      <div className="login-card">
        <div className="login-app-mark">
          <LockKey size={24} weight="duotone" />
        </div>
        <div className="login-wordmark">WHY-PII?</div>

        <h1 className="auth-heading">Set a new password</h1>
        <p className="login-subhead">
          Your account was issued a temporary password. Create a new password to
          continue.
        </p>

        {status.error && <div className="login-error">{status.error}</div>}
        {status.message && <div className="login-success">{status.message}</div>}

        <form onSubmit={handleSubmit}>
          {/* New password */}
          <div className="login-field">
            <label htmlFor="force-password">New password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <LockSimple size={16} />
              </span>
              <input
                id="force-password"
                type={showPassword ? "text" : "password"}
                className="has-toggle"
                required
                placeholder="Choose a strong password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status.submitting}
              />
              <button
                type="button"
                className="login-toggle-visibility"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <PasswordChecklist password={password} />
            {passwordErrors.length > 0 && (
              <p className="login-field-error">{passwordErrors[0]}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="login-field login-field--last">
            <label htmlFor="force-confirm">Confirm new password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <LockSimple size={16} />
              </span>
              <input
                id="force-confirm"
                type={showConfirm ? "text" : "password"}
                className="has-toggle"
                required
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={status.submitting}
              />
              <button
                type="button"
                className="login-toggle-visibility"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmError && <p className="login-field-error">{confirmError}</p>}
          </div>

          <button
            className="login-btn-primary"
            type="submit"
            disabled={status.submitting}
            style={{ marginTop: "var(--space-6)" }}
          >
            {status.submitting ? "Saving…" : "Set new password"}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="login-footer-meta">SECURE CONNECTION · TLS 1.3</div>
      </div>
    </div>
  );
}

export default ForceResetPassword;
