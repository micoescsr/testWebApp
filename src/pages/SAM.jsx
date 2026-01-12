import { useState } from "react";
import Tabs from "../components/Tabs";
import "./SAM.css";

const SAM = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState(null);

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

  const availableNetworks = [
    "Nacho_WiFi",
    "TheGOODWiFi",
    "kWsk1N1nJ4ZX",
    "Back2HonoluluWiFi_5G",
    "LibrengWiFi:>",
    "Free_WiFi",
  ];

  if (selectedThreat) {
    return (
      <div className="sam-page">
        <button className="back-btn" onClick={() => setSelectedThreat(null)}>
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
    <div className={activeTab === "vulnerabilities" ? "sam-layout" : "sam-page"}>
      <div className="sam-main">
        <h1 className="page-title">Security Assessment Management</h1>

        <div className="sam-header">
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {activeTab === "threats" && (
          <div className="sam-card">
            <div className="sam-card-header">
              <h3>Detected Threats</h3>
              <select className="sort-dropdown">
                <option>High - Low</option>
                <option>Low - High</option>
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
                      <span className="severity critical">{threat.severity}</span>
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
              <button className="export-btn">📎 Export</button>
              <button className="clear-btn">🗑 Clear List</button>
            </div>
          </div>
        )}

        {activeTab === "vulnerabilities" && (
          <div className="sam-card">
            <div className="sam-card-header">
              <h3>Scanned Vulnerabilities</h3>
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
              No results available, please
              <br />
              conduct a vulnerability scan.
            </div>

            <div className="sam-actions">
              <button className="export-btn">📎 Export</button>
              <button className="clear-btn">🗑 Clear List</button>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar - Only show when vulnerabilities tab is active */}
      {activeTab === "vulnerabilities" && (
        <div className="sam-sidebar">
          <div className="sidebar-section">
            <div className="info-row">
              <span className="info-label">Current Network</span>
              <span className="info-value">N/A</span>
            </div>
            <div className="info-row">
              <span className="info-label">Last Scan</span>
              <span className="info-value">N/A</span>
            </div>
            <div className="info-row">
              <span className="info-label">Scheduled Scan</span>
              <span className="info-value">N/A</span>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Available Networks</h3>
            <div className="network-list">
              {availableNetworks.map((network, index) => (
                <div
                  key={index}
                  className={`network-item ${
                    selectedNetwork === network ? "active" : ""
                  }`}
                  onClick={() => setSelectedNetwork(network)}
                >
                  {network}
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <h3 className="sidebar-title">Network Details</h3>
              <button className="edit-btn">✏️</button>
            </div>
            <div className="network-form">
              <input type="text" placeholder="City" className="form-input" />
              <input type="text" placeholder="Province" className="form-input" />
              <textarea
                placeholder="Notes (e.g. SM Mall)"
                className="form-textarea"
                rows="4"
              ></textarea>
            </div>
          </div>

          <div className="sidebar-actions">
            <button className="action-btn">📁 Manage Scheduled Scans</button>
            <button className="action-btn">📅 Schedule Scan</button>
            <button className="action-btn primary">+ Scan Now</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SAM;
