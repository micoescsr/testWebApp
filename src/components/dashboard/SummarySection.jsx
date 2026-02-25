// components/dashboard/SummarySection.jsx
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { COLORS } from "../../data/dashboardData";
import LegendForScore from "./LegendForScore";

const SummarySection = ({
  showLegend,
  toggleLegend,
  data,
  hoverContext,
  setHoverContext,
  clearHoverContext,
}) => {
  if (!data) return null;
  const { riskScoreData, severityData } = data;

  // Mock top risks table; replace with backend later
  const topRisks = [
    { ssid: "Nacho_Wi-Fi", risk: 80, severityCount: 10, clients: 22 },
    { ssid: "StarboxFreeWiFi", risk: 78, severityCount: 9, clients: 18 },
    { ssid: "NenengsFreeWiFi", risk: 75, severityCount: 8, clients: 15 },
    { ssid: "JubileeFreeWiFi", risk: 73, severityCount: 7, clients: 11 },
    { ssid: "ManamFreeWiFi", risk: 71, severityCount: 6, clients: 9 },
  ];

  // Mock open vs encrypted; replace with real encryption stats
  const networkEncryptionData = [
    { name: "Open", value: 14 },
    { name: "Encrypted", value: 12 },
  ];

  const isCard = (key) =>
    hoverContext &&
    hoverContext.dimension === "card" &&
    hoverContext.key === key;

  const isHoveredNetwork = (ssid) =>
    hoverContext &&
    hoverContext.dimension === "network" &&
    hoverContext.key === ssid;

  const isHoveredEncryption = (name) =>
    hoverContext &&
    hoverContext.dimension === "encryption" &&
    hoverContext.key === name;

  return (
    <>
      {/* Stat cards (drive related charts) */}
      <div className="dash-stats-row">
        {/* Last Scan ↔ Risk Gauge */}
        <div
          className={`stat-card ${
            isCard("last_scan") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "last_scan" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Last Scan</p>
          <p className="stat-value">11/14/2025</p>
        </div>

        {/* Open Networks ↔ Networks by Encryption (pie) */}
        <div
          className={`stat-card ${
            isCard("open_networks") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "open_networks" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Open Networks</p>
          <p className="stat-value">14</p>
        </div>

        {/* Encrypted Networks ↔ Networks by Encryption (pie) */}
        <div
          className={`stat-card ${
            isCard("encrypted_networks") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({
              dimension: "card",
              key: "encrypted_networks",
            })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Encrypted Networks</p>
          <p className="stat-value">12</p>
        </div>

        {/* Total vulns/threats ↔ Severity by Kind */}
        <div
          className={`stat-card ${
            isCard("total_findings") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "total_findings" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Total Vulnerabilities/Threats</p>
          <p className="stat-value">52</p>
        </div>

        {/* Total clients ↔ Top risks table */}
        <div
          className={`stat-card ${
            isCard("total_clients") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "total_clients" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Total Clients</p>
          <p className="stat-value">120</p>
        </div>
      </div>

      {/* Main row: Risk Gauge + Severity by Kind + Top Risks */}
      <div className="dash-main-row">
        {/* Risk Gauge */}
        <div
          className={`panel ${
            isCard("last_scan") ? "hover-highlight" : ""
          }`}
        >
          <div className="panel-header">
            <h2>Wi-Fi Security Risk Score</h2>
            <div className="panel-actions">
              <button className="toggle-btn" onClick={toggleLegend}>
                {showLegend ? "←" : "→"}
              </button>
            </div>
          </div>
          <div className="panel-body radial-wrapper">
            {!showLegend ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={riskScoreData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis
                    type="number"
                    domain={[0, 100]}
                    tick={false}
                  />
                  <RadialBar
                    background
                    dataKey="value"
                    cornerRadius={50}
                    fill="#f97316"
                  />
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="radial-label"
                  >
                    {riskScoreData[0]?.value ?? 0}%
                    <tspan x="50%" dy="1.5em" className="radial-sub">
                      High Risk
                    </tspan>
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
            ) : (
              <LegendForScore />
            )}
          </div>
        </div>

        {/* Severity by Kind (VULN vs THREAT) */}
        <div
          className={`panel ${
            isCard("total_findings") ? "hover-highlight" : ""
          }`}
        >
          <div className="panel-header">
            <div>
              <h2>Severity by Kind</h2>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Vulnerabilities vs threats per severity rating
              </span>
            </div>
          </div>
          <div className="panel-body">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={severityData}
                onMouseLeave={clearHoverContext}
              >
                <XAxis dataKey="severity" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="vulnerabilities"
                  name="Vulnerabilities"
                  fill={COLORS[0]}
                  onMouseOver={(data) =>
                    setHoverContext({
                      dimension: "severity_kind",
                      key: {
                        severity: data.severity,
                        kind: "VULNERABILITY",
                      },
                    })
                  }
                />
                <Bar
                  dataKey="threats"
                  name="Threats"
                  fill={COLORS[1]}
                  onMouseOver={(data) =>
                    setHoverContext({
                      dimension: "severity_kind",
                      key: { severity: data.severity, kind: "THREAT" },
                    })
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Risks Table */}
        <div
          className={`panel ${
            isCard("total_clients") ? "hover-highlight" : ""
          }`}
        >
          <div className="panel-header">
            <h2>Top 5 High-Risk Networks</h2>
          </div>
          <div className="panel-body top-networks">
            <div className="top-row top-head">
              <span>SSID</span>
              <span>RISK %</span>
              <span>SEVERITIES</span>
              <span>CLIENTS</span>
            </div>
            {topRisks.map((item) => (
              <div
                key={item.ssid}
                className={`top-row ${
                  isHoveredNetwork(item.ssid) ? "hover-highlight" : ""
                }`}
                onMouseEnter={() =>
                  setHoverContext({
                    dimension: "network",
                    key: item.ssid,
                  })
                }
                onMouseLeave={clearHoverContext}
              >
                <span>{item.ssid}</span>
                <span className="score-link">{item.risk}</span>
                <span>{item.severityCount}</span>
                <span>{item.clients}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: Network Pie + metric note */}
      <div className="dash-bottom-row">
        <div
          className={`panel ${
            isCard("open_networks") || isCard("encrypted_networks")
              ? "hover-highlight"
              : ""
          }`}
        >
          <div className="panel-header">
            <h2>Networks by Encryption</h2>
          </div>
          <div className="panel-body threat-row">
            <div className="threat-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart onMouseLeave={clearHoverContext}>
                  <Pie
                    data={networkEncryptionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    onMouseOver={(data) =>
                      setHoverContext({
                        dimension: "encryption",
                        key: data.name,
                      })
                    }
                  >
                    {networkEncryptionData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={COLORS[index % COLORS.length]}
                        opacity={
                          hoverContext &&
                          hoverContext.dimension === "encryption" &&
                          !isHoveredEncryption(entry.name)
                            ? 0.4
                            : 1
                        }
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="threat-legend">
              {networkEncryptionData.map((t, index) => (
                <div
                  key={t.name}
                  className={`threat-row-item ${
                    isHoveredEncryption(t.name) ? "hover-highlight" : ""
                  }`}
                >
                  <span
                    className="legend-dot"
                    style={{
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                  <span className="legend-label">{t.name}</span>
                  <span className="legend-value">{t.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

{/*         <div className="panel">
          <div className="panel-header">
            <h2>Metric Notes</h2>
          </div>
          <div className="panel-body">
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Wi-Fi Risk Score weights severity and vt_kind (threats vs
              vulnerabilities) plus encryption and client counts.
            </p>
          </div>
        </div> */}
      </div>
    </>
  );
};

export default SummarySection;
