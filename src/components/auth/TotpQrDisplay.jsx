// src/components/auth/TotpQrDisplay.jsx
// Presentational: QR code + masked/revealable secret with copy-to-clipboard.
import { useState } from "react";
import "./TotpQrDisplay.css";

function TotpQrDisplay({ qrCodeSvg, secret }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — no-op, user can still
      // reveal and select the text manually.
    }
  };

  return (
    <div className="totp-qr-display">
      <img className="totp-qr-image" src={qrCodeSvg} alt="Scan with your authenticator app" />

      <div className="totp-secret-row">
        <span className="totp-secret-label">Or enter this code manually:</span>
        <code className="totp-secret-value" data-testid="totp-secret">
          {revealed ? secret : "•".repeat(Math.min(secret?.length || 16, 32))}
        </code>
      </div>

      <div className="totp-secret-actions">
        <button type="button" className="auth-button-secondary" onClick={() => setRevealed((r) => !r)}>
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button type="button" className="auth-button-secondary" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default TotpQrDisplay;
