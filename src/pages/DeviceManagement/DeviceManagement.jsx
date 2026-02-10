// pages/DeviceManagement.jsx
import { useState } from "react";
import "./DeviceManagement.css";
import Tabs from "../../components/common/Tabs/Tabs";
import { useDevice } from "../../hooks/useDevice";
import { useProfile } from "../../hooks/useProfile";
import AccessPointPanel from "../../components/device/AccessPointPanel";

const DeviceManagement = () => {
  const [activeTab, setActiveTab] = useState("announcement");
  const [isEditing, setIsEditing] = useState(false);
  const [savedContent, setSavedContent] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const { profile, profileLoading } = useProfile();
  const role = (profile?.role || "").toLowerCase();

  const {
    accessPoint,
    apEnabled,
    loading,
    error,
    isEmpty,
    refetch,
    handleToggleAccessPoint,
  } = useDevice();

  if (profileLoading) {
    return <p>Loading...</p>;
  }

  // Everyone sees both tabs
  const tabs = [
    { label: "Announcement", value: "announcement" },
    { label: "Terms and Conditions", value: "terms" },
  ];

  const safeActiveTab = activeTab; // no hiding

  // Only superadmin can edit Terms; everyone can edit Announcement
  const canEdit =
    safeActiveTab === "announcement" ||
    (safeActiveTab === "terms" && role === "superadmin");

  const sectionTitle =
    safeActiveTab === "announcement"
      ? "Captive Portal Announcement"
      : "Terms and Conditions";

  const startEdit = () => {
    if (!canEdit) return;
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

      <Tabs
        tabs={tabs}
        activeTab={safeActiveTab}
        onTabChange={(value) => {
          setActiveTab(value);
          setIsEditing(false); // reset editing when switching tabs
        }}
      />

      <div className="device-content">
        {/* LEFT: editor */}
        <div className="left-panel">
          <div className="editor-section">
            <div className="section-header">
              <h2 className="section-title">{sectionTitle}</h2>
              {canEdit && !isEditing && (
                <button className="edit-icon" onClick={startEdit}>
                  Edit
                </button>
              )}
            </div>

            <textarea
              className="announcement-box"
              value={isEditing ? draftContent : savedContent}
              onChange={(e) => setDraftContent(e.target.value)}
              readOnly={!isEditing || !canEdit}
              placeholder={
                safeActiveTab === "terms"
                  ? "View terms and conditions (superadmin can edit)."
                  : "Enter announcement text"
              }
            />

            <div className="footer-row">
              <div className="published-on">
                <span>Published On</span>
                <div className="date-boxes">
                  <span>-- --</span>
                  <span>--</span>
                </div>
              </div>

              {canEdit && isEditing && hasChanges && (
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

        {/* RIGHT: device panel */}
        <AccessPointPanel
          accessPoint={accessPoint}
          loading={loading}
          error={error}
          isEmpty={isEmpty}
          onRetry={refetch}
          onToggle={handleToggleAccessPoint}
        />
      </div>
    </div>
  );
};

export default DeviceManagement;
