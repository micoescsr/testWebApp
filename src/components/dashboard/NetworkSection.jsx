// components/dashboard/NetworkSection.jsx
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
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { COLORS } from "../../data/dashboardData";
import LegendForScore from "./LegendForScore";

const NetworkSection = ({
  showLegend,
  toggleLegend,
  data,
  hoverContext,
  setHoverContext,
  clearHoverContext,
}) => {
  if (!data) return null;

  const {
    riskScoreData,
    severityData,
    commonVulnsData,
  } = data;

  const kindSplitData = [
    { name: "THREAT", value: 2 },
    { name: "VULNERABILITY", value: 3 },
  ];

  const clientsRiskTrendData = [
    { scan: "Scan 1", clients: 8, risk: 70 },
    { scan: "Scan 2", clients: 10, risk: 75 },
    { scan: "Scan 3", clients: 12, risk: 78 },
    { scan: "Scan 4", clients: 15, risk: 82 },
  ];

  const isCard = (key) =>
    hoverContext &&
    hoverContext.dimension === "card" &&
    hoverContext.key === key;

  const isHoveredKind = (name) =>
    hoverContext &&
    hoverContext.dimension === "kind" &&
    hoverContext.key === name;

  const isHoveredSeverityKind = (sev, kind) =>
    hoverContext &&
    hoverContext.dimension === "severity_kind" &&
    hoverContext.key &&
    hoverContext.key.severity === sev &&
    hoverContext.key.kind === kind;

  return (
    <>
      {/* Per-network stat cards */}
      <div className="dash-stats-row-6">
        {/* Last Scan ↔ Gauge */}
        <div
          className={`stat-card ${
            isCard("net_last_scan") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "net_last_scan" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Last Scan</p>
          <p className="stat-value">11/14/2025</p>
        </div>

        {/* Previous status ↔ Gauge/Trend */}
        <div
          className={`stat-card stat-highlight ${
            isCard("net_prev_status") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "net_prev_status" })
          }
          onMouseLeave={clearHoverContext}
        >
          <div className="stat-indicator"></div>
          <p className="stat-label">Status as of previous scan</p>
          <p className="stat-value">80%</p>
          <p className="stat-sublabel">7d ago</p>
        </div>

        {/* Encryption ↔ Threat/Vuln donut */}
        <div
          className={`stat-card ${
            isCard("net_encryption") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "net_encryption" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Network Encryption</p>
          <p className="stat-value">OPEN</p>
        </div>

        {/* Vulns ↔ Severity bar + issues list */}
        <div
          className={`stat-card ${
            isCard("net_vulns") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "net_vulns" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Scanned Vulnerabilities</p>
          <p className="stat-value">5</p>
        </div>

        {/* Threats ↔ Threat/Vuln donut */}
        <div
          className={`stat-card ${
            isCard("net_threats") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "net_threats" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Detected Threats</p>
          <p className="stat-value">2</p>
        </div>

        {/* Clients ↔ Clients vs Risk line */}
        <div
          className={`stat-card ${
            isCard("net_clients") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "net_clients" })
          }
          onMouseLeave={clearHoverContext}
        >
          <p className="stat-label">Connected Clients</p>
          <p className="stat-value">12</p>
        </div>
      </div>

      {/* Middle row: Gauge + Threat/Vuln donut + grouped Severity bar */}
      <div className="dash-main-row">
        {/* Network Risk Gauge */}
        <div
          className={`panel ${
            isCard("net_last_scan") || isCard("net_prev_status")
              ? "hover-highlight"
              : ""
          }`}
        >
          <div className="panel-header">
            <h2>Network Risk Score</h2>
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

        {/* Threat vs Vulnerability donut */}
        <div
          className={`panel ${
            isCard("net_encryption") || isCard("net_threats")
              ? "hover-highlight"
              : ""
          }`}
        >
          <div className="panel-header">
            <h2>Threat vs Vulnerability</h2>
          </div>
          <div className="panel-body threat-row">
            <div className="threat-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart onMouseLeave={clearHoverContext}>
                  <Pie
                    data={kindSplitData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    onMouseOver={(data) =>
                      setHoverContext({
                        dimension: "kind",
                        key: data.name,
                      })
                    }
                  >
                    {kindSplitData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={entry.name === "VULNERABILITY" ? COLORS[0] : COLORS[1]}
                        opacity={
                          hoverContext &&
                          hoverContext.dimension === "kind" &&
                          !isHoveredKind(entry.name)
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
              {kindSplitData.map((k, index) => (
                <div
                  key={k.name}
                  className={`threat-row-item ${
                    isHoveredKind(k.name) ? "hover-highlight" : ""
                  }`}
                >
                  <span
                    className="legend-dot"
                    style={{
                      backgroundColor: k.name === "VULNERABILITY" ? COLORS[0] : COLORS[1],
                    }}
                  />
                  <span className="legend-label">{k.name}</span>
                  <span className="legend-value">{k.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Severity by Rating (VULN vs THREAT) */}
        <div
          className={`panel ${
            isCard("net_vulns") ? "hover-highlight" : ""
          }`}
        >
          <div className="panel-header">
            <div>
              <h2>Severity by Rating</h2>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Split by Vulnerability vs Threat
              </span>
            </div>
          </div>
          <div className="panel-body">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={severityData}
                onMouseLeave={clearHoverContext}
              >
                <XAxis type="number" />
                <YAxis dataKey="severity" type="category" width={90} />
                <Tooltip />
                <Bar
                  dataKey="vulnerabilities"
                  name="Vulnerabilities"
                  fill={COLORS[0]}
                >
                  {severityData.map((entry) => (
                    <Cell
                      key={`vuln-${entry.severity}`}
                      fill={COLORS[0]}
                      opacity={
                        hoverContext &&
                        (hoverContext.dimension === "kind" ||
                          hoverContext.dimension === "severity_kind")
                          ? isHoveredSeverityKind(
                              entry.severity,
                              "VULNERABILITY"
                            ) ||
                            hoverContext.dimension === "kind" &&
                              hoverContext.key === "VULNERABILITY"
                            ? 1
                            : 0.4
                          : 1
                      }
                      onMouseOver={() =>
                        setHoverContext({
                          dimension: "severity_kind",
                          key: {
                            severity: entry.severity,
                            kind: "VULNERABILITY",
                          },
                        })
                      }
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="threats"
                  name="Threats"
                  fill={COLORS[1]}
                >
                  {severityData.map((entry) => (
                    <Cell
                      key={`threat-${entry.severity}`}
                      fill={COLORS[1]}
                      opacity={
                        hoverContext &&
                        (hoverContext.dimension === "kind" ||
                          hoverContext.dimension === "severity_kind")
                          ? isHoveredSeverityKind(
                              entry.severity,
                              "THREAT"
                            ) ||
                            hoverContext.dimension === "kind" &&
                              hoverContext.key === "THREAT"
                            ? 1
                            : 0.4
                          : 1
                      }
                      onMouseOver={() =>
                        setHoverContext({
                          dimension: "severity_kind",
                          key: {
                            severity: entry.severity,
                            kind: "THREAT",
                          },
                        })
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom row: Clients trend + Top issues list */}
      <div className="dash-bottom-row">
        {/* Clients Trend Line */}
        <div
          className={`panel ${
            isCard("net_clients") ? "hover-highlight" : ""
          }`}
        >
          <div className="panel-header">
            <h2>Clients vs Risk Over Scans</h2>
          </div>
          <div className="panel-body">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={clientsRiskTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="scan" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="clients"
                  stroke="#2563eb"
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="risk"
                  stroke="#f97316"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top High-Risk Issues */}
        <div
          className={`panel ${
            isCard("net_vulns") ? "hover-highlight" : ""
          }`}
        >
          <div className="panel-header">
            <h2>Top High-Risk Issues</h2>
          </div>
          <div className="panel-body">
            <div className="vuln-list-detailed">
              {commonVulnsData.map((v) => (
                <div key={v.name} className="vuln-item-detailed">
                  <div className="vuln-severity-badge">{v.severity}</div>
                  <div className="vuln-details">
                    <p className="vuln-name">{v.name}</p>
                  </div>
                  <div
                    className={`vuln-indicator ${v.severity.toLowerCase()}`}
                  ></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default NetworkSection;
