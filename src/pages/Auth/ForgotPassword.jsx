// src/pages/Auth/ForgotPassword.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import AuthBackdrop from "../Login/AuthBackdrop";
import { LockKey, EnvelopeSimple, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import "../Login/Login.css";

// Neutral confirmation — never reveals whether an account exists for the
// submitted email (account-enumeration protection). Shown on both success and
// recoverable errors so the response is indistinguishable to the caller.
const NEUTRAL_MESSAGE =
  "If an account exists for that email, reset instructions have been sent.";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ loading: false, message: "", error: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, message: "", error: "" });

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      // Supabase intentionally returns success even for unknown emails; we keep
      // the message neutral regardless so the backend's response can't be used
      // to probe which emails are registered. Raw error details are not shown.
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      setStatus({ loading: false, message: NEUTRAL_MESSAGE, error: "" });
    } catch {
      setStatus({
        loading: false,
        message: "",
        error: "Something went wrong. Please try again.",
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

        <h1 className="auth-heading">Forgot your password?</h1>
        <p className="login-subhead">
          Enter your email address and we&apos;ll send instructions to reset your
          password.
        </p>

        {status.error && <div className="login-error">{status.error}</div>}
        {status.message && <div className="login-success">{status.message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field login-field--last">
            <label htmlFor="email">Email address</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <EnvelopeSimple size={16} />
              </span>
              <input
                id="email"
                type="email"
                required
                placeholder="you@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status.loading}
              />
            </div>
          </div>

          <button
            className="login-btn-primary"
            type="submit"
            disabled={status.loading}
            style={{ marginTop: "var(--space-6)" }}
          >
            {status.loading ? "Sending…" : "Send reset instructions"}
            <ArrowRight size={16} />
          </button>
        </form>

        <Link className="tfa-back-link" to="/login" style={{ marginTop: "var(--space-5)" }}>
          <ArrowLeft size={14} />
          Back to login
        </Link>

        <div className="login-footer-meta">SECURE CONNECTION · TLS 1.3</div>
      </div>
    </div>
  );
}

export default ForgotPassword;
