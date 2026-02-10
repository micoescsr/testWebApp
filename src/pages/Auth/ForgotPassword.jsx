// src/pages/Auth/ForgotPassword.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./Auth.css";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ loading: false, message: "", error: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, message: "", error: "" });

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setStatus({ loading: false, message: "", error: error.message });
        return;
      }

      setStatus({
        loading: false,
        message: "Password reset email sent. Please check your inbox.",
        error: "",
      });
    } catch (err) {
      setStatus({
        loading: false,
        message: "",
        error: err.message || "Unexpected error occurred.",
      });
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Forgot password?</h1>
        <p className="auth-subtitle">
          Enter the email associated with your account and we&apos;ll send you a
          secure link to reset your password.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status.loading}
            />
          </div>

          <button className="auth-button" type="submit" disabled={status.loading}>
            {status.loading ? "Sending link..." : "Send reset link"}
          </button>
        </form>

        {status.message && <p className="success-text">{status.message}</p>}
        {status.error && <p className="error-text">{status.error}</p>}

        <p className="auth-helper-text">
          Remember your password?{" "}
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
