// src/pages/Auth/ResetPassword.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./Auth.css";

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({
    loading: true,
    message: "",
    error: "",
    submitting: false,
  });

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setStatus({
          loading: false,
          message: "",
          error:
            "Recovery session not found or has expired. Please request a new reset email.",
          submitting: false,
        });
        return;
      }

      setStatus((prev) => ({
        ...prev,
        loading: false,
      }));
    };

    init();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus((prev) => ({
      ...prev,
      submitting: true,
      error: "",
      message: "",
    }));

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setStatus((prev) => ({
          ...prev,
          submitting: false,
          error: error.message,
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
    } catch (err) {
      setStatus((prev) => ({
        ...prev,
        submitting: false,
        error: err.message || "Unexpected error occurred.",
      }));
    }
  };

  if (status.loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Resetting password</h1>
          <p className="auth-subtitle">Verifying your secure session...</p>
        </div>
      </div>
    );
  }

  if (status.error && !status.submitting && !status.message) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Reset password</h1>
          <p className="error-text">{status.error}</p>
          <button
            className="auth-button-secondary"
            onClick={() => navigate("/forgot-password")}
          >
            Request a new reset link
          </button>
          <p className="auth-helper-text">
            Back to <Link to="/login">login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Create a new password</h1>
        <p className="auth-subtitle">
          Choose a strong password you haven&apos;t used before on this account.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              placeholder="Enter a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status.submitting}
            />
          </div>

          <button className="auth-button" type="submit" disabled={status.submitting}>
            {status.submitting ? "Updating..." : "Update password"}
          </button>
        </form>

        {status.message && <p className="success-text">{status.message}</p>}
        {status.error && !status.loading && (
          <p className="error-text">{status.error}</p>
        )}

        <p className="auth-helper-text">
          Changed your mind? <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
