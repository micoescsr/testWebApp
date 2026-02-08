// pages/DeviceManagement.jsx
import { useState } from "react";
import "./DeviceManagement.css";
import Tabs from "../../components/common/Tabs/Tabs";
import { useDevice } from "../../hooks/useDevice";
import AccessPointPanel from "../../components/device/AccessPointPanel";
// Add ErrorBoundary import if you created it
import ErrorBoundary from "../../components/common/ErrorBoundary";

const DeviceManagement = () => {
  const [activeTab, setActiveTab] = useState("announcement");
  const [isEditing, setIsEditing] = useState(false);
  const [savedContent, setSavedContent] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const { 
    accessPoint, 
    loading, 
    error, 
    isEmpty, 
    refetch, 
    handleToggleAccessPoint 
  } = useDevice();

  const tabs = [
    { label: "Announcement", value: "announcement" },
    { label: "Terms and Conditions", value: "terms" },
  ];

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

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="device-content">
        {/* LEFT: editor - always works */}
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

        {/* RIGHT: device panel with all states */}
        {/* <ErrorBoundary fallback={<div>Panel error - reload page</div>}> */}
          <AccessPointPanel
            accessPoint={accessPoint}
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={refetch}
            onToggle={handleToggleAccessPoint}
          />
        {/* </ErrorBoundary> */}
      </div>
    </div>
  );
};

export default DeviceManagement;
