import { useState, useEffect, lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Sidebar from "./layouts/Sidebar";

// Route-level code splitting — each page ships in its own chunk, loaded on demand.
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const SAM = lazy(() => import("./pages/SAM/SAM"));
const DeviceManagement = lazy(() => import("./pages/DeviceManagement/DeviceManagement"));
const AccountsAudit = lazy(() => import("./pages/AccountsAudit/AccountsAudit"));
const History = lazy(() => import("./pages/History/History"));
const Profile = lazy(() => import("./pages/Profile/Profile"));
const Login = lazy(() => import("./pages/Login/Login"));
const ForgotPassword = lazy(() => import("./pages/Auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/Auth/ResetPassword"));
const ForceResetPassword = lazy(() => import("./pages/Auth/ForceResetPassword"));

import api, { setAccessToken, getAccessToken } from "./api/axios";
import { NetworkProvider } from "./context/NetworkContext";
import { ThreatDetectionProvider } from "./context/ThreatDetectionContext";
import { ToastProvider } from "./context/ToastContext";
import "./App.css";
import UserMenu from "./components/common/UserMenu/UserMenu";
import Spinner from "./components/common/Spinner/Spinner";

// QA debug harness — never ship to production builds
const TestAuth = import.meta.env.DEV
  ? lazy(() => import("./pages/TestAuth/TestAuth"))
  : null;

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
    return <Spinner fullScreen label="Loading..." />;
  }

  const isAuthenticated = !!getAccessToken();

  return (
    <ToastProvider>
    <NetworkProvider>
      <Router>
        <Suspense fallback={<Spinner fullScreen label="Loading..." />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* AUTH-009 — Force-reset: accessible only when authenticated, no sidebar */}
          <Route
            path="/force-reset-password"
            element={
              isAuthenticated ? (
                <ForceResetPassword />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

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
                        {import.meta.env.DEV && (
                          <Route
                            path="/test-auth"
                            element={
                              <Suspense fallback={null}>
                                <TestAuth />
                              </Suspense>
                            }
                          />
                        )}
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
        </Suspense>
      </Router>
    </NetworkProvider>
    </ToastProvider>
  );
}

export default App;
