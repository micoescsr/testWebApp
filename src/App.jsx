import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./layouts/Sidebar";
import Dashboard from "./pages/Dashboard/Dashboard";
import SAM from "./pages/SAM/SAM";
import DeviceManagement from "./pages/DeviceManagement/DeviceManagement";
import AccountsAudit from "./pages/AccountsAudit/AccountsAudit";
import History from "./pages/History/History";
import Profile from "./pages/Profile/Profile";
import Login from "./pages/Login/Login";
import "./App.css";

function App() {
  return (

    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Login screen without sidebar */}
        <Route path="/login" element={<Login />} />

        {/* Everything else with sidebar */}
        <Route
          path="/*"
          element={
            <div className="app">
              <Sidebar />
              <main className="main-content">
                <Routes>
                  {/* <Route path="/" element={<Navigate to="/dashboard" replace />} /> */}
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/security-assessment" element={<SAM />} />
                  <Route path="/device-management" element={<DeviceManagement />} />
                  <Route path="/accounts-audit" element={<AccountsAudit />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/profile" element={<Profile />} />
                </Routes>
              </main>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
