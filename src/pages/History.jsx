import { useState } from "react";
import Tabs from "../components/Tabs";
import HistoryModal from "../components/HistoryModal";
import "./History.css";

const History = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [expandedRow, setExpandedRow] = useState(null);
  const [selectedVulnerability, setSelectedVulnerability] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const tabs = [
    { label: "Vulnerabilities", value: "vulnerabilities" },
    { label: "Threats", value: "threats" },
  ];

  const vulnerabilityDetails = {
    "Unencrypted Network": {
      severity: "CRITICAL",
      name: "Unencrypted Network",
      cvss: "9.9",
      cvssVector: "CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:C/C:H/L:I/A:L",
      description:
        "An unencrypted network (open Wi-Fi) transmits traffic in cleartext because no WPA/WPA2/WPA3 encryption is used, allowing anyone in radio range to intercept or tamper with data.",
      recommendations: {
        nist: [
          "Use strong encryption and authentication for wireless communication...",
          "Separate WLAN networks by use case (e.g., guest/public vs internal/trusted)...",
          "Monitor the wireless infrastructure: perform periodic audits, detect unauthorized APs...",
        ],
        owasp: [
          "Implement WPA3 encryption where possible, falling back to WPA2 with strong passwords...",
          "Use certificate-based authentication (802.1X) for enterprise environments...",
          "Regularly update router firmware and disable WPS...",
        ],
      },
    },
  };

  const vulnerabilityHistory = [
    {
      id: 1,
      datetime: "2025-11-14 11:10 AM",
      ssid: "Free_WiFi",
      summary: 1,
      details: [
        {
          severity: "CRITICAL",
          name: "Unencrypted Network",
          score: "8.0",
        },
      ],
    },
  ];

  const threatHistory = [
    {
      id: 1,
      datetime: "2025-11-14 11:10 AM",
      ssid: "Free_WiFi",
      summary: 2,
      threats: [
        {
          severity: "CRITICAL",
          name: "Rogue AP",
          score: "8.0",
          occurrences: 1,
          window: "11:10 AM - 11:10 AM",
        },
        {
          severity: "HIGH",
          name: "MAC Spoofing",
          score: "6.5",
          occurrences: 3,
          window: "11:10 AM - 1:30 PM",
        },
      ],
    },
  ];

  const toggleExpand = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const openModal = (vulnerabilityName) => {
    setSelectedVulnerability(vulnerabilityDetails[vulnerabilityName]);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedVulnerability(null);
  };

  return (
    <div className="history-page">
      <h1 className="page-title">History</h1>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "vulnerabilities" && (
        <div className="history-card">
          <div className="history-card-header">
            <h3>Scanned Vulnerabilities</h3>
            <button className="filter-btn">DATE & TIME ▾</button>
          </div>

          <table className="history-table">
            <thead>
              <tr>
                <th>DATE & TIME</th>
                <th>SSID (TARGET NETWORK)</th>
                <th>SUMMARY COUNTS</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {vulnerabilityHistory.map((item) => (
                <>
                  <tr key={item.id}>
                    <td>{item.datetime}</td>
                    <td>{item.ssid}</td>
                    <td>{item.summary}</td>
                    <td
                      className="expand-btn"
                      onClick={() => toggleExpand(item.id)}
                    >
                      {expandedRow === item.id ? "Collapse ▲" : "Expand ▼"}
                    </td>
                  </tr>

                  {expandedRow === item.id && (
                    <>
                      <tr className="expanded-header">
                        <th>SEVERITY LEVEL</th>
                        <th>VULNERABILITY NAME</th>
                        <th>SEVERITY SCORE</th>
                        <th>ACTION</th>
                      </tr>

                      {item.details.map((vuln, index) => (
                        <tr className="expanded-data" key={index}>
                          <td>
                            <span
                              className={`severity ${vuln.severity.toLowerCase()}`}
                            >
                              {vuln.severity}
                            </span>
                          </td>
                          <td>{vuln.name}</td>
                          <td>{vuln.score}</td>
                          <td
                            className="view-action"
                            onClick={() => openModal(vuln.name)}
                          >
                            VIEW
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "threats" && (
        <div className="history-card">
          <div className="history-card-header">
            <h3>Detected Threats</h3>
            <button className="filter-btn">DATE & TIME ▾</button>
          </div>

          <table className="history-table">
            <thead>
              <tr>
                <th>DATE & TIME</th>
                <th>SSID (TARGET NETWORK)</th>
                <th>SUMMARY COUNTS</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {threatHistory.map((item) => (
                <>
                  <tr key={item.id}>
                    <td>{item.datetime}</td>
                    <td>{item.ssid}</td>
                    <td>{item.summary}</td>
                    <td
                      className="expand-btn"
                      onClick={() => toggleExpand(item.id)}
                    >
                      {expandedRow === item.id ? "Collapse ▲" : "Expand ▼"}
                    </td>
                  </tr>

                  {expandedRow === item.id && (
                    <tr className="expanded-row">
                      <td colSpan={4}>
                        <table className="inner-table">
                          <thead>
                            <tr>
                              <th>SEVERITY LEVEL</th>
                              <th>THREAT NAME</th>
                              <th>SEVERITY SCORE</th>
                              <th>OCCURRENCES</th>
                              <th>DETECTION WINDOW</th>
                              <th>ACTION</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.threats.map((threat, index) => (
                              <tr key={index}>
                                <td>
                                  <span
                                    className={`severity ${threat.severity.toLowerCase()}`}
                                  >
                                    {threat.severity}
                                  </span>
                                </td>
                                <td>{threat.name}</td>
                                <td>{threat.score}</td>
                                <td>{threat.occurrences}</td>
                                <td>{threat.window}</td>
                                <td className="view-action">VIEW</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && selectedVulnerability && (
        <HistoryModal
          onClose={closeModal}
          vulnerability={selectedVulnerability}
        />
      )}
    </div>
  );
};

export default History;
