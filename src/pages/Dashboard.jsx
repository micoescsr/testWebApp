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
import "./Dashboard.css";

// Sample data (you can later fetch real values from backend)
const riskScoreData = [{ name: "Wi-Fi Risk", value: 89 }];

const severityData = [
  { name: "Critical", value: 8 },
  { name: "High", value: 6 },
  { name: "Medium", value: 4 },
  { name: "Low", value: 1 },
];

const threatsData = [
  { name: "MITM", value: 39.11 },
  { name: "Deauth", value: 28.02 },
  { name: "Evil Twins", value: 23.13 },
  { name: "MAC Spoofing", value: 5.03 },
];

const commonVulnsData = [
  { name: "Lack of Encryption", count: 12 },
  { name: "WPS Enabled", count: 8 },
  { name: "Weak Encryption (WEP/TKIP)", count: 7 },
  { name: "PMF Not Enforced", count: 3 },
];

const COLORS = ["#2563eb", "#4f46e5", "#22c55e", "#f97316"];

const Dashboard = () => {
  return (
    <div className="dashboard">
      {/* Top title bar */}
      <div className="dash-header">
        <h1>Dashboard</h1>
        <div className="dash-filters">
          <div className="filter-group">
            <label>Network</label>
            <select>
              <option>Summary</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Date</label>
            <select>
              <option>Nov 14, 2025</option>
            </select>
          </div>
        </div>
        <div className="device-status">
          <p className="status-label">Device Status</p>
          <p className="status-line">
            Model: <span>Raspberry Pi 5</span>
          </p>
          <p className="status-line">
            Status: <span className="status-online">Online ●</span>
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="dash-stats-row">
        <div className="stat-card">
          <p className="stat-label">Last Scan</p>
          <p className="stat-value">11/14/2025</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Open Networks</p>
          <p className="stat-value">14</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Encrypted Networks</p>
          <p className="stat-value">12</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Scanned Vulnerabilities</p>
          <p className="stat-value">30</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Detected Threats</p>
          <p className="stat-value">22</p>
        </div>
      </div>

      {/* Middle charts row */}
      <div className="dash-main-row">
        {/* Risk score radial chart */}
        <div className="panel">
          <div className="panel-header">
            <h2>Wi-Fi Security Risk Score</h2>
          </div>
          <div className="panel-body radial-wrapper">
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
                  fill="#ef4444"
                />
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="radial-label"
                >
                  89%
                  <tspan
                    x="50%"
                    dy="1.5em"
                    className="radial-sub"
                  >
                    High Risk
                  </tspan>
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity rankings bar chart */}
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

        {/* Top 5 high-risk networks */}
        <div className="panel">
          <div className="panel-header">
            <h2>Top 5 High-Risk Networks</h2>
          </div>
          <div className="panel-body top-networks">
            <div className="top-row top-head">
              <span>SSID</span>
              <span>Score</span>
            </div>
            {[
              { ssid: "Nacho_Wi-Fi", score: 80 },
              { ssid: "StarboxFreeWiFi", score: 78 },
              { ssid: "NenengsFreeWiFi", score: 75 },
              { ssid: "JubileeFreeWiFi", score: 73 },
              { ssid: "ManamFreeWiFi", score: 71 },
            ].map((item) => (
              <div key={item.ssid} className="top-row">
                <span>{item.ssid}</span>
                <span className="score-link">{item.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="dash-bottom-row">
        {/* Common vulnerabilities bar list */}
        <div className="panel">
          <div className="panel-header">
            <h2>Common Vulnerabilities</h2>
            <select className="small-select">
              <option>High - Low</option>
            </select>
          </div>
          <div className="panel-body">
            <div className="vuln-list">
              {commonVulnsData.map((v) => (
                <div key={v.name} className="vuln-item">
                  <div className="vuln-label-row">
                    <span>{v.name}</span>
                    <span className="vuln-count">{v.count}</span>
                  </div>
                  <div className="vuln-bar-bg">
                    <div
                      className="vuln-bar-fill"
                      style={{ width: `${(v.count / 12) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Threat breakdown pie chart */}
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
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="legend-label">{t.name}</span>
                  <span className="legend-value">
                    {t.value.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
