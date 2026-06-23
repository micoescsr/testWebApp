import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
} from "@phosphor-icons/react";

const DIGIT_COUNT = 6;

function TwoFactorForm({ factorId, email, onVerified, onCancel }) {
  const [digits, setDigits] = useState(Array(DIGIT_COUNT).fill(""));
  const [challengeId, setChallengeId] = useState(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef([]);
  const autoSubmitted = useRef(false);

  const startChallenge = useCallback(async () => {
    setError("");
    const { data, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) {
      setError(challengeError.message || "Failed to start MFA challenge.");
      return null;
    }
    setChallengeId(data.id);
    return data.id;
  }, [factorId]);

  useEffect(() => {
    startChallenge();
  }, [startChallenge]);

  const handleVerify = async (currentChallengeId, code) => {
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
      setDigits(Array(DIGIT_COUNT).fill(""));
      setVerifying(false);
      inputRefs.current[0]?.focus();

      const expired = /expired/i.test(verifyError.message || "");
      if (expired) {
        const freshId = await startChallenge();
        setError(
          "That code expired. Enter a new code from your authenticator app."
        );
        if (freshId) setChallengeId(freshId);
        return;
      }

      setError(verifyError.message || "Invalid code. Please try again.");
      return;
    }

    onVerified(data);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length === DIGIT_COUNT) {
      handleVerify(challengeId, code);
    }
  };

  const handleDigitChange = (index, value) => {
    if (error) setError("");
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const code = next.join("");
    if (code.length === DIGIT_COUNT && !autoSubmitted.current) {
      autoSubmitted.current = true;
      handleVerify(challengeId, code);
    } else if (code.length < DIGIT_COUNT) {
      autoSubmitted.current = false;
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, DIGIT_COUNT);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);

    const focusIndex = Math.min(pasted.length, DIGIT_COUNT - 1);
    inputRefs.current[focusIndex]?.focus();

    if (next.join("").length === DIGIT_COUNT && !autoSubmitted.current) {
      autoSubmitted.current = true;
      handleVerify(challengeId, next.join(""));
    }
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    onCancel();
  };

  return (
    <div className="login-page">
      <div className="login-backdrop">
        <div className="login-glow login-glow--one" />
        <div className="login-glow login-glow--two" />
      </div>

      <div className="login-card">
        <div className="login-app-mark">
          <ShieldCheck size={24} weight="duotone" />
        </div>
        <div className="login-wordmark">WHY-PII?</div>

        <h1>Two-factor verification</h1>
        <p className="login-subhead login-subhead--compact">
          Enter the 6-digit code from your authenticator app
          {email && (
            <>
              {" "}
              for
              <br />
              <span className="mono">{email}</span>
            </>
          )}
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="tfa-code-field">
            <div className="tfa-code-inputs" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  placeholder="–"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  autoFocus={i === 0}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={verifying}
                  className={error ? "tfa-input-error" : ""}
                  aria-label={`Digit ${i + 1} of ${DIGIT_COUNT}`}
                />
              ))}
            </div>
          </div>

          <div className="tfa-timer-row">
            <span>
              Codes refresh automatically every <span className="mono">30s</span>
            </span>
          </div>

          <button
            type="submit"
            className="login-btn-primary tfa-verify-btn"
            disabled={verifying || digits.join("").length !== DIGIT_COUNT}
          >
            {verifying ? "Verifying…" : "Verify"}
            <ArrowRight size={16} />
          </button>
        </form>

        <button
          type="button"
          className="tfa-back-link"
          onClick={handleCancel}
          disabled={verifying}
        >
          <ArrowLeft size={14} />
          Back to login
        </button>

        <div className="login-footer-meta">SECURE CONNECTION · TLS 1.3</div>
      </div>
    </div>
  );
}

export default TwoFactorForm;
