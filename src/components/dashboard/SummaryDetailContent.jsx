// components/dashboard/SummaryDetailContent.jsx
//
// Renders the body of the dashboard metric-detail drawer for each metric type,
// using only data already present in the summary payload (no mock data). Rows
// that map to a single network deep-link into that network's view.
import SeverityBadge from "../common/SeverityBadge/SeverityBadge";
import { COLORS } from "../../data/dashboardData";
import { getRiskLevel } from "../../utils/riskColors";
import { bssidSuffix } from "../../utils/networkGrouping";

const EmptyState = ({ message }) => <p className="dd-empty">{message}</p>;

/** Clickable network row → switches to that network's view. */
const NetworkRow = ({ net, aside, onSelectNetwork }) => {
  const subParts = [];
  if (net.bssid) subParts.push(bssidSuffix(net.bssid));
  if (net.channel != null) subParts.push(`CH ${net.channel}`);
  return (
    <button
      type="button"
      className="dd-row"
      onClick={() => onSelectNetwork(net.network_id)}
    >
      <span className="dd-row-main">
        <span className="dd-row-title">{net.ssid}</span>
        {subParts.length > 0 && (
          <span className="dd-row-sub">{subParts.join(" · ")}</span>
        )}
      </span>
      <span className="dd-row-aside">{aside}</span>
    </button>
  );
};

const SummaryDetailContent = ({ type, data, onSelectNetwork }) => {
  const {
    networkDirectory = [],
    networkEncryptionData = [],
    severityData = [],
    detailedFindings = {},
    totalClients = 0,
  } = data || {};

  // ── Open / Encrypted network lists ──
  if (type === "open" || type === "encrypted") {
    const open = type === "open";
    const rows = networkDirectory.filter((n) =>
      open
        ? n.encryption_status === "Open"
        : n.encryption_status && n.encryption_status !== "Open"
    );
    if (rows.length === 0) {
      return (
        <EmptyState
          message={`No ${open ? "open" : "encrypted"} networks in the latest scan.`}
        />
      );
    }
    return (
      <div className="dd-list">
        {rows.map((n) => (
          <NetworkRow
            key={n.network_id}
            net={n}
            onSelectNetwork={onSelectNetwork}
            aside={
              <>
                {!open && n.encryption_status && (
                  <span className="dd-enc-badge">{n.encryption_status}</span>
                )}
                <SeverityBadge level={getRiskLevel(n.risk_score)} size="sm" />
              </>
            }
          />
        ))}
      </div>
    );
  }

  // ── Client distribution by network ──
  if (type === "clients") {
    const rows = [...networkDirectory]
      .filter((n) => (n.num_clients || 0) > 0)
      .sort((a, b) => (b.num_clients || 0) - (a.num_clients || 0));
    if (rows.length === 0) {
      return <EmptyState message="No client records available for any network." />;
    }
    return (
      <>
        <div className="dd-stat-line">
          <span>Total clients (all networks)</span>
          <span className="dd-stat-value">{totalClients}</span>
        </div>
        <div className="dd-list" style={{ marginTop: "var(--space-3)" }}>
          {rows.map((n) => (
            <NetworkRow
              key={n.network_id}
              net={n}
              onSelectNetwork={onSelectNetwork}
              aside={
                <span className="dd-stat-value">
                  {n.num_clients} client{n.num_clients === 1 ? "" : "s"}
                </span>
              }
            />
          ))}
        </div>
      </>
    );
  }

  // ── Networks by Encryption distribution ──
  if (type === "encryptionDist") {
    const total = networkEncryptionData.reduce((s, e) => s + (e.value || 0), 0);
    if (total === 0) {
      return <EmptyState message="No network encryption data available." />;
    }
    return (
      <div>
        {networkEncryptionData.map((e, i) => {
          const pct = total > 0 ? Math.round((e.value / total) * 100) : 0;
          return (
            <div key={e.name} className="dd-stat-line">
              <span>
                <span
                  className="dd-legend-dot"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {e.name}
              </span>
              <span className="dd-stat-value">
                {e.value} · {pct}%
              </span>
            </div>
          );
        })}
        <div className="dd-stat-line">
          <span className="dd-stat-value">Total networks</span>
          <span className="dd-stat-value">{total}</span>
        </div>
      </div>
    );
  }

  // ── Severity by Kind (vuln vs threat per severity) ──
  if (type === "severityKind") {
    const hasData = severityData.some(
      (s) => (s.vulnerabilities || 0) + (s.threats || 0) > 0
    );
    if (!hasData) {
      return <EmptyState message="No findings recorded in the latest scan." />;
    }
    return (
      <div>
        {severityData.map((s) => (
          <div key={s.severity} className="dd-stat-line">
            <span>
              <SeverityBadge level={s.severity} size="sm" />
            </span>
            <span className="dd-stat-value">
              {s.vulnerabilities || 0} vuln · {s.threats || 0} threat
            </span>
          </div>
        ))}
      </div>
    );
  }

  // ── Total Vulnerabilities/Threats — detailed findings grouped by bucket ──
  if (type === "findings") {
    const buckets = [
      { key: "openAndWeakCrypto", label: "Open / Weak Cryptography" },
      { key: "misconfigurations", label: "Misconfigurations" },
      { key: "activeThreats", label: "Active Threats" },
    ];
    const anyFindings = buckets.some(
      (b) => (detailedFindings[b.key] || []).length > 0
    );
    if (!anyFindings) {
      return <EmptyState message="No detailed findings available for this metric." />;
    }
    return (
      <div>
        {buckets.map((b) => {
          const items = detailedFindings[b.key] || [];
          if (items.length === 0) return null;
          return (
            <div key={b.key}>
              <p className="dd-section-title">
                {b.label} ({items.length})
              </p>
              <div className="dd-list">
                {items.map((f, idx) => (
                  <div key={`${b.key}-${idx}`} className="dd-row">
                    <span className="dd-row-main">
                      <span className="dd-row-title">{f.finding}</span>
                      <span className="dd-row-sub">
                        {f.network} · {f.kind}
                        {f.cvss != null ? ` · CVSS ${f.cvss}` : ""}
                      </span>
                    </span>
                    <span className="dd-row-aside">
                      <SeverityBadge level={f.severity} size="sm" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return <EmptyState message="No detailed records available for this metric." />;
};

export default SummaryDetailContent;
