import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Sidebar from "./layouts/Sidebar";
import Dashboard from "./pages/Dashboard/Dashboard";
import SAM from "./pages/SAM/SAM";
import DeviceManagement from "./pages/DeviceManagement/DeviceManagement";
import AccountsAudit from "./pages/AccountsAudit/AccountsAudit";
import History from "./pages/History/History";
import Profile from "./pages/Profile/Profile";
import Login from "./pages/Login/Login";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";

import TestAuth from "./pages/TestAuth/TestAuth";
import api, { setAccessToken, getAccessToken } from "./api/axios";
import { NetworkProvider } from "./context/NetworkContext";
import { ThreatDetectionProvider } from "./context/ThreatDetectionContext";
import "./App.css";
import UserMenu from "./components/common/UserMenu/UserMenu";

function App() {
  const [authReady, setAuthReady] = useState(false);

  // Bootstrap: try to restore session from HttpOnly refresh cookie.
  // Skip on public pages — no cookie exists before login, so the call
  // would just produce a harmless but noisy 401.
  useEffect(() => {
    const publicPaths = ["/login", "/forgot-password", "/reset-password", "/"];
    if (publicPaths.includes(window.location.pathname)) {
      setAuthReady(true);
      return;
    }

    api
      .post("auth/refresh")
      .then((res) => {
        setAccessToken(res.data.access_token);
      })
      .catch(() => {
        setAccessToken(null); // no valid session — must log in
      })
      .finally(() => {
        setAuthReady(true);
      });
  }, []);

  if (!authReady) {
    return <div className="loading-screen">Loading...</div>;
  }

  const isAuthenticated = !!getAccessToken();

  return (
    <NetworkProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected routes — redirect to /login if no access token */}
          <Route
            path="/*"
            element={
              isAuthenticated ? (
                <ThreatDetectionProvider>
                  <div className="app">
                    <Sidebar />
                    <UserMenu />
                    <main className="main-content">
                      <Routes>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/security-assessment" element={<SAM />} />
                        <Route
                          path="/device-management"
                          element={<DeviceManagement />}
                        />
                        <Route
                          path="/accounts-audit"
                          element={<AccountsAudit />}
                        />
                        <Route path="/history" element={<History />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/test-auth" element={<TestAuth />} />
                      </Routes>
                    </main>
                  </div>
                </ThreatDetectionProvider>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </Router>
    </NetworkProvider>
  );
}

export default App;
