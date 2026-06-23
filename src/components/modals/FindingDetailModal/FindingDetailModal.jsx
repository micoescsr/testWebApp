// components/modals/FindingDetailModal/FindingDetailModal.jsx
import { useState } from "react";
import BaseModal from "../../common/Modal/BaseModal";
import SeverityBadge from "../../common/SeverityBadge/SeverityBadge";
import RawEvidenceModal from "../RawEvidenceModal/RawEvidenceModal";
import { X, Info, CaretRight, Eye } from "@phosphor-icons/react";
import "./FindingDetailModal.css";

const formatEpoch = (sec) =>
  sec ? new Date(sec * 1000).toLocaleString() : "—";

const formatDuration = (secs) => {
  if (secs == null) return "—";
  const s = Number(secs);
  if (!Number.isFinite(s) || s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
};

const FindingDetailModal = ({
  onClose,
  finding,
  rawFinding,
  findingType = "vulnerability",
  loading,
}) => {
  const [expandedRecs, setExpandedRecs] = useState(new Set());
  const [activeRecTab, setActiveRecTab] = useState("nist");
  const [showEvidence, setShowEvidence] = useState(false);

  const toggleRec = (index) => {
    setExpandedRecs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const isThreat = findingType === "threat";

  if (loading || !finding) {
    return (
      <BaseModal
        isOpen={true}
        onClose={onClose}
        className="finding-detail-modal"
        header={
          <div className="fdm-header">
            <div className="fdm-title-row">
              <h2>Loading…</h2>
            </div>
            <button className="fdm-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        }
      >
        <div className="fdm-loading">Loading details, please wait.</div>
      </BaseModal>
    );
  }

  const sessions = rawFinding?.sessions || [];
  const activeSession = rawFinding?.activeSession;

  return (
    <>
      <BaseModal
        isOpen={true}
        onClose={onClose}
        className="finding-detail-modal"
        ariaLabel={`${finding.severity} ${finding.name}`}
        header={
          <div className="fdm-header">
            <div className="fdm-title-row">
              <SeverityBadge level={finding.severity} />
              <h2>{finding.name}</h2>
              <button
                className="fdm-info-btn"
                onClick={() => setShowEvidence(true)}
                title="View raw evidence"
                type="button"
              >
                <Info size={16} />
              </button>
            </div>
            <button className="fdm-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        }
        footer={
          <>
            <button
              className="fdm-btn fdm-btn-secondary"
              onClick={() => setShowEvidence(true)}
              type="button"
            >
              <Eye size={16} />
              View Evidence
            </button>
            <button
              className="fdm-btn fdm-btn-primary"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </>
        }
      >
        {isThreat ? (
          /* ─── THREAT BODY ─── */
          <div className="fdm-body">
            {/* Status strip */}
            <div className="fdm-status-strip">
              <div className="fdm-status-item">
                <span className="fdm-status-label">Status</span>
                <span className={`fdm-status-value fdm-status-${(rawFinding?.status || "").toLowerCase()}`}>
                  {rawFinding?.status || "—"}
                </span>
              </div>
              <div className="fdm-status-item">
                <span className="fdm-status-label">Score</span>
                <span className="fdm-status-value">{finding.score ?? rawFinding?.score ?? "N/A"}</span>
              </div>
              <div className="fdm-status-item">
                <span className="fdm-status-label">Detected</span>
                <span className="fdm-status-value">{formatEpoch(rawFinding?.detectedTime)}</span>
              </div>
              <div className="fdm-status-item">
                <span className="fdm-status-label">Occurrences</span>
                <span className="fdm-status-value">
                  {rawFinding?.occurrences ?? 0}
                  {rawFinding?.activeCount ? ` (+${rawFinding.activeCount} active)` : ""}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="fdm-section">
              <h3>Description</h3>
              <p className="fdm-description">
                {finding.description || "Detailed information for this threat is not yet available."}
              </p>
            </div>

            {/* Sessions table */}
            {sessions.length > 0 && (
              <div className="fdm-section">
                <h3>Detection Sessions</h3>
                <div className="fdm-sessions-table-wrap">
                  <table className="fdm-sessions-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>First Seen</th>
                        <th>Last Seen</th>
                        <th>Duration</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s, idx) => (
                        <tr key={idx}>
                          <td>{sessions.length - idx}</td>
                          <td>{formatEpoch(s.firstSeen)}</td>
                          <td>{s.lastSeen ? formatEpoch(s.lastSeen) : "—"}</td>
                          <td>{formatDuration(s.durationSeconds)}</td>
                          <td>
                            <span className={`fdm-state-badge fdm-state-${(s.state || "").toLowerCase()}`}>
                              {s.state || "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Active session highlight */}
            {activeSession && (
              <div className="fdm-active-session">
                <span className="fdm-active-dot" />
                Active session in progress — first seen {formatEpoch(activeSession.firstSeen)}
              </div>
            )}
          </div>
        ) : (
          /* ─── VULNERABILITY BODY ─── */
          <div className="fdm-body">
            {/* CVSS strip */}
            <div className="fdm-cvss-strip">
              <div className="fdm-cvss-score">
                CVSS Base Score ({finding.cvss ?? "N/A"})
              </div>
              <div className="fdm-cvss-vector">
                {finding.cvssVector || "N/A"}
              </div>
            </div>

            {/* Observed Configuration */}
            {(finding.observedConfig || rawFinding?.observedConfig) && (
              <div className="fdm-observed-config">
                <span className="fdm-observed-label">Observed Configuration</span>
                <span className="fdm-observed-value">
                  {finding.observedConfig || rawFinding?.observedConfig}
                </span>
              </div>
            )}

            {/* Description */}
            <div className="fdm-section">
              <h3>Description</h3>
              <p className="fdm-description">
                {finding.description || "Detailed information for this vulnerability is not yet available."}
              </p>
            </div>

            {/* Recommendations */}
            {finding.recommendations && (
              <div className="fdm-section">
                <h3>Recommendations</h3>
                <div className="fdm-rec-tabs">
                  <button
                    className={`fdm-rec-tab${activeRecTab === "nist" ? " active" : ""}`}
                    onClick={() => { setActiveRecTab("nist"); setExpandedRecs(new Set()); }}
                    type="button"
                  >
                    NIST
                  </button>
                  <button
                    className={`fdm-rec-tab${activeRecTab === "owasp" ? " active" : ""}`}
                    onClick={() => { setActiveRecTab("owasp"); setExpandedRecs(new Set()); }}
                    type="button"
                  >
                    OWASP
                  </button>
                </div>

                <ul className="fdm-rec-list">
                  {(finding.recommendations[activeRecTab] || []).length > 0 ? (
                    finding.recommendations[activeRecTab].map((rec, index) => {
                      const isExpanded = expandedRecs.has(index);
                      const isString = typeof rec === "string";
                      const title = isString ? rec : rec?.title || rec?.text || String(rec);
                      const detail = isString ? null : rec?.detail || rec?.description || null;

                      return (
                        <li key={index} className={`fdm-rec-item${isExpanded ? " expanded" : ""}`}>
                          <button
                            type="button"
                            className="fdm-rec-toggle"
                            onClick={() => toggleRec(index)}
                            aria-expanded={isExpanded}
                          >
                            <CaretRight
                              size={14}
                              className={`fdm-rec-chevron${isExpanded ? " rotated" : ""}`}
                            />
                            <span className="fdm-rec-text">{title}</span>
                          </button>
                          {isExpanded && detail && (
                            <div className="fdm-rec-detail">{detail}</div>
                          )}
                        </li>
                      );
                    })
                  ) : (
                    <li className="fdm-rec-empty">
                      No {activeRecTab.toUpperCase()} recommendations available.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </BaseModal>

      {/* Raw Evidence sub-modal */}
      <RawEvidenceModal
        open={showEvidence}
        onClose={() => setShowEvidence(false)}
        title="Raw Evidence"
        subtitle={finding.name || "Finding details"}
        finding={{ ...finding, ...rawFinding }}
        scanContext={rawFinding}
        type={findingType}
      />
    </>
  );
};

export default FindingDetailModal;
