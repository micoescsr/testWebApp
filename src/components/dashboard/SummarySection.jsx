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

  const {
    // stat cards
    lastScan,
    openNetworks,
    encryptedNetworks,
    totalFindings,
    totalClients,
    // charts
    riskScoreData,
    severityData,
    topRisks,
    networkEncryptionData,
  } = data;

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

  const formatShortDate = (value) =>
    value ? new Date(value).toLocaleDateString() : "N/A";

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
          <p className="stat-value">{formatShortDate(lastScan)}</p>
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
          <p className="stat-value">{openNetworks ?? 0}</p>
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
          <p className="stat-value">{encryptedNetworks ?? 0}</p>
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
          <p className="stat-value">{totalFindings ?? 0}</p>
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
          <p className="stat-value">{totalClients ?? 0}</p>
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
                    {riskScoreData?.[0]?.value ?? 0}%
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
                  onMouseOver={(payload) =>
                    payload &&
                    setHoverContext({
                      dimension: "severity_kind",
                      key: {
                        severity: payload.severity,
                        kind: "VULNERABILITY",
                      },
                    })
                  }
                />
                <Bar
                  dataKey="threats"
                  name="Threats"
                  fill={COLORS[1]}
                  onMouseOver={(payload) =>
                    payload &&
                    setHoverContext({
                      dimension: "severity_kind",
                      key: { severity: payload.severity, kind: "THREAT" },
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
              <span className="col-ssid">SSID</span>
              <span className="col-risk">RISK %</span>
              <span className="col-sev">SEVERITIES</span>
              <span className="col-clients">CLIENTS</span>
            </div>
            {topRisks?.map((item) => (
              <div
                key={item.ssid}
                className={`top-row ${isHoveredNetwork(item.ssid) ? "hover-highlight" : ""}`}
                onMouseEnter={() =>
                  setHoverContext({ dimension: "network", key: item.ssid })
                }
                onMouseLeave={clearHoverContext}
              >
                <span className="col-ssid">{item.ssid}</span>
                <span className="col-risk score-link">{item.risk}</span>
                <span className="col-sev">{item.severityCount}</span>
                <span className="col-clients">{item.clients}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Bottom row: Network Pie */}
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
                    onMouseOver={(payload) =>
                      payload?.name &&
                      setHoverContext({
                        dimension: "encryption",
                        key: payload.name,
                      })
                    }
                  >
                    {networkEncryptionData?.map((entry, index) => (
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
              {networkEncryptionData?.map((t, index) => (
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
      </div>
    </>
  );
};

export default SummarySection;
