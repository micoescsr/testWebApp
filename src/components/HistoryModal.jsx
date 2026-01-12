import { useState } from "react";
import "./HistoryModal.css";

const HistoryModal = ({ onClose, vulnerability }) => {
  const [activeRecommendationTab, setActiveRecommendationTab] =
    useState("nist");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span
              className={`severity ${vulnerability.severity.toLowerCase()}`}
            >
              {vulnerability.severity}
            </span>
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
                <p className="cvss-vector">{vulnerability.cvssVector}</p>
              </div>
            </div>
            <h3>Description</h3>
            <p className="description-text">{vulnerability.description}</p>
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
                  {vulnerability.recommendations.nist.map((rec, index) => (
                    <li key={index}>
                      <span className="rec-text">{rec}</span>
                      <button className="rec-expand">▶</button>
                    </li>
                  ))}
                </ul>
              )}
              {activeRecommendationTab === "owasp" && (
                <ul>
                  {vulnerability.recommendations.owasp.map((rec, index) => (
                    <li key={index}>
                      <span className="rec-text">{rec}</span>
                      <button className="rec-expand">▶</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
