import "./DeviceManagement.css";
import { useState } from "react";

const DeviceManagement = () => {
  const [activeTab, setActiveTab] = useState("announcement");
  const [isEditing, setIsEditing] = useState(false);

  const [savedContent, setSavedContent] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const sectionTitle =
    activeTab === "announcement"
      ? "Captive Portal Announcement"
      : "Terms and Conditions";

  const startEdit = () => {
    setDraftContent(savedContent);
    setIsEditing(true);
  };

  const discardChanges = () => {
    setDraftContent(savedContent);
    setIsEditing(false);
  };

  const publishChanges = () => {
    setSavedContent(draftContent);
    setIsEditing(false);
  };

  const hasChanges = draftContent !== savedContent;

  return (
    <div className="device-page">
      <h1 className="page-title">Device</h1>

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
        {/* LEFT */}
        <div className="left-panel">
          <div className="editor-section">
            <div className="section-header">
              <h2 className="section-title">{sectionTitle}</h2>

              {!isEditing && (
                <button className="edit-icon" onClick={startEdit}>
                  Edit
                </button>
              )}
            </div>

            <textarea
              className="announcement-box"
              value={isEditing ? draftContent : savedContent}
              onChange={(e) => setDraftContent(e.target.value)}
              readOnly={!isEditing}
              placeholder="Enter text"
            />

            <div className="footer-row">
              <div className="published-on">
                <span>Published On</span>
                <div className="date-boxes">
                  <span>-- --</span>
                  <span>--</span>
                </div>
              </div>

              {isEditing && hasChanges && (
                <div className="editor-actions">
                  <button className="discard-btn" onClick={discardChanges}>
                    Discard
                  </button>
                  <button className="publish-btn" onClick={publishChanges}>
                    Publish
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT */}
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
