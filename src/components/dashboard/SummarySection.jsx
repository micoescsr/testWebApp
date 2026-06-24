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
import { useState } from "react";
import { COLORS } from "../../data/dashboardData";
import LegendForScore from "./LegendForScore";
import DashboardDetailDrawer from "./DashboardDetailDrawer";
import SummaryDetailContent from "./SummaryDetailContent";
import {
  getRiskLabel,
  riskColorForScore,
  KIND_COLORS,
} from "../../utils/riskColors";

// Title/subtitle for each metric drawer.
const DETAIL_META = {
  open: {
    title: "Open Networks",
    subtitle: "Networks broadcasting without encryption",
  },
  encrypted: {
    title: "Encrypted Networks",
    subtitle: "Networks using encryption",
  },
  findings: {
    title: "Vulnerabilities & Threats",
    subtitle: "Detailed findings by category",
  },
  clients: {
    title: "Client Distribution",
    subtitle: "Connected clients per network",
  },
  encryptionDist: {
    title: "Networks by Encryption",
    subtitle: "Encryption distribution across detected networks",
  },
  severityKind: {
    title: "Severity by Kind",
    subtitle: "Vulnerabilities vs threats per severity",
  },
};

const SummarySection = ({
  showLegend,
  toggleLegend,
  data,
  hoverContext,
  setHoverContext,
  clearHoverContext,
  onSelectNetwork,
}) => {
  const [detailType, setDetailType] = useState(null);

  // Hooks must run before any early return.
  if (!data) return null;

  const openDetail = (type) => setDetailType(type);
  const closeDetail = () => setDetailType(null);
  const handleSelectNetwork = (networkId) => {
    closeDetail();
    onSelectNetwork?.(networkId);
  };

  // Props that make a card/panel keyboard-accessible and open its drawer.
  // (className is merged by each caller so it composes with hover state.)
  const interactive = (type) => ({
    role: "button",
    tabIndex: 0,
    onClick: () => openDetail(type),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(type);
      }
    },
  });
  const {
    riskScoreData = [],
    severityData = [],
    topRisks = [],
    networkEncryptionData = [],
    lastScan,
    openNetworks,
    encryptedNetworks,
    totalFindings,
    totalClients,
  } = data;

  const riskScore = riskScoreData?.[0]?.value ?? 0;
  const riskLabel = getRiskLabel(riskScore);

  // Derived encryption distribution (same data as the donut — no new metric).
  const encTotal = networkEncryptionData.reduce(
    (sum, e) => sum + (e.value || 0),
    0
  );
  const encWithPct = networkEncryptionData.map((e) => ({
    ...e,
    pct: encTotal > 0 ? Math.round((e.value / encTotal) * 100) : 0,
  }));
  const openPct = encWithPct.find((e) => e.name === "Open")?.pct ?? 0;
  const encInterpretation =
    encTotal === 0
      ? "No networks detected in the latest scan."
      : openPct === 0
      ? `All ${encTotal} detected networks are encrypted — no open networks exposing unprotected traffic.`
      : openPct >= 50
      ? `${openPct}% of detected networks are open and transmit traffic without encryption, the larger share of this environment.`
      : `${openPct}% of detected networks are open; the remaining ${
          100 - openPct
        }% use some form of encryption.`;

  // Format date for stat card
  const formatDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

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
        {/* Last Scan Γåö Risk Gauge */}
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
          <p className="stat-value">{formatDate(lastScan)}</p>
        </div>

        {/* Open Networks Γåö Networks by Encryption (pie) */}
        <div
          className={`stat-card dash-clickable ${
            isCard("open_networks") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "open_networks" })
          }
          onMouseLeave={clearHoverContext}
          {...interactive("open")}
        >
          <p className="stat-label">Open Networks</p>
          <p className="stat-value">{openNetworks ?? 0}</p>
        </div>

        {/* Encrypted Networks Γåö Networks by Encryption (pie) */}
        <div
          className={`stat-card dash-clickable ${
            isCard("encrypted_networks") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({
              dimension: "card",
              key: "encrypted_networks",
            })
          }
          onMouseLeave={clearHoverContext}
          {...interactive("encrypted")}
        >
          <p className="stat-label">Encrypted Networks</p>
          <p className="stat-value">{encryptedNetworks ?? 0}</p>
        </div>

        {/* Total vulns/threats Γåö Severity by Kind */}
        <div
          className={`stat-card dash-clickable ${
            isCard("total_findings") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "total_findings" })
          }
          onMouseLeave={clearHoverContext}
          {...interactive("findings")}
        >
          <p className="stat-label">Total Vulnerabilities/Threats</p>
          <p className="stat-value">{totalFindings ?? 0}</p>
        </div>

        {/* Total clients Γåö Top risks table */}
        <div
          className={`stat-card dash-clickable ${
            isCard("total_clients") ? "hover-highlight" : ""
          }`}
          onMouseEnter={() =>
            setHoverContext({ dimension: "card", key: "total_clients" })
          }
          onMouseLeave={clearHoverContext}
          {...interactive("clients")}
        >
          <p className="stat-label">Total Clients (All Networks)</p>
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
                {showLegend ? "▼" : "▶"}
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
                    fill={riskColorForScore(riskScore)}
                  />
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="radial-label"
                  >
                    {riskScore}%
                    <tspan x="50%" dy="1.5em" className="radial-sub">
                      {riskLabel} Risk
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
          <div className="panel-header dash-clickable" {...interactive("severityKind")}>
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
                  fill={KIND_COLORS.vulnerability}
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
                  fill={KIND_COLORS.threat}
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
              <span className="col-ssid">SSID</span>
              <span className="col-risk">RISK %</span>
              <span className="col-sev">SEVERITIES</span>
              <span className="col-clients">CLIENTS</span>
            </div>
            {topRisks.length > 0 ? (
              <>
                {topRisks.map((item) => (
                  <div
                    key={item.ssid}
                    className={`top-row ${
                      item.network_id ? "dash-clickable" : ""
                    } ${isHoveredNetwork(item.ssid) ? "hover-highlight" : ""}`}
                    onMouseEnter={() =>
                      setHoverContext({
                        dimension: "network",
                        key: item.ssid,
                      })
                    }
                    onMouseLeave={clearHoverContext}
                    {...(item.network_id
                      ? {
                          role: "button",
                          tabIndex: 0,
                          onClick: () => handleSelectNetwork(item.network_id),
                          onKeyDown: (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelectNetwork(item.network_id);
                            }
                          },
                        }
                      : {})}
                  >
                    <span className="col-ssid">{item.ssid}</span>
                    <span className="col-risk score-link">{item.risk}</span>
                    <span className="col-sev">{item.severityCount}</span>
                    <span className="col-clients">{item.clients}</span>
                  </div>
                ))}
                <div className="top-row top-foot">
                  <span className="col-ssid">All Networks</span>
                  <span className="col-risk"></span>
                  <span className="col-sev">{totalFindings ?? 0}</span>
                  <span className="col-clients">{totalClients ?? 0}</span>
                </div>
              </>
            ) : (
              <p style={{ color: "#6b7280", fontSize: 13, padding: "1rem" }}>
                No high-risk networks found
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: full-width Networks by Encryption (donut + breakdown) */}
      <div className="dash-bottom-full">
        <div
          className={`panel ${
            isCard("open_networks") || isCard("encrypted_networks")
              ? "hover-highlight"
              : ""
          }`}
        >
          <div className="panel-header dash-clickable" {...interactive("encryptionDist")}>
            <h2>Networks by Encryption</h2>
          </div>
          <div className="panel-body enc-full">
            {networkEncryptionData.length > 0 ? (
              <>
                <div className="enc-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart onMouseLeave={clearHoverContext}>
                      <Pie
                        data={networkEncryptionData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={95}
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

                <div className="enc-breakdown">
                  <div className="enc-legend">
                    {encWithPct.map((t, index) => (
                      <div
                        key={t.name}
                        className={`enc-legend-item ${
                          isHoveredEncryption(t.name) ? "hover-highlight" : ""
                        }`}
                        onMouseEnter={() =>
                          setHoverContext({
                            dimension: "encryption",
                            key: t.name,
                          })
                        }
                        onMouseLeave={clearHoverContext}
                      >
                        <span
                          className="legend-dot"
                          style={{
                            backgroundColor: COLORS[index % COLORS.length],
                          }}
                        />
                        <span className="legend-label">{t.name}</span>
                        <span className="enc-count">{t.value}</span>
                        <span className="enc-pct">{t.pct}%</span>
                      </div>
                    ))}
                    <div className="enc-legend-item enc-legend-total">
                      <span className="legend-dot enc-dot-muted" />
                      <span className="legend-label">Total networks</span>
                      <span className="enc-count">{encTotal}</span>
                      <span className="enc-pct">100%</span>
                    </div>
                  </div>
                  <p className="enc-interpretation">{encInterpretation}</p>
                </div>
              </>
            ) : (
              <p style={{ color: "#6b7280", fontSize: 13, padding: "1rem" }}>
                No network encryption data available
              </p>
            )}
          </div>
        </div>
      </div>

      <DashboardDetailDrawer
        open={detailType !== null}
        title={detailType ? DETAIL_META[detailType]?.title : ""}
        subtitle={detailType ? DETAIL_META[detailType]?.subtitle : ""}
        onClose={closeDetail}
      >
        <SummaryDetailContent
          type={detailType}
          data={data}
          onSelectNetwork={handleSelectNetwork}
        />
      </DashboardDetailDrawer>
    </>
  );
};

export default SummarySection;
