import "./DeviceManagement.css";
import { useState } from "react";

const DeviceManagement = () => {
  const [activeTab, setActiveTab] = useState("announcement");

  const sectionTitle =
    activeTab === "announcement"
      ? "Captive Portal Announcement"
      : "Terms and Conditions";

  return (
    <div className="device-page">
      <h1 className="page-title">Device</h1>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "announcement" ? "active" : ""}`}
          onClick={() => setActiveTab("announcement")}
        >
          Announcement
        </button>
        <button
          className={`tab ${activeTab === "terms" ? "active" : ""}`}
          onClick={() => setActiveTab("terms")}
        >
          Terms and Conditions
        </button>
      </div>

      <div className="device-content">
        {/* LEFT MAIN CONTENT */}
        <div className="left-panel">
          <div className="editor-section">
            <div className="section-header">
              <h2 className="section-title">{sectionTitle}</h2>
              <button className="edit-icon" title="Edit">
                Edit
              </button>
            </div>

            <textarea
              className="announcement-box"
              placeholder="Enter text"
            />

            <div className="published-on">
              <span>Published On</span>
              <div className="date-boxes">
                <span>-- --</span>
                <span>--</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE PANEL */}
        <div className="right-panel">
          <div className="side-card">
            <h3>Device Access Point</h3>
            <div className="toggle-row">
              <span>Enabled / Disabled</span>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked />
                <span className="slider"></span>
              </label>

            </div>
          </div>

          <div className="side-card">
            <h3>Access Point Info</h3>
            <div className="info-row">
              <span>Current Network</span>
              <span>Free_WiFi</span>
            </div>
            <div className="info-row">
              <span>Access Point Network</span>
              <span>Free_WiFi</span>
            </div>
            <div className="info-row">
              <span>Access Point Status</span>
              <span>Active</span>
            </div>
            <div className="info-row">
              <span>Connected Clients</span>
              <span>5</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceManagement;
