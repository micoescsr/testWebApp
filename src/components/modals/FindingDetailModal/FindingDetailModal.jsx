// components/modals/FindingDetailModal/FindingDetailModal.jsx
import { useState } from "react";
import BaseModal from "../../common/Modal/BaseModal";
import SeverityBadge from "../../common/SeverityBadge/SeverityBadge";
import "./FindingDetailModal.css";

const FindingDetailModal = ({ onClose, vulnerability, loading }) => {
  const [activeRecommendationTab, setActiveRecommendationTab] =
    useState("nist");

  if (loading || !vulnerability) {
    return (
      <BaseModal
        isOpen={true}
        onClose={onClose}
        className="finding-detail-modal"
        header={
          <>
            <div className="modal-title-row">
              <h2>Loading...</h2>
            </div>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </>
        }
      >
        <p>Loading details, please wait.</p>
      </BaseModal>
    );
  }

  return (
    <BaseModal
      isOpen={true}
      onClose={onClose}
      className="finding-detail-modal"
      ariaLabel={`${vulnerability.severity} ${vulnerability.name}`}
      header={
        <>
          <div className="modal-title-row">
            <SeverityBadge level={vulnerability.severity} />
            <h2>{vulnerability.name}</h2>
            <button className="modal-info-btn">ⓘ</button>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </>
      }
    >
      <div className="modal-section">
        <div className="description-header">
          <div className="cvss-info">
            <p className="cvss-score">
              CVSS Base Score ({vulnerability.cvss})
            </p>
            <p className="cvss-vector">
              {vulnerability.cvssVector}
            </p>
          </div>
        </div>
        <h3>Description</h3>
        <p className="description-text">
          {vulnerability.description}
        </p>
      </div>

      <div className="modal-section">
        <h3>Recommendations</h3>
        <div className="recommendation-tabs">
          <button
            className={`rec-tab ${
              activeRecommendationTab === "nist" ? "active" : ""
            }`}
            onClick={() => setActiveRecommendationTab("nist")}
          >
            NIST
          </button>
          <button
            className={`rec-tab ${
              activeRecommendationTab === "owasp" ? "active" : ""
            }`}
            onClick={() => setActiveRecommendationTab("owasp")}
          >
            OWASP
          </button>
        </div>

        <div className="recommendation-content">
          {activeRecommendationTab === "nist" && (
            <ul>
              {vulnerability.recommendations.nist.map(
                (rec, index) => (
                  <li key={index}>
                    <span className="rec-text">{rec}</span>
                    <button className="rec-expand">▶</button>
                  </li>
                )
              )}
            </ul>
          )}
          {activeRecommendationTab === "owasp" && (
            <ul>
              {vulnerability.recommendations.owasp.map(
                (rec, index) => (
                  <li key={index}>
                    <span className="rec-text">{rec}</span>
                    <button className="rec-expand">▶</button>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </div>
    </BaseModal>
  );
};

export default FindingDetailModal;
