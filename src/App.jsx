import { useState, useEffect, lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Sidebar from "./layouts/Sidebar";
import ErrorBoundary from "./components/common/ErrorBoundary";

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
const MFASetup = lazy(() => import("./pages/Auth/MFASetup"));

import api, { setAccessToken, getAccessToken } from "./api/axios";
import { NetworkProvider } from "./context/NetworkContext";
import { ThreatDetectionProvider } from "./context/ThreatDetectionContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./App.css";
import UserMenu from "./components/common/UserMenu/UserMenu";
import Spinner from "./components/common/Spinner/Spinner";

// Wraps the active page in an error boundary that resets on navigation, so a
// crash (or a failed lazy-chunk load) in one page shows a fallback instead of
// blanking the whole app — and moving to another page recovers automatically.
function PageErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}

function App() {
  const [authReady, setAuthReady] = useState(false);
  // null = not yet known (still loading or unauthenticated) — only an
  // explicit false should ever trigger the forced /mfa-setup redirect.
  const [mfaEnrolled, setMfaEnrolled] = useState(null);

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
      .then(async (res) => {
        setAccessToken(res.data.access_token);

        // GET profiles/me stays AAL2-exempt server-side so this read works
        // at aal1 — needed to know whether to force /mfa-setup. A failure
        // here is fail-open on the UI gate (don't force-redirect on a
        // transient fetch error) — real enforcement is the server-side
        // AAL2 check on every other route, this gate is UX routing only.
        try {
          const profileRes = await api.get("webapp/users/profiles/me");
          const profile = profileRes?.data ?? null;
          setMfaEnrolled(profile?.mfa_enrolled ?? true);
        } catch {
          setMfaEnrolled(true);
        }
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
    <ThemeProvider>
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

          {/* Forced MFA enrollment: accessible only when authenticated, no sidebar */}
          <Route
            path="/mfa-setup"
            element={
              isAuthenticated ? (
                <MFASetup mode="forced" />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* Protected routes — redirect to /login if no access token */}
          <Route
            path="/*"
            element={
              isAuthenticated && mfaEnrolled === false ? (
                <Navigate to="/mfa-setup" replace />
              ) : isAuthenticated ? (
                <ThreatDetectionProvider>
                  <div className="app">
                    <Sidebar />
                    <UserMenu />
                    <main className="main-content">
                      <PageErrorBoundary>
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
                        {/* Unknown authenticated path → Dashboard (no blank screen) */}
                        <Route
                          path="*"
                          element={<Navigate to="/dashboard" replace />}
                        />
                      </Routes>
                      </PageErrorBoundary>
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
    </ThemeProvider>
  );
}

export default App;
