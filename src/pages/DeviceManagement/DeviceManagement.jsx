// pages/DeviceManagement.jsx
import { useState, useEffect } from "react";
import "./DeviceManagement.css";
import Tabs from "../../components/common/Tabs/Tabs";
import { useDevice } from "../../hooks/useDevice";
import { useProfile } from "../../hooks/useProfile";
import AccessPointPanel from "../../components/device/AccessPointPanel";
import {
  getAnnouncement,
  publishAnnouncement,
  getTerms,
  publishTerms,
} from "../../api/deviceApi";

const DeviceManagement = () => {
  const [activeTab, setActiveTab] = useState("announcement");
  const [isEditing, setIsEditing] = useState(false);

  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [announcementCreatedAt, setAnnouncementCreatedAt] = useState(null);

  const [termsContent, setTermsContent] = useState("");
  const [termsDraft, setTermsDraft] = useState("");
  const [termsVersion, setTermsVersion] = useState("");
  const [termsCreatedAt, setTermsCreatedAt] = useState(null);

  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState(null);

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

  const tabs = [
    { label: "Announcement", value: "announcement" },
    { label: "Terms and Conditions", value: "terms" },
  ];

  const safeActiveTab = activeTab;

  const canEdit =
    safeActiveTab === "announcement" ||
    (safeActiveTab === "terms" && role === "superadmin");

  const sectionTitle =
    safeActiveTab === "announcement"
      ? "Captive Portal Announcement"
      : "Terms and Conditions";

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setContentLoading(true);
        setContentError(null);

        const [annRes, termsRes] = await Promise.all([
          getAnnouncement(),
          getTerms(),
        ]);

        const ann = annRes?.data || {};
        setAnnouncementContent(ann.announcement_content || "");
        setAnnouncementDraft(ann.announcement_content || "");
        setAnnouncementCreatedAt(ann.created_at || null);

        const tc = termsRes?.data || {};
        setTermsContent(tc.content || "");
        setTermsDraft(tc.content || "");
        setTermsVersion(tc.version || "");
        setTermsCreatedAt(tc.created_at || null);
      } catch (err) {
        console.error("fetchContent error:", err);
        setContentError("Failed to load content.");
      } finally {
        setContentLoading(false);
      }
    };

    fetchContent();
  }, []);

  if (profileLoading) {
    return <p>Loading...</p>;
  }

  const currentContent =
    safeActiveTab === "announcement" ? announcementContent : termsContent;
  const currentDraft =
    safeActiveTab === "announcement" ? announcementDraft : termsDraft;
  const currentCreatedAt =
    safeActiveTab === "announcement" ? announcementCreatedAt : termsCreatedAt;

  const setCurrentDraft = (value) => {
    if (safeActiveTab === "announcement") {
      setAnnouncementDraft(value);
    } else {
      setTermsDraft(value);
    }
  };

  const hasChanges = currentDraft !== currentContent;

  const startEdit = () => {
    if (!canEdit) return;
    setCurrentDraft(currentContent);
    setIsEditing(true);
  };

  const discardChanges = () => {
    setCurrentDraft(currentContent);
    setIsEditing(false);
  };

  const publishChanges = async () => {
    if (!canEdit) return;

    try {
      setContentLoading(true);
      setContentError(null);

      if (safeActiveTab === "announcement") {
        const res = await publishAnnouncement(currentDraft);
        const ann = res.data;
        setAnnouncementContent(ann.announcement_content || "");
        setAnnouncementDraft(ann.announcement_content || "");
        setAnnouncementCreatedAt(ann.created_at);
      } else {
        const nextVersion =
          termsVersion && termsVersion.startsWith("v")
            ? `v${parseInt(termsVersion.slice(1) || "1", 10) + 1}`
            : "v1";

        const res = await publishTerms(currentDraft, nextVersion);
        const tc = res.data;
        setTermsContent(tc.content || "");
        setTermsDraft(tc.content || "");
        setTermsVersion(tc.version || "");
        setTermsCreatedAt(tc.created_at);
      }

      setIsEditing(false);
    } catch (err) {
      console.error(err);
      setContentError("Failed to publish changes.");
    } finally {
      setContentLoading(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "-- --";
    const d = new Date(iso);
    return d.toLocaleDateString();
  };

  return (
    <div className="device-page">
      <h1 className="page-title">Device</h1>

      <Tabs
        tabs={tabs}
        activeTab={safeActiveTab}
        onTabChange={(value) => {
          setActiveTab(value);
          setIsEditing(false);
        }}
      />

      <div className="device-content">
        <div className="left-panel">
          <div className="editor-section">
            <div className="section-header">
              <h2 className="section-title">{sectionTitle}</h2>
              {canEdit && !isEditing && (
                <button
                  className="edit-icon"
                  onClick={startEdit}
                  disabled={contentLoading}
                >
                  Edit
                </button>
              )}
            </div>

            {contentError && (
              <div className="error-text">{contentError}</div>
            )}

            <textarea
              className="announcement-box"
              value={isEditing ? currentDraft : currentContent}
              onChange={(e) => setCurrentDraft(e.target.value)}
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
                  <span>{formatDate(currentCreatedAt)}</span>
                </div>
              </div>

              {safeActiveTab === "terms" && termsVersion && (
                <div className="tc-version">Version: {termsVersion}</div>
              )}

              {canEdit && isEditing && hasChanges && (
                <div className="editor-actions">
                  <button
                    className="discard-btn"
                    onClick={discardChanges}
                    disabled={contentLoading}
                  >
                    Discard
                  </button>
                  <button
                    className="publish-btn"
                    onClick={publishChanges}
                    disabled={contentLoading}
                  >
                    {contentLoading ? "Publishing..." : "Publish"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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
