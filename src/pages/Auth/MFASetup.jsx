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
import "./Auth.css";

function MFASetup({ mode = "forced", onSuccess }) {
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
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
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

      if (mode === "self-service") {
        // Replace any existing verified factor before enrolling a new one.
        const { data: factorsData, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) {
          throw new Error(listError.message || "Failed to load existing MFA factors.");
        }
        const existing = factorsData.totp[0];
        if (existing) {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: existing.id });
          if (unenrollError) {
            throw new Error(unenrollError.message || "Failed to remove the existing authenticator.");
          }
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

      // verify() returns a new session with aal: "aal2" — apply it to the
      // current app session immediately so the very next backend call
      // isn't bounced by requireAAL2.
      const newSession = verifyData.session;
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
      onSuccess?.();
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

  if (initializing) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-subtitle">Setting up two-factor authentication...</p>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Set up two-factor authentication</h1>
        <p className="auth-subtitle">
          Scan this QR code with your authenticator app, then enter the
          6-digit code it generates.
        </p>

        {successMessage && <p className="success-text">{successMessage}</p>}

        {/* enroll() failed (possibly after unenrolling an old factor in
            self-service mode, or after "Start over") — no factor to show
            a form for, so surface the error here with a way to retry
            instead of leaving the user on a dead-end screen. */}
        {!factor && error && (
          <>
            <p className="error-text">{error}</p>
            <button className="auth-button" type="button" onClick={startEnrollment}>
              Retry
            </button>
            {mode === "forced" && (
              <button className="auth-button-secondary" type="button" onClick={handleCancel}>
                Cancel and log out
              </button>
            )}
          </>
        )}

        {factor && (
          <>
            <TotpQrDisplay qrCodeSvg={factor.totp.qr_code} secret={factor.totp.secret} />

            <form className="auth-form" onSubmit={handleVerify}>
              <div className="form-group">
                <label htmlFor="totp-code">Authentication code</label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={verifying}
                  maxLength={6}
                />
              </div>

              {error && <p className="error-text">{error}</p>}

              <button className="auth-button" type="submit" disabled={verifying || code.length !== 6}>
                {verifying ? "Verifying..." : "Verify and enable"}
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
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default MFASetup;
