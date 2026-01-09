import { useState } from "react";
import Tabs from "../components/Tabs";
import "./SAM.css";

const SAM = () => {
  const [activeTab, setActiveTab] = useState("threats");
  const [selectedThreat, setSelectedThreat] = useState(null);

  const tabs = [
    { label: "Threats", value: "threats" },
    { label: "Vulnerabilities", value: "vulnerabilities" },
  ];

  const threats = [
    {
      severity: "CRITICAL",
      name: "Rogue AP",
      detectedTime: "Nov 14, 2025",
      score: "8.0",
      occurrences: 1,
      description:
        "A rogue access point is an unauthorized wireless access point that can allow attackers to intercept network traffic.",
      recommendations: [
        "Identify and remove unauthorized access points.",
        "Enable wireless intrusion detection systems (WIDS).",
        "Restrict physical access to networking equipment.",
      ],
    },
  ];

if (selectedThreat) {
  return (
    <div className="sam-page">
      <button
        className="back-btn"
        onClick={() => setSelectedThreat(null)}
      >
        Return
      </button>

      <h2 className="detail-title">Detailed View</h2>

      <div className="detail-card">
        <div className="detail-header">
          <span className="severity critical">CRITICAL</span>
          <h3>{selectedThreat.name}</h3>
        </div>

        <div className="detail-section">
          <h4>Description</h4>
          <p>{selectedThreat.description}</p>
        </div>

        <div className="detail-section">
          <div className="recommendation-header">
            <h4>Recommendations</h4>
            <span className="framework-tag">NIST</span>
          </div>

          <div className="recommendation-list">
            {selectedThreat.recommendations.map((rec, index) => (
              <div key={index} className="recommendation-item">
                <span className="rec-text">{rec}</span>
                <span className="arrow">›</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="export-btn">Export</button>
    </div>
  );
}

  return (
    <div className="sam-page">
      <h1 className="page-title">Security Assessment Management</h1>

      <div className="sam-header">
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="scan-info">
          <span className="scan-label">Last Scanned Time</span>
          <span className="scan-time">November 14, 2025</span>
        </div>
      </div>

      {activeTab === "threats" && (
        <div className="sam-card">
          <div className="sam-card-header">
            <h3>Detected Threats</h3>
            <select className="sort-dropdown">
              <option>High - Low</option>
            </select>
          </div>

          <table className="sam-table">
            <thead>
              <tr>
                <th>SEVERITY</th>
                <th>THREAT</th>
                <th>DETECTED TIME</th>
                <th>SEVERITY SCORE</th>
                <th>OCCURRENCES</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {threats.map((threat, index) => (
                <tr key={index}>
                  <td>
                    <span className="severity critical">
                      {threat.severity}
                    </span>
                  </td>
                  <td>{threat.name}</td>
                  <td>{threat.detectedTime}</td>
                  <td>{threat.score}</td>
                  <td>{threat.occurrences}</td>
                  <td
                    className="view-action"
                    onClick={() => setSelectedThreat(threat)}
                  >
                    VIEW
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sam-actions">
            <button className="export-btn">Export</button>
            <button className="clear-btn">Clear List</button>
          </div>
        </div>
      )}

      {activeTab === "vulnerabilities" && (
        <div className="sam-card">
          <div className="sam-card-header">
            <h3>Detected Vulnerabilities</h3>

            <select className="sort-dropdown">
              <option>High - Low</option>
              <option>Low - High</option>
            </select>
          </div>

          <table className="sam-table">
            <thead>
              <tr>
                <th>SEVERITY</th>
                <th>VULNERABILITY NAME</th>
                <th>SEVERITY SCORE</th>
                <th>DETECTED TIME</th>
                <th>ACTION</th>
              </tr>
            </thead>
          </table>

          <div className="empty-state">
            Nothing to analyze. Connect to a Wi-Fi
            <br />
            network to start scanning vulnerabilities.
          </div>

          <div className="sam-actions">
            <button className="export-btn"> Export</button>
            <button className="clear-btn"> Clear List</button>
          </div>
        </div>
      )}

    </div>
  );
};

export default SAM;