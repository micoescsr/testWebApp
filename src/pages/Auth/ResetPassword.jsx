// src/pages/Auth/ResetPassword.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { validatePassword } from "../../passwordValidation";
import PasswordChecklist from "../../pages/Auth/PasswordChecklist";
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
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);


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
    setPasswordErrors([]);

    const { valid, errors } = validatePassword(password);
    if (!valid) {
      setPasswordErrors(errors);
      setStatus((prev) => ({
        ...prev,
        submitting: false,
      }));
      return;
    }

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
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter a strong password"
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
