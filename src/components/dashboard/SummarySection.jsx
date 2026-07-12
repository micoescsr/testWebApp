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
  LabelList,
} from "recharts";
import { useState } from "react";
import { COLORS } from "../../data/dashboardData";
import LegendForScore from "./LegendForScore";
import DashboardDetailDrawer from "./DashboardDetailDrawer";
import SummaryDetailContent from "./SummaryDetailContent";
import HistoricalTrendsSection from "./HistoricalTrendsSection";
import SeverityBadge from "../common/SeverityBadge/SeverityBadge";
import {
  getRiskLabel,
  riskColorForScore,
  severityColor,
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
  vulnFindings: {
    title: "Vulnerability Findings",
    subtitle: "Security weaknesses identified during assessment",
  },
  threatEvents: {
    title: "Threat Findings",
    subtitle: "Threat findings recorded by the assessment scans",
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
    title: "Vulnerability Severity Distribution",
    subtitle: "Vulnerability findings per severity rating",
  },
};

/** Flatten the 3 detailed-finding buckets into one row list (same shape the
 *  drawer uses) so the Threat Monitoring section can derive threat rows. */
const flattenDetailedFindings = (detailedFindings = {}) => [
  ...(detailedFindings.openAndWeakCrypto || []),
  ...(detailedFindings.misconfigurations || []),
  ...(detailedFindings.activeThreats || []),
];

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
    detailedFindings = {},
    lastScan,
    openNetworks,
    encryptedNetworks,
    totalClients,
    networksRepresented,
    summaryContext,
  } = data;

  const isHistorical = summaryContext?.isHistorical === true;
  const selectedDateLabel = summaryContext?.selectedDate
    ? new Date(`${summaryContext.selectedDate}T00:00:00`).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" }
      )
    : null;
  const scopeLabel = isHistorical
    ? `As of ${selectedDateLabel}`
    : "Latest available scans";

  const riskScore = riskScoreData?.[0]?.value ?? 0;
  const riskLabel = getRiskLabel(riskScore);

  // ── Separate vulnerability vs threat totals (both already split per
  // severity in the summary payload — no combined "findings" total shown). ──
  const totalVulnerabilities = severityData.reduce(
    (sum, s) => sum + (s.vulnerabilities || 0),
    0
  );
  const totalThreats = severityData.reduce(
    (sum, s) => sum + (s.threats || 0),
    0
  );
  const totalNetworks = (openNetworks ?? 0) + (encryptedNetworks ?? 0);

  // Vulnerability-only severity distribution (threat events live in their own
  // section — never mixed into this chart).
  const vulnSeverityData = severityData.map((s) => ({
    severity: s.severity,
    count: s.vulnerabilities || 0,
  }));
  const hasVulnSeverity = vulnSeverityData.some((s) => s.count > 0);

  // High/Critical threat events count.
  const highSevThreats = severityData
    .filter((s) => s.severity === "Critical" || s.severity === "High")
    .reduce((sum, s) => sum + (s.threats || 0), 0);

  // Threat rows from the detailed findings payload (name includes WFVT code).
  const threatRows = flattenDetailedFindings(detailedFindings).filter(
    (f) => f.kind === "Threat"
  );

  // Threat Events by Type — group threat rows by finding name.
  const threatTypeMap = {};
  threatRows.forEach((t) => {
    const name = t.finding || "Unknown";
    threatTypeMap[name] = (threatTypeMap[name] || 0) + 1;
  });
  const threatTypeData = Object.entries(threatTypeMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const mostDetectedThreat = threatTypeData[0]?.name || null;

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

  // Small helper for the linked-hover stat cards (keeps JSX flat).
  const statCard = ({ key, label, value, sub, drawerType, extraClass = "" }) => (
    <div
      className={`stat-card ${drawerType ? "dash-clickable" : ""} ${
        isCard(key) ? "hover-highlight" : ""
      } ${extraClass}`}
      onMouseEnter={() => setHoverContext({ dimension: "card", key })}
      onMouseLeave={clearHoverContext}
      {...(drawerType ? interactive(drawerType) : {})}
    >
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sublabel">{sub}</p>}
    </div>
  );

  return (
    <>
      {/* ── Historical context banner ── */}
      {isHistorical && (
        <p className="dash-context-note" role="status">
          Showing the latest available scan for each network as of{" "}
          {selectedDateLabel}.
        </p>
      )}

      {/* ── Security summary cards ── */}
      <div className="dash-stats-row">
        {statCard({
          key: "last_scan",
          label: isHistorical ? "Latest Scan in Selection" : "Last Scan",
          value: formatDate(lastScan),
          sub: scopeLabel,
        })}
        {isHistorical
          ? statCard({
              key: "total_networks",
              label: "Networks Represented",
              value: networksRepresented ?? 0,
              sub: "Networks with a completed scan by this date",
            })
          : statCard({
              key: "total_networks",
              label: "Total Networks",
              value: totalNetworks,
              sub: scopeLabel,
              drawerType: "encryptionDist",
            })}
        {statCard({
          key: "total_vulns",
          label: "Vulnerability Findings",
          value: totalVulnerabilities,
          sub: scopeLabel,
          drawerType: "vulnFindings",
        })}
        {statCard({
          key: "total_threats",
          label: "Detected Threats",
          value: totalThreats,
          sub: scopeLabel,
          drawerType: "threatEvents",
        })}
        {isHistorical
          ? statCard({
              key: "total_clients",
              label: "Total Clients (All Networks)",
              value: "—",
              sub: "Client totals were not stored for this historical Summary.",
              extraClass: "stat-card--unavailable",
            })
          : statCard({
              key: "total_clients",
              label: "Total Clients (All Networks)",
              value: totalClients ?? 0,
              sub: scopeLabel,
              drawerType: "clients",
            })}
      </div>

      {/* ── Vulnerability Overview ── */}
      <section aria-labelledby="dash-vuln-heading" className="dash-section">
        <h2 id="dash-vuln-heading" className="dash-section-title">
          Vulnerability Overview
        </h2>
        <div className="dash-main-row">
          {/* Risk Gauge */}
          <div
            className={`panel ${isCard("last_scan") ? "hover-highlight" : ""}`}
          >
            <div className="panel-header">
              <h3>Wi-Fi Security Risk Score</h3>
              <div className="panel-actions">
                <button
                  className="toggle-btn"
                  onClick={toggleLegend}
                  aria-expanded={showLegend}
                  aria-label={
                    showLegend ? "Hide score legend" : "Show score legend"
                  }
                >
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

          {/* Vulnerability Severity Distribution (vulnerability findings only) */}
          <div
            className={`panel ${
              isCard("total_vulns") ? "hover-highlight" : ""
            }`}
          >
            <div
              className="panel-header dash-clickable"
              {...interactive("severityKind")}
            >
              <div>
                <h3>Vulnerability Severity Distribution</h3>
                <span className="panel-subtitle">
                  Vulnerability findings per severity rating
                </span>
              </div>
            </div>
            <div className="panel-body">
              {hasVulnSeverity ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={vulnSeverityData}
                    onMouseLeave={clearHoverContext}
                  >
                    <XAxis dataKey="severity" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [value, "Vulnerability findings"]}
                    />
                    <Bar
                      dataKey="count"
                      name="Vulnerability findings"
                      radius={[4, 4, 0, 0]}
                      onMouseOver={(d) =>
                        setHoverContext({
                          dimension: "severity_kind",
                          key: { severity: d.severity, kind: "VULNERABILITY" },
                        })
                      }
                    >
                      <LabelList dataKey="count" position="top" />
                      {vulnSeverityData.map((entry) => (
                        <Cell
                          key={entry.severity}
                          fill={severityColor(entry.severity)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="panel-empty">
                  No vulnerability findings recorded in the latest scan.
                </p>
              )}
            </div>
          </div>

          {/* Top Risks Table */}
          <div
            className={`panel ${
              isCard("total_clients") ? "hover-highlight" : ""
            }`}
          >
            <div className="panel-header">
              <h3>Top 5 High-Risk Networks</h3>
            </div>
            <div className="panel-body top-networks">
              <div className="top-row top-head">
                <span className="col-ssid">SSID</span>
                <span className="col-risk">RISK %</span>
                <span
                  className="col-sev"
                  title="Includes vulnerability and threat findings."
                >
                  FINDINGS
                </span>
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
                      <span className="col-clients">{item.clients ?? "—"}</span>
                    </div>
                  ))}
                  <div className="top-row top-foot">
                    <span className="col-ssid">All Networks</span>
                    <span className="col-risk"></span>
                    <span className="col-sev">
                      {totalVulnerabilities + totalThreats}
                    </span>
                    <span className="col-clients">{totalClients ?? "—"}</span>
                  </div>
                </>
              ) : (
                <p className="panel-empty">No high-risk networks found</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Threat Monitoring ── */}
      <section aria-labelledby="dash-threat-heading" className="dash-section">
        <h2 id="dash-threat-heading" className="dash-section-title">
          Threat Monitoring
        </h2>
        <div className="dash-threat-row">
          {/* Threat metric tiles */}
          <div className="dash-threat-metrics">
            <div
              className={`stat-card dash-clickable ${
                isCard("total_threats") ? "hover-highlight" : ""
              }`}
              onMouseEnter={() =>
                setHoverContext({ dimension: "card", key: "total_threats" })
              }
              onMouseLeave={clearHoverContext}
              {...interactive("threatEvents")}
            >
              <p className="stat-label">Detected Threats</p>
              <p className="stat-value">{totalThreats}</p>
              <p className="stat-sublabel">{scopeLabel}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">High / Critical Threats</p>
              <p className="stat-value">{highSevThreats}</p>
              <p className="stat-sublabel">{scopeLabel}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Most Detected Threat</p>
              <p className="stat-value stat-value-text">
                {mostDetectedThreat || "—"}
              </p>
            </div>
          </div>

          {/* Threat Events by Type */}
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3>Threat Findings by Type</h3>
                <span className="panel-subtitle">
                  Threat findings grouped by threat type
                </span>
              </div>
            </div>
            <div className="panel-body threat-type-body">
              {threatTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={threatTypeData} layout="vertical">
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={180}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => [value, "Threat findings"]}
                    />
                    <Bar
                      dataKey="count"
                      name="Threat findings"
                      fill="var(--accent)"
                      radius={[0, 4, 4, 0]}
                      barSize={18}
                    >
                      <LabelList dataKey="count" position="right" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="panel-empty">
                  {isHistorical
                    ? "No threat findings recorded for the selected date."
                    : "No threat findings detected in the latest scans."}
                </p>
              )}
            </div>
          </div>

          {/* Recent Threat Activity */}
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3>Recent Threat Findings</h3>
                <span className="panel-subtitle">
                  {isHistorical
                    ? `Threat findings as of ${selectedDateLabel}`
                    : "Threat findings from the latest scans"}
                </span>
              </div>
            </div>
            <div className="panel-body">
              {threatRows.length > 0 ? (
                <ul className="threat-activity-list">
                  {threatRows.slice(0, 6).map((t, i) => (
                    <li key={`${t.finding}-${i}`} className="threat-activity-item">
                      <span className="threat-activity-main">
                        <span className="threat-activity-name">{t.finding}</span>
                        <span className="threat-activity-net">{t.network}</span>
                      </span>
                      <SeverityBadge level={t.severity} size="sm" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-empty">
                  {isHistorical
                    ? "No threat findings recorded for the selected date."
                    : "No threat findings detected in the latest scans."}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Historical Detection Trends ── */}
      <HistoricalTrendsSection />

      {/* ── Network encryption ── */}
      <section aria-labelledby="dash-net-heading" className="dash-section dash-bottom-full">
        <h2 id="dash-net-heading" className="dash-section-title">
          Network Encryption
        </h2>
        <div
          className={`panel ${
            isCard("total_networks") ? "hover-highlight" : ""
          }`}
        >
          <div
            className={`panel-header ${isHistorical ? "" : "dash-clickable"}`}
            {...(isHistorical ? {} : interactive("encryptionDist"))}
          >
            <h3>Networks by Encryption</h3>
          </div>
          {isHistorical ? (
            <div className="panel-body">
              <p className="panel-empty">
                Historical snapshot unavailable — historical encryption state
                was not stored for this period.
              </p>
            </div>
          ) : (
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
              <p className="panel-empty">No network encryption data available</p>
            )}
          </div>
          )}
        </div>
      </section>

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
