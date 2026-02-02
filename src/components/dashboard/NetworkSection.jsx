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
} from "recharts";
import { COLORS } from "../../data/dashboardData";
import LegendForScore from "./LegendForScore";

const NetworkSection = ({ showLegend, toggleLegend, data }) => {
  if (!data) return null;

  const {
    riskScoreData,
    severityData,
    threatsData,
    commonVulnsData,
    detectedThreatsData,
  } = data;

  return (
    <>
      {/* Per-network stat cards */}
      <div className="dash-stats-row-6">
        <div className="stat-card">
          <p className="stat-label">Last Scan</p>
          <p className="stat-value">11/14/2025</p>
        </div>
        <div className="stat-card stat-highlight">
          <div className="stat-indicator"></div>
          <p className="stat-label">Status as of previous scan</p>
          <p className="stat-value">80%</p>
          <p className="stat-sublabel">7d ago</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Network Encryption</p>
          <p className="stat-value">OPEN</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Scanned Vulnerabilities</p>
          <p className="stat-value">5</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Detected Threats</p>
          <p className="stat-value">2</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Connected Clients</p>
          <p className="stat-value">12</p>
        </div>
      </div>

      {/* Middle row */}
      <div className="dash-main-row">
        {/* Risk score */}
        <div className="panel">
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

        {/* Severity */}
        <div className="panel">
          <div className="panel-header">
            <h2>Severity Rankings</h2>
          </div>
          <div className="panel-body">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData}>
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Threat breakdown */}
        <div className="panel">
          <div className="panel-header">
            <h2>Threat Breakdown</h2>
          </div>
          <div className="panel-body threat-row">
            <div className="threat-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={threatsData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {threatsData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="threat-legend">
              {threatsData.map((t, index) => (
                <div key={t.name} className="threat-row-item">
                  <span
                    className="legend-dot"
                    style={{
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                  <span className="legend-label">{t.name}</span>
                  <span className="legend-value">
                    {t.value.toFixed(2)}%
                    {t.name === "Evil Twins" ? " (3)" : " (2)"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="dash-bottom-row">
        {/* Scanned vulnerabilities */}
        <div className="panel">
          <div className="panel-header">
            <h2>Scanned Vulnerabilities</h2>
            <select className="small-select">
              <option>High - Low</option>
            </select>
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

        {/* Detected threats */}
        <div className="panel">
          <div className="panel-header">
            <h2>Detected Threats</h2>
            <select className="small-select">
              <option>High - Low</option>
            </select>
          </div>
          <div className="panel-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={detectedThreatsData} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {detectedThreatsData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={index === 0 ? "#ef4444" : "#f97316"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
};

export default NetworkSection;
