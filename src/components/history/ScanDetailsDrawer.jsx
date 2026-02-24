// components/history/ScanDetailsDrawer.jsx
import { useState, useEffect } from "react";
import "./ScanDetailsDrawer.css";

/**
 * Compute a risk-score label from a numeric CVSS-like value.
 */
const getRiskLabel = (score) => {
  const n = Number(score) || 0;
  if (n >= 9) return "CRITICAL";
  if (n >= 7) return "HIGH";
  if (n >= 4) return "MEDIUM";
  return "LOW";
};

/**
 * Right-side drawer showing scan-level KPIs + tabbed finding cards.
 *
 * Props:
 *  - open            : boolean
 *  - onClose         : () => void
 *  - scan            : the full scan row object from history
 *  - initialTab      : 'vuln' | 'threat' (optional, defaults to 'vuln')
 *  - onOpenJsonModal : (finding, type) => void
 */
const ScanDetailsDrawer = ({
  open,
  onClose,
  scan,
  initialTab = "vuln",
  onOpenJsonModal,
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync internal tab when the parent changes initialTab
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  if (!scan) return null;

  // --- Derive data from the scan row ---
  const ssid = scan.ssid || "—";
  const bssid = scan.bssid || "—";
  const channel = scan.channel != null ? String(scan.channel) : "—";
  const scanStart = scan.scan_start || scan.scanStart || "—";
  const scanEnd = scan.scan_end || scan.scanEnd || "—";
  const scanDuration = scan.scan_duration || scan.scanDuration || "—";
  const clientsConnected =
    scan.num_clients != null
      ? String(scan.num_clients)
      : scan.clientsConnected != null
        ? String(scan.clientsConnected)
        : "—";

  // Findings arrays
  const vulns = scan.details || scan.vulnerabilities || [];
  const threats = scan.threats || [];

  // Risk score
  const allScores = [
    ...vulns.map((v) => Number(v.score || v.cvss) || 0),
    ...threats.map((t) => Number(t.score || t.cvss) || 0),
  ];
  const riskScore =
    scan.riskScore ?? (allScores.length ? Math.max(...allScores) : 0);
  const riskLabel = scan.riskLabel || getRiskLabel(riskScore);

  const vulnCount = scan.vulnCount ?? vulns.length;
  const threatCount = scan.threatCount ?? threats.length;

  // Scan context for raw evidence modal
  const scanContext = { ssid, bssid, channel, scanStart, scanEnd };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className={`scan-details-drawer ${open ? "open" : ""}`}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <h2>Scan Details</h2>
            <div className="drawer-meta">
              <span>SSID: {ssid}</span>
              <span>BSSID: {bssid}</span>
              <span>Channel: {channel}</span>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* KPI Section */}
        <div className="drawer-kpi-section">
          <div className="kpi-risk-score">
            <div>
              <div className="kpi-risk-label">OVERALL RISK SCORE</div>
              <span className={`kpi-risk-badge ${riskLabel.toLowerCase()}`}>
                {riskLabel}
              </span>
            </div>
            <div className="kpi-risk-number">{riskScore}</div>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-label">Scan Start</div>
              <div className="kpi-card-value">{scanStart}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-label">Scan End</div>
              <div className="kpi-card-value">{scanEnd}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-label">Scan Duration</div>
              <div className="kpi-card-value">{scanDuration}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-label">Clients Connected</div>
              <div className="kpi-card-value">{clientsConnected}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab ${activeTab === "vuln" ? "active" : ""}`}
            onClick={() => setActiveTab("vuln")}
          >
            VULNERABILITIES
            <span className="drawer-tab-count">{vulnCount}</span>
          </button>
          <button
            className={`drawer-tab ${activeTab === "threat" ? "active" : ""}`}
            onClick={() => setActiveTab("threat")}
          >
            THREATS
            <span className="drawer-tab-count">{threatCount}</span>
          </button>
        </div>

        {/* Finding cards */}
        <div className="drawer-findings">
          {activeTab === "vuln" && (
            <>
              {vulns.length === 0 ? (
                <div className="drawer-empty">No vulnerabilities recorded</div>
              ) : (
                vulns.map((vuln, idx) => {
                  const sev = (vuln.severity || "MEDIUM").toUpperCase();
                  return (
                    <div className="finding-card" key={vuln.id || idx}>
                      <div className="finding-card-header">
                        <div>
                          <h4 className="finding-card-title">
                            {vuln.name || "Unknown Vulnerability"}
                          </h4>
                          <p className="finding-card-id">
                            {vuln.id ||
                              vuln.code ||
                              `WFVT-${String(idx + 1).padStart(3, "0")}`}
                          </p>
                        </div>
                        <span
                          className={`finding-severity-chip ${sev.toLowerCase()}`}
                        >
                          <span className="finding-severity-dot" />
                          {sev}
                        </span>
                      </div>
                      <div className="finding-cvss">
                        CVSS 4.0 Score: {vuln.score || vuln.cvss || "—"}
                      </div>
                      <div className="finding-details">
                        <div className="finding-detail-row">
                          <span className="finding-detail-label">Status</span>
                          <span
                            className={`finding-detail-value ${
                              (vuln.status || "").toUpperCase() === "CLEARED"
                                ? "status-cleared"
                                : ""
                            }`}
                          >
                            {vuln.status || "DETECTED"}
                          </span>
                        </div>
                        {(vuln.attributeValue || vuln.value) && (
                          <div className="finding-detail-row">
                            <span className="finding-detail-label">
                              Attribute Value
                            </span>
                            <span className="finding-detail-value">
                              {vuln.attributeValue || vuln.value}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        className="finding-view-json"
                        onClick={() =>
                          onOpenJsonModal?.(
                            { ...vuln, ...scanContext },
                            "vulnerability",
                          )
                        }
                      >
                        View Full JSON
                      </button>
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === "threat" && (
            <>
              {threats.length === 0 ? (
                <div className="drawer-empty">No threats recorded</div>
              ) : (
                threats.map((threat, idx) => {
                  const sev = (threat.severity || "MEDIUM").toUpperCase();
                  return (
                    <div
                      className="finding-card"
                      key={threat.id || threat.code || idx}
                    >
                      <div className="finding-card-header">
                        <div>
                          <h4 className="finding-card-title">
                            {threat.name || "Unknown Threat"}
                          </h4>
                          <p className="finding-card-id">
                            {threat.id ||
                              threat.code ||
                              `WFVT-${String(idx + 1).padStart(3, "0")}`}
                          </p>
                        </div>
                        <span
                          className={`finding-severity-chip ${sev.toLowerCase()}`}
                        >
                          <span className="finding-severity-dot" />
                          {sev}
                        </span>
                      </div>
                      <div className="finding-cvss">
                        CVSS 4.0 Score: {threat.score || threat.cvss || "—"}
                      </div>
                      <div className="finding-details">
                        <div className="finding-detail-row">
                          <span className="finding-detail-label">Status</span>
                          <span
                            className={`finding-detail-value ${
                              (threat.status || "").toUpperCase() === "CLEARED"
                                ? "status-cleared"
                                : ""
                            }`}
                          >
                            {threat.status || "DETECTED"}
                          </span>
                        </div>
                        <div className="finding-detail-row">
                          <span className="finding-detail-label">
                            Occurrences
                          </span>
                          <span className="finding-detail-value">
                            {threat.occurrences ?? "—"}
                          </span>
                        </div>
                        <div className="finding-detail-row">
                          <span className="finding-detail-label">Duration</span>
                          <span className="finding-detail-value">
                            {threat.duration != null
                              ? `${threat.duration} sec`
                              : "—"}
                          </span>
                        </div>
                      </div>
                      <button
                        className="finding-view-json"
                        onClick={() =>
                          onOpenJsonModal?.(
                            { ...threat, ...scanContext },
                            "threat",
                          )
                        }
                      >
                        View Full JSON
                      </button>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ScanDetailsDrawer;
