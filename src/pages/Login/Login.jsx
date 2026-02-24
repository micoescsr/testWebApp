// Login.jsx
import "./Login.css";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import api, { setAccessToken } from "../../api/axios";
import { Link } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1) Sign in via Supabase JS (tokens NOT persisted — persistSession: false)
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const session = data.session;
      if (!session) throw new Error("No session returned");

      // 2) Store access token in memory for axios
      setAccessToken(session.access_token);

      // 3) Send refresh token to backend → HttpOnly cookie
      await api.post("auth/set-refresh", {
        refresh_token: session.refresh_token,
      });

      // 4) Check profile status (Bearer from memory now)
      const res = await api.get("webapp/users/profiles/me");
      const profile = res?.data ?? null;

      // Defensive: normalize possible response shapes and avoid reading
      // properties from undefined (which caused the console error).
      const status = profile?.status ?? profile?.profile?.status ?? null;
      if (!status) {
        await api.post("auth/logout");
        setAccessToken(null);
        setError("Unable to verify account status. Please try again.");
        setLoading(false);
        return;
      }

      if (status !== "active") {
        await api.post("auth/logout");
        setAccessToken(null);

        const statusMessages = {
          on_hold: "Your account is currently on hold. Please contact the administrator to restore access.",
          inactive: "Your account has been deactivated. Please contact the administrator.",
        };
        setError(statusMessages[status] || "Your account is not active. Please contact the administrator.");
        setLoading(false);
        return;
      }

      // 5) All good — full navigation so App bootstraps from cookie
      window.location.replace("/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
      setAccessToken(null);
      setError(
        err?.response?.data?.error ||
          err.message ||
          "Login failed. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Login to your account</h1>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* ADDED Forgot password link here */}
          <p className="forgot-password-text">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Logging in..." : "Login now"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
