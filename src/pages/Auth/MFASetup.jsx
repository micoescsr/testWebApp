// src/pages/Auth/MFASetup.jsx
// TOTP enrollment flow. Two modes:
//   - "forced": full-page /mfa-setup route, no skip/cancel (cancel = logout).
//     Used by the App.jsx gate for any authenticated user without a
//     verified factor.
//   - "self-service": embedded in the Profile page for users who already
//     have MFA and want to re-enroll on a new device — unenrolls the old
//     factor first, then enrolls a new one.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import api, { getAccessToken, setAccessToken } from "../../api/axios";
import TotpQrDisplay from "../../components/auth/TotpQrDisplay";
import AuthBackdrop from "../Login/AuthBackdrop";
import { ShieldCheck, ArrowRight } from "@phosphor-icons/react";
import "../Login/Login.css";

function MFASetup({ mode = "forced", onClose }) {
  const [factor, setFactor] = useState(null); // { id, totp: { qr_code, secret } }
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const primeSession = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error("Session expired. Please log in again.");
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: "not-used", // required field; auto-refresh is disabled
    });
    if (sessionError) {
      throw new Error(sessionError.message || "Failed to establish session.");
    }
  };

  const enroll = async () => {
    // friendlyName must be unique per user (DB constraint
    // mfa_factors_user_friendly_name_unique) and is never shown in our UI —
    // suffix with a timestamp so a leftover factor from an abandoned attempt
    // (one our listFactors/unenroll cleanup above failed to catch, e.g. a
    // verified factor that requires an aal2 session to remove) can never
    // collide with a fresh enrollment.
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator App ${Date.now()}`,
    });
    if (enrollError) {
      throw new Error(enrollError.message || "Failed to start MFA enrollment.");
    }
    setFactor(data);
  };

  const startEnrollment = async () => {
    setInitializing(true);
    setError("");
    try {
      await primeSession();

      // Clear any existing factor(s) before enrolling a new one. In
      // self-service mode this replaces a verified factor on purpose; in
      // forced mode it cleans up unverified factors left behind by a
      // previous abandoned attempt (refresh/navigate-away) — Supabase
      // rejects re-enrolling with the same friendlyName otherwise.
      // NOTE: listFactors()'s `data.totp` only includes verified factors
      // (see GoTrueClient _listFactors) — unverified leftovers only show
      // up in `data.all`, so we must filter that instead.
      const { data: factorsData, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        throw new Error(listError.message || "Failed to load existing MFA factors.");
      }
      const existingTotp = factorsData.all.filter((f) => f.factor_type === "totp");
      for (const existing of existingTotp) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: existing.id });
        if (unenrollError) {
          throw new Error(unenrollError.message || "Failed to remove the existing authenticator.");
        }
      }

      await enroll();
    } catch (err) {
      setError(err.message || "Failed to start MFA enrollment.");
    } finally {
      setInitializing(false);
    }
  };

  useEffect(() => {
    startEnrollment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartOver = async () => {
    if (!factor) return;
    setError("");
    setInitializing(true);
    try {
      // Supabase enforces a max factor count — drop the unverified one first.
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
      setFactor(null);
      setCode("");
      await enroll();
    } catch (err) {
      setError(err.message || "Failed to restart enrollment.");
    } finally {
      setInitializing(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!factor || verifying) return;
    setVerifying(true);
    setError("");

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (challengeError) {
        throw new Error(challengeError.message || "Failed to start verification challenge.");
      }

      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) {
        throw new Error(verifyError.message || "Invalid code. Please try again.");
      }

      // verify()'s data is already a flat session object (access_token,
      // refresh_token, etc., aal: "aal2") — no `.session` wrapper. Apply
      // it to the current app session immediately so the very next
      // backend call isn't bounced by requireAAL2.
      const newSession = verifyData;
      setAccessToken(newSession.access_token);
      await api.post("auth/set-refresh", { refresh_token: newSession.refresh_token });
      await api.post("auth/mfa/sync-status", { enrolled: true });

      if (mode === "forced") {
        window.location.replace("/dashboard");
        return;
      }

      setSuccessMessage("Two-factor authentication is now enabled on this device.");
      setFactor(null);
      setCode("");
      // Don't refetch the profile here — Profile.jsx's profileLoading guard
      // unmounts this whole component (and its success state) while the
      // fetch is in flight, then remounts it fresh once done, re-triggering
      // startEnrollment() and silently generating a brand-new factor. Defer
      // the refetch until the user dismisses (Done button → onClose).
    } catch (err) {
      setCode("");
      setError(err.message || "Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    setAccessToken(null);
    window.location.replace("/login");
  };

  // "forced" renders as the full standalone /mfa-setup page (own backdrop +
  // card chrome, matching Login/2FA). "self-service" renders just the inner
  // content — the Profile page hosts it inside its own modal, which already
  // provides page chrome — so the backdrop/brand mark/footer are skipped.
  const Wrapper = mode === "forced"
    ? ({ children }) => (
        <div className="login-page">
          <AuthBackdrop />
          <div className="login-card">
            <div className="login-app-mark">
              <ShieldCheck size={24} weight="duotone" />
            </div>
            <div className="login-wordmark">WHY-PII?</div>
            {children}
            <div className="login-footer-meta">SECURE CONNECTION · TLS 1.3</div>
          </div>
        </div>
      )
    : ({ children }) => <>{children}</>;

  if (initializing) {
    return (
      <Wrapper>
        <h1 className="auth-heading">Set up two-factor authentication</h1>
        <p className="login-loading-text">
          Setting up two-factor authentication…
        </p>
        {error && <div className="login-error">{error}</div>}
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {!successMessage && (
        <>
          <h1 className="auth-heading">Set up two-factor authentication</h1>
          <p className="login-subhead">
            Scan the QR code with your authenticator app, then enter the 6-digit
            code to enable MFA.
          </p>
        </>
      )}

      {successMessage && (
        <>
          <div className="login-success">{successMessage}</div>
          <button className="login-btn-primary" type="button" onClick={onClose}>
            Done
          </button>
        </>
      )}

      {/* enroll() failed (possibly after unenrolling an old factor in
          self-service mode, or after "Start over") — no factor to show
          a form for, so surface the error here with a way to retry
          instead of leaving the user on a dead-end screen. */}
      {!factor && error && (
        <>
          <div className="login-error">{error}</div>
          <div className="login-actions">
            <button className="login-btn-primary" type="button" onClick={startEnrollment}>
              Retry
            </button>
            {mode === "forced" && (
              <button className="auth-button-secondary" type="button" onClick={handleCancel}>
                Cancel and log out
              </button>
            )}
          </div>
        </>
      )}

      {factor && (
        <>
          <TotpQrDisplay qrCodeSvg={factor.totp.qr_code} secret={factor.totp.secret} />

          <form onSubmit={handleVerify}>
            <div className="login-field login-field--last">
              <label htmlFor="totp-code">Authentication code</label>
              <div className="login-input-wrap">
                <input
                  id="totp-code"
                  type="text"
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={verifying}
                  maxLength={6}
                />
              </div>
            </div>

            {error && <div className="login-error" style={{ marginTop: "var(--space-4)" }}>{error}</div>}

            <div className="login-actions">
              <button
                className="login-btn-primary"
                type="submit"
                disabled={verifying || code.length !== 6}
              >
                {verifying ? "Verifying…" : "Verify and enable"}
                <ArrowRight size={16} />
              </button>

              <button
                className="auth-button-secondary"
                type="button"
                onClick={handleStartOver}
                disabled={verifying}
              >
                Start over
              </button>

              {mode === "forced" && (
                <button
                  className="auth-button-secondary"
                  type="button"
                  onClick={handleCancel}
                  disabled={verifying}
                >
                  Cancel and log out
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </Wrapper>
  );
}

export default MFASetup;
