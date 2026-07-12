// components/dashboard/SummaryDetailContent.jsx
//
// Renders the body of the dashboard metric-detail drawer for each metric type,
// using only data already present in the summary payload (no mock data). Rows
// that map to a single network deep-link into that network's view.
//
// The four list drawers (open / encrypted / clients / findings) share a compact
// filter/sort toolbar (DrawerFilterBar) driven by a per-type config; filtering
// is local to the drawer and does not affect the summary totals. The aggregate
// drawers (encryptionDist / severityKind) show distributions, not record lists,
// so they keep their original read-only layout.
import { useMemo, useState } from "react";
import SeverityBadge from "../common/SeverityBadge/SeverityBadge";
import DrawerFilterBar from "./DrawerFilterBar";
import { COLORS } from "../../data/dashboardData";
import { getRiskLevel } from "../../utils/riskColors";
import { bssidSuffix } from "../../utils/networkGrouping";
import {
  filterAndSort,
  activeFilterCount,
  severityRank,
  encryptionRank,
  distinctOptions,
  riskLevelOptions,
} from "../../utils/drawerFilters";

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

// ── Sort comparators reused across configs ──
const byClientsDesc = (a, b) => (b.num_clients || 0) - (a.num_clients || 0);
const byRiskDesc = (a, b) => (b.risk_score || 0) - (a.risk_score || 0);
const bySsidAsc = (a, b) =>
  String(a.ssid || "").localeCompare(String(b.ssid || ""));

/**
 * Build the DrawerFilterBar config for a given list type from the rows it will
 * display. Returning null means "no toolbar" (aggregate drawers).
 */
function buildConfig(type, rows) {
  if (type === "open") {
    return {
      searchFields: ["ssid"],
      filters: [
        { id: "risk", label: "Risk level", options: riskLevelOptions(rows),
          match: (r, v) => getRiskLevel(r.risk_score) === v },
      ],
      sorts: [
        { id: "risk_desc", label: "Risk (high → low)", cmp: byRiskDesc },
        { id: "clients_desc", label: "Clients (high → low)", cmp: byClientsDesc },
        { id: "ssid_asc", label: "SSID (A → Z)", cmp: bySsidAsc },
      ],
      defaultSort: "risk_desc",
    };
  }
  if (type === "encrypted") {
    return {
      searchFields: ["ssid"],
      filters: [
        { id: "enc", label: "Encryption", allLabel: "All types",
          options: distinctOptions(rows, (r) => r.encryption_status),
          match: (r, v) => r.encryption_status === v },
        { id: "risk", label: "Risk level", options: riskLevelOptions(rows),
          match: (r, v) => getRiskLevel(r.risk_score) === v },
      ],
      sorts: [
        { id: "weakest", label: "Weakest security first",
          cmp: (a, b) =>
            encryptionRank(a.encryption_status) - encryptionRank(b.encryption_status) ||
            byRiskDesc(a, b) },
        { id: "risk_desc", label: "Risk (high → low)", cmp: byRiskDesc },
        { id: "clients_desc", label: "Clients (high → low)", cmp: byClientsDesc },
        { id: "ssid_asc", label: "SSID (A → Z)", cmp: bySsidAsc },
      ],
      defaultSort: "weakest",
    };
  }
  if (type === "clients") {
    return {
      searchFields: ["ssid"],
      filters: [
        { id: "nettype", label: "Network type", allLabel: "All",
          options: [
            { value: "open", label: "Open" },
            { value: "encrypted", label: "Encrypted" },
          ],
          match: (r, v) =>
            v === "open"
              ? r.encryption_status === "Open"
              : r.encryption_status && r.encryption_status !== "Open" },
      ],
      sorts: [
        { id: "clients_desc", label: "Clients (high → low)", cmp: byClientsDesc },
        { id: "risk_desc", label: "Risk (high → low)", cmp: byRiskDesc },
        { id: "ssid_asc", label: "SSID (A → Z)", cmp: bySsidAsc },
      ],
      defaultSort: "clients_desc",
    };
  }
  if (type === "findings" || type === "vulnFindings" || type === "threatEvents") {
    return {
      // rows here are normalized findings (see flattenFindings): network + finding
      // are both searchable; ssid alias mirrors `network` for the SSID search.
      // vulnFindings/threatEvents are pre-filtered by kind, so the Type filter
      // only shows on the combined "findings" drawer.
      searchFields: ["network", "finding"],
      filters: [
        { id: "severity", label: "Severity",
          options: [
            { value: "Critical", label: "Critical" },
            { value: "High", label: "High" },
            { value: "Medium", label: "Medium" },
            { value: "Low", label: "Low" },
          ],
          match: (r, v) =>
            String(r.severity || "").toLowerCase() === v.toLowerCase() },
        ...(type === "findings"
          ? [{ id: "kind", label: "Type", allLabel: "All",
              options: [
                { value: "Vulnerability", label: "Vulnerability" },
                { value: "Threat", label: "Threat" },
              ],
              match: (r, v) => r.kind === v }]
          : []),
        { id: "category", label: "Category", allLabel: "All",
          options: [
            { value: "openAndWeakCrypto", label: "Open / Weak Crypto" },
            { value: "misconfigurations", label: "Misconfigurations" },
            { value: "activeThreats", label: "Active Threats" },
          ],
          match: (r, v) => r.categoryKey === v },
        { id: "network", label: "Network", allLabel: "All",
          options: distinctOptions(rows, (r) => r.network),
          match: (r, v) => r.network === v },
      ],
      sorts: [
        { id: "severity", label: "Severity (high → low)",
          cmp: (a, b) =>
            severityRank(b.severity) - severityRank(a.severity) ||
            (b.cvss || 0) - (a.cvss || 0) },
        { id: "cvss", label: "CVSS (high → low)",
          cmp: (a, b) =>
            (b.cvss || 0) - (a.cvss || 0) ||
            severityRank(b.severity) - severityRank(a.severity) },
        { id: "network_asc", label: "Network (A → Z)",
          cmp: (a, b) => String(a.network || "").localeCompare(String(b.network || "")) },
      ],
      defaultSort: "severity",
    };
  }
  return null;
}

const FINDING_BUCKETS = [
  { key: "openAndWeakCrypto", label: "Open / Weak Cryptography" },
  { key: "misconfigurations", label: "Misconfigurations" },
  { key: "activeThreats", label: "Active Threats" },
];

/** Flatten the 3 finding buckets into one searchable/sortable row list. */
function flattenFindings(detailedFindings) {
  const out = [];
  for (const b of FINDING_BUCKETS) {
    for (const f of detailedFindings[b.key] || []) {
      out.push({ ...f, categoryKey: b.key, categoryLabel: b.label });
    }
  }
  return out;
}

const SummaryDetailContent = ({ type, data, onSelectNetwork }) => {
  const {
    networkDirectory = [],
    networkEncryptionData = [],
    severityData = [],
    detailedFindings = {},
    totalClients = 0,
  } = data || {};

  // Raw rows for the active list drawer (before filter/sort). Aggregate drawers
  // get an empty list — buildConfig returns null for them so no toolbar shows.
  const baseRows = useMemo(() => {
    if (type === "open") {
      return networkDirectory.filter((n) => n.encryption_status === "Open");
    }
    if (type === "encrypted") {
      return networkDirectory.filter(
        (n) => n.encryption_status && n.encryption_status !== "Open"
      );
    }
    if (type === "clients") {
      return networkDirectory.filter((n) => (n.num_clients || 0) > 0);
    }
    if (type === "findings") {
      return flattenFindings(detailedFindings);
    }
    if (type === "vulnFindings") {
      return flattenFindings(detailedFindings).filter(
        (f) => f.kind === "Vulnerability"
      );
    }
    if (type === "threatEvents") {
      return flattenFindings(detailedFindings).filter(
        (f) => f.kind === "Threat"
      );
    }
    return [];
  }, [type, networkDirectory, detailedFindings]);

  const config = useMemo(() => buildConfig(type, baseRows), [type, baseRows]);

  // Filter/sort state, reset whenever the drawer switches to a different metric.
  // Reset happens during render (not in an effect) per the React guidance for
  // state derived from props — tracked via the metric type the state was built for.
  const initState = (cfg) => (cfg ? { search: "", filters: {}, sort: cfg.defaultSort } : null);
  const [state, setState] = useState(() => initState(config));
  const [stateType, setStateType] = useState(type);
  if (type !== stateType) {
    setStateType(type);
    setState(initState(config));
  }

  const filteredRows = useMemo(() => {
    if (!config || !state) return baseRows;
    return filterAndSort(baseRows, config, state);
  }, [config, state, baseRows]);

  // ── Toolbar handlers ──
  const onSearch = (v) => setState((s) => ({ ...s, search: v }));
  const onFilter = (id, v) =>
    setState((s) => ({ ...s, filters: { ...s.filters, [id]: v } }));
  const onSort = (v) => setState((s) => ({ ...s, sort: v }));
  const onClear = () =>
    setState({ search: "", filters: {}, sort: config.defaultSort });

  const Toolbar = config && state && baseRows.length > 0 && (
    <DrawerFilterBar
      config={config}
      state={state}
      onSearch={onSearch}
      onFilter={onFilter}
      onSort={onSort}
      onClear={onClear}
      activeCount={activeFilterCount(config, state)}
      searchPlaceholder={
        type === "findings" || type === "vulnFindings" || type === "threatEvents"
          ? "Search network or finding…"
          : "Search by SSID…"
      }
    />
  );

  const filteredEmpty = (
    <EmptyState message="No records match the selected filters." />
  );

  // ── Open / Encrypted network lists ──
  if (type === "open" || type === "encrypted") {
    const open = type === "open";
    if (baseRows.length === 0) {
      return (
        <EmptyState
          message={`No ${open ? "open" : "encrypted"} networks in the latest scan.`}
        />
      );
    }
    return (
      <>
        {Toolbar}
        {filteredRows.length === 0 ? (
          filteredEmpty
        ) : (
          <div className="dd-list">
            {filteredRows.map((n) => (
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
        )}
      </>
    );
  }

  // ── Client distribution by network ──
  if (type === "clients") {
    if (baseRows.length === 0) {
      return <EmptyState message="No client records available for any network." />;
    }
    return (
      <>
        <div className="dd-stat-line">
          <span>Total clients (all networks)</span>
          <span className="dd-stat-value">{totalClients}</span>
        </div>
        <div style={{ marginTop: "var(--space-3)" }}>{Toolbar}</div>
        {filteredRows.length === 0 ? (
          filteredEmpty
        ) : (
          <div className="dd-list">
            {filteredRows.map((n) => (
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
        )}
      </>
    );
  }

  // ── Networks by Encryption distribution (aggregate — unchanged) ──
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

  // ── Vulnerability Severity Distribution (aggregate, vulnerabilities only) ──
  if (type === "severityKind") {
    const hasData = severityData.some((s) => (s.vulnerabilities || 0) > 0);
    if (!hasData) {
      return (
        <EmptyState message="No vulnerability findings recorded in the latest scan." />
      );
    }
    return (
      <div>
        {severityData.map((s) => (
          <div key={s.severity} className="dd-stat-line">
            <span>
              <SeverityBadge level={s.severity} size="sm" />
            </span>
            <span className="dd-stat-value">
              {s.vulnerabilities || 0} finding
              {(s.vulnerabilities || 0) === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // ── Findings lists — combined, vulnerability-only, or threat-only ──
  if (type === "findings" || type === "vulnFindings" || type === "threatEvents") {
    if (baseRows.length === 0) {
      return (
        <EmptyState
          message={
            type === "vulnFindings"
              ? "No vulnerability findings recorded in the latest scan."
              : type === "threatEvents"
              ? "No threat events detected in the latest scans."
              : "No detailed findings available for this metric."
          }
        />
      );
    }
    return (
      <>
        {Toolbar}
        {filteredRows.length === 0 ? (
          filteredEmpty
        ) : (
          <div className="dd-list">
            {filteredRows.map((f, idx) => (
              <div key={`${f.categoryKey}-${idx}`} className="dd-row">
                <span className="dd-row-main">
                  <span className="dd-row-title">{f.finding}</span>
                  <span className="dd-row-sub">
                    {f.network} · {f.kind} · {f.categoryLabel}
                    {f.cvss != null ? ` · CVSS ${f.cvss}` : ""}
                  </span>
                </span>
                <span className="dd-row-aside">
                  <SeverityBadge level={f.severity} size="sm" />
                </span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return <EmptyState message="No detailed records available for this metric." />;
};

export default SummaryDetailContent;
