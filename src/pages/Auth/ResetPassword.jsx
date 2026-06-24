// src/pages/Auth/ResetPassword.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { validatePassword } from "../../passwordValidation";
import PasswordChecklist from "../../pages/Auth/PasswordChecklist";
import AuthBackdrop from "../Login/AuthBackdrop";
import TwoFactorForm from "../Login/TwoFactorForm";
import { LockKey, LockSimple, Eye, EyeSlash, ArrowRight } from "@phosphor-icons/react";
import "../Login/Login.css";

// Single user-facing message for any unusable recovery link (expired,
// already-consumed/single-use, or invalid). We never echo the raw Supabase
// error, token, or link — only this neutral, actionable text.
const LINK_INVALID_MESSAGE =
  "This password reset link is invalid or has expired. It may have already been used — links can only be used once. Please request a new reset link.";

// When a recovery link is expired or already consumed (e.g. burned by an
// email-provider link scanner), Supabase redirects back with the failure in the
// URL hash (error / error_code, e.g. otp_expired, access_denied) and no session.
// Detect that synchronously so the page opens straight into the error state
// instead of flashing the loading view. We do NOT log or surface raw values.
function readLinkError() {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  if (!hash.includes("error")) return "";
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("error") || params.get("error_code")
    ? LINK_INVALID_MESSAGE
    : "";
}

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(() => {
    const linkError = readLinkError();
    return {
      loading: !linkError,
      message: "",
      error: linkError,
      submitting: false,
    };
  });
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);

  // MFA elevation: a password-recovery link yields an aal1 session. If the
  // account has a verified TOTP factor, Supabase refuses updateUser({password})
  // until the session is elevated to aal2 — so we must run an MFA challenge
  // (the same 6-digit step as login) before allowing the password change.
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState(null);

  // Listen for Supabase auth state changes.
  // When a user clicks the reset link, Supabase JS processes the URL hash
  // (detectSessionInUrl: true) and fires a PASSWORD_RECOVERY event.
  useEffect(() => {
    let active = true;

    // Link already flagged invalid/expired from the URL hash (see readLinkError
    // + initial state). Scrub the hash so the raw error never lingers in the
    // address bar or history, and skip session/MFA work — we never retry a
    // consumed one-time token.
    if (readLinkError()) {
      window.history.replaceState(null, "", window.location.pathname);
      return () => {
        active = false;
      };
    }

    // Once a recovery session exists, decide whether an MFA step is required
    // before the password can be updated.
    const handleSession = async () => {
      try {
        const { data: aal } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const factor = factors?.totp?.[0];
          if (factor && active) {
            setMfaFactorId(factor.id);
            setNeedsMfa(true);
          }
        }
      } catch {
        // Non-fatal: if the AAL probe fails, updateUser() will still surface
        // the requirement and we route to the MFA step from there.
      }
      if (active) setStatus((prev) => ({ ...prev, loading: false }));
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        handleSession();
      }
    });

    // Fallback: if the hash is already consumed (fast reload), check session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        handleSession();
      } else {
        // Give onAuthStateChange a moment before showing error
        setTimeout(() => {
          setStatus((prev) =>
            prev.loading
              ? { ...prev, loading: false, error: LINK_INVALID_MESSAGE }
              : prev
          );
        }, 2000);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPasswordErrors([]);

    const { valid, errors } = validatePassword(password);
    if (!valid) {
      setPasswordErrors(errors);
      setStatus((prev) => ({ ...prev, submitting: false }));
      return;
    }

    setStatus((prev) => ({ ...prev, submitting: true, error: "", message: "" }));

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // Defensive fallback: if the proactive AAL check above missed the
        // requirement, route the user into the MFA step instead of showing a
        // raw backend error.
        if (/aal2/i.test(error.message || "") && mfaFactorId) {
          setNeedsMfa(true);
          setStatus((prev) => ({ ...prev, submitting: false, error: "" }));
          return;
        }
        setStatus((prev) => ({
          ...prev,
          submitting: false,
          error: "Couldn't update your password. Please request a new reset link.",
        }));
        return;
      }

      setStatus((prev) => ({
        ...prev,
        submitting: false,
        message:
          "Password updated successfully. You can now log in with your new password.",
      }));

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch {
      setStatus((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error occurred. Please try again.",
      }));
    }
  };

  if (status.loading) {
    return (
      <div className="login-page">
        <AuthBackdrop />
        <div className="login-card">
          <div className="login-app-mark">
            <LockKey size={24} weight="duotone" />
          </div>
          <div className="login-wordmark">WHY-PII?</div>
          <h1 className="auth-heading">Resetting password</h1>
          <p className="login-loading-text">Verifying your secure session…</p>
        </div>
      </div>
    );
  }

  // MFA gate — elevate the recovery session to aal2 before the password form.
  // On success the Supabase client session is now aal2, so updateUser() works.
  if (needsMfa && mfaFactorId) {
    return (
      <TwoFactorForm
        factorId={mfaFactorId}
        onVerified={() => setNeedsMfa(false)}
        onCancel={() => navigate("/login")}
      />
    );
  }

  if (status.error && !status.submitting && !status.message) {
    return (
      <div className="login-page">
        <AuthBackdrop />
        <div className="login-card">
          <div className="login-app-mark">
            <LockKey size={24} weight="duotone" />
          </div>
          <div className="login-wordmark">WHY-PII?</div>
          <h1 className="auth-heading">Reset link unavailable</h1>
          <div className="login-error">{status.error}</div>
          <div className="login-actions">
            <button
              className="login-btn-primary"
              type="button"
              onClick={() => navigate("/forgot-password")}
            >
              Request a new reset link
              <ArrowRight size={16} />
            </button>
            <Link className="tfa-back-link" to="/login">
              Back to login
            </Link>
          </div>
          <div className="login-footer-meta">SECURE CONNECTION · TLS 1.3</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <AuthBackdrop />
      <div className="login-card">
        <div className="login-app-mark">
          <LockKey size={24} weight="duotone" />
        </div>
        <div className="login-wordmark">WHY-PII?</div>

        <h1 className="auth-heading">Create a new password</h1>
        <p className="login-subhead">
          Choose a strong password you haven&apos;t used before on this account.
        </p>

        {status.error && <div className="login-error">{status.error}</div>}
        {status.message && <div className="login-success">{status.message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field login-field--last">
            <label htmlFor="password">New password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <LockSimple size={16} />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="has-toggle"
                required
                placeholder="Enter a strong password"
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

          <button
            className="login-btn-primary"
            type="submit"
            disabled={status.submitting}
            style={{ marginTop: "var(--space-6)" }}
          >
            {status.submitting ? "Updating…" : "Update password"}
            <ArrowRight size={16} />
          </button>
        </form>

        <Link
          className="tfa-back-link"
          to="/login"
          style={{ marginTop: "var(--space-5)" }}
        >
          Back to login
        </Link>

        <div className="login-footer-meta">SECURE CONNECTION · TLS 1.3</div>
      </div>
    </div>
  );
}

export default ResetPassword;
