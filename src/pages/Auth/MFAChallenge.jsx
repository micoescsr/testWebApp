// src/pages/Auth/MFAChallenge.jsx
// Shown after password sign-in when Supabase reports the account needs a
// second factor (aal1 -> aal2). Verifying issues a fresh session with
// aal: "aal2" — the caller uses that session for the rest of the login flow.

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./Auth.css";

function MFAChallenge({ factorId, onVerified, onCancel }) {
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const autoSubmitted = useRef(false);

  const startChallenge = async () => {
    setError("");
    const { data, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(challengeError.message || "Failed to start MFA challenge.");
      return null;
    }
    setChallengeId(data.id);
    return data.id;
  };

  useEffect(() => {
    startChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async (currentChallengeId) => {
    if (!currentChallengeId || verifying) return;
    setVerifying(true);
    setError("");

    const { data, error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: currentChallengeId,
      code,
    });

    if (verifyError) {
      autoSubmitted.current = false;
      setCode("");
      setVerifying(false);

      // Challenge expired (~5min) — get a fresh one and let the user retry.
      const expired = /expired/i.test(verifyError.message || "");
      if (expired) {
        const freshId = await startChallenge();
        setError("That code expired. Enter a new code from your authenticator app.");
        if (freshId) setChallengeId(freshId);
        return;
      }

      setError(verifyError.message || "Invalid code. Please try again.");
      return;
    }

    onVerified(data.session);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleVerify(challengeId);
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(value);

    if (value.length === 6 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      handleVerify(challengeId);
    } else if (value.length < 6) {
      autoSubmitted.current = false;
    }
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    onCancel();
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Two-factor verification</h1>
        <p className="auth-subtitle">
          Enter the 6-digit code from your authenticator app.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="mfa-code">Authentication code</label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={handleCodeChange}
              disabled={verifying}
              maxLength={6}
              autoFocus
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            className="auth-button"
            type="submit"
            disabled={verifying || code.length !== 6}
          >
            {verifying ? "Verifying..." : "Verify"}
          </button>

          <button
            className="auth-button-secondary"
            type="button"
            onClick={handleCancel}
            disabled={verifying}
          >
            Back to login
          </button>
        </form>
      </div>
    </div>
  );
}

export default MFAChallenge;
