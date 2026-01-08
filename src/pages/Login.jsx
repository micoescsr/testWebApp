import "../Login.css";

const Login = () => {
  const handleSubmit = (e) => {
    e.preventDefault();
    // TEMP: always go to dashboard
    window.location.href = "/dashboard";
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-welcome">Welcome back!</p>
        <h1 className="login-title">Login to your account</h1>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrapper">
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="password-toggle"
                aria-label="Toggle password visibility"
              >
                👁
              </button>
            </div>
          </div>

          <button type="submit" className="login-button">
            Login now
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
