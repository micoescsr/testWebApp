// components/modals/FindingDetailModal/FindingDetailModal.jsx
import { useState } from "react";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import SeverityBadge from "../../common/SeverityBadge/SeverityBadge";
import "./FindingDetailModal.css";

const FindingDetailModal = ({ onClose, vulnerability, loading }) => {
  const [activeRecommendationTab, setActiveRecommendationTab] =
    useState("nist");
  const containerRef = useFocusTrap(true, onClose);

  if (loading || !vulnerability) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          ref={containerRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div className="modal-title-row">
              <h2>Loading...</h2>
            </div>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <p>Loading details, please wait.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={`${vulnerability.severity} ${vulnerability.name}`}
        tabIndex={-1}
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <SeverityBadge level={vulnerability.severity} />
            <h2>{vulnerability.name}</h2>
            <button className="modal-info-btn">ⓘ</button>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
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
        </div>
      </div>
    </div>
  );
};

export default FindingDetailModal;
