// src/pages/Auth/ForceResetPassword.jsx
// AUTH-009 — Force password reset on first login when must_change_password is set.
// The user reaches this page immediately after login if the backend returns
// mustChangePassword: true (i.e. a temporary password was issued by a superadmin).
// The user cannot navigate away — attempting to visit /dashboard is harmless because
// App.jsx checks mustChangePassword before rendering the main layout (see App.jsx).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import api from "../../api/axios";
import { validatePassword } from "../../passwordValidation";
import PasswordChecklist from "./PasswordChecklist";
import "./Auth.css";

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
      // 3) Update Supabase Auth password (uses current session)
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setStatus({
          submitting: false,
          message: "",
          error: updateError.message || "Failed to update password.",
        });
        return;
      }

      // 4) Tell the backend to clear must_change_password + temp_expires_at
      try {
        await api.post("auth/clear-force-reset");
      } catch {
        // Non-fatal — profile flag will be stale but login will still work.
        // The flag is cleared on next login once temp_expires_at passes too.
        console.warn("Could not clear must_change_password flag on backend.");
      }

      // 5) Success
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
    <div className="auth-page">
      <div className="auth-card">
        {/* Lock icon */}
        <div style={{ textAlign: "center", marginBottom: "12px" }}>
          <span style={{ fontSize: "32px" }}>🔐</span>
        </div>

        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-subtitle">
          Your account was given a temporary password. You must set a new
          password before you can continue.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* New password */}
          <div className="form-group">
            <label htmlFor="force-password">New password</label>
            <div className="password-input-wrapper">
              <input
                id="force-password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Choose a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status.submitting}
                className="password-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <PasswordChecklist password={password} />
          </div>

          {/* Confirm password */}
          <div className="form-group">
            <label htmlFor="force-confirm">Confirm new password</label>
            <div className="password-input-wrapper">
              <input
                id="force-confirm"
                type={showConfirm ? "text" : "password"}
                required
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={status.submitting}
                className="password-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {confirmError && (
              <p className="error-text" style={{ marginTop: "4px" }}>
                {confirmError}
              </p>
            )}
          </div>

          {/* Strength errors */}
          {passwordErrors.length > 0 && (
            <ul className="password-errors">
              {passwordErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          <button
            className="auth-button"
            type="submit"
            disabled={status.submitting}
          >
            {status.submitting ? "Updating…" : "Set new password"}
          </button>
        </form>

        {status.message && (
          <p className="success-text" style={{ marginTop: "16px" }}>
            {status.message}
          </p>
        )}
        {status.error && (
          <p className="error-text" style={{ marginTop: "16px" }}>
            {status.error}
          </p>
        )}
      </div>
    </div>
  );
}

export default ForceResetPassword;
