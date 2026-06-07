// components/modals/RawEvidenceModal/RawEvidenceModal.jsx
import { useState, useEffect } from "react";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import "./RawEvidenceModal.css";

// Mapping helper: WFVT ID → source key path for Formatted View
const WFVT_SOURCE_MAP = {
  "WFVT-004": "findings.mfp",
  "WFVT-003": "findings.wps",
  "WFVT-002": "findings.encryption",
  "WFVT-006": "findings.evil_twin.details",
};

/**
 * Build formatted field cards from a finding object.
 * Adapts to both vulnerability and threat payloads.
 */
const buildFormattedFields = (finding, type) => {
  if (!finding) return [];

  const fields = [];
  const id = finding.id || finding.code || "—";

  fields.push({ label: "WFVT ID", value: id });

  if (type === "threat") {
    fields.push({ label: "Threat", value: finding.name || "—" });
  } else {
    fields.push({ label: "Finding", value: finding.name || "—" });
  }

  fields.push({
    label: "Severity / Score",
    value: `${finding.severity || "—"} / ${finding.score || finding.cvss || "—"}`,
  });

  fields.push({ label: "Status", value: finding.status || "—" });

  if (type === "threat") {
    fields.push({
      label: "First Seen (Epoch)",
      value: finding.first_seen || finding.firstSeen || "—",
    });
    fields.push({
      label: "Last Seen (Epoch)",
      value: finding.last_seen || finding.lastSeen || "—",
    });
    fields.push({
      label: "Duration (sec)",
      value: finding.duration ?? "—",
    });
    fields.push({
      label: "Scan End",
      value: finding.scan_end || finding.scanEnd || "—",
    });
  } else {
    // Vulnerability fields
    fields.push({
      label: "SSID / BSSID",
      value:
        finding.ssid && finding.bssid
          ? `${finding.ssid} / ${finding.bssid}`
          : finding.ssid || finding.bssid || "—",
    });
    fields.push({ label: "Channel", value: finding.channel ?? "—" });
    fields.push({
      label: "Scan Start",
      value: finding.scan_start || finding.scanStart || "—",
    });
    fields.push({
      label: "Scan End",
      value: finding.scan_end || finding.scanEnd || "—",
    });

    // Aligned attribute from mapping
    const sourceKey = WFVT_SOURCE_MAP[id];
    if (sourceKey) {
      fields.push({
        label: "Aligned Attribute",
        value: `${sourceKey} = ${finding.attributeValue || finding.value || "—"}`,
      });
    }

    fields.push({
      label: "Halted for Scan",
      value: finding.halted != null ? (finding.halted ? "Yes" : "No") : "—",
    });
  }

  return fields;
};

/**
 * Build a raw JSON payload from a finding object.
 * Uses finding.raw if available; otherwise constructs from known fields.
 */
const buildRawJson = (finding, scanContext) => {
  if (finding?.raw) return finding.raw;

  // Construct minimal raw payload from available fields
  const raw = {
    ssid: scanContext?.ssid || finding?.ssid || undefined,
    bssid: scanContext?.bssid || finding?.bssid || undefined,
    status: scanContext?.status || "FOUND",
    channel: scanContext?.channel || finding?.channel || undefined,
    findings: {},
  };

  const id = finding?.id || finding?.code || "";
  const sourceKey = WFVT_SOURCE_MAP[id];

  if (sourceKey) {
    // Build nested structure from dot-notated source key
    const parts = sourceKey.replace("findings.", "").split(".");
    let target = raw.findings;
    for (let i = 0; i < parts.length - 1; i++) {
      target[parts[i]] = target[parts[i]] || {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = {
      id: id,
      value: finding?.attributeValue || finding?.value || "Unknown",
      status: finding?.status || "DETECTED",
    };
  } else {
    raw.findings[id] = {
      id: id,
      name: finding?.name || "Unknown",
      severity: finding?.severity || "UNKNOWN",
      score: finding?.score || finding?.cvss || "0",
      status: finding?.status || "DETECTED",
    };
  }

  return raw;
};

const RawEvidenceModal = ({
  open,
  onClose,
  title,
  subtitle,
  finding,
  scanContext,
  type = "vulnerability",
}) => {
  const [activeTab, setActiveTab] = useState("formatted");
  const [copySuccess, setCopySuccess] = useState(false);
  const containerRef = useFocusTrap(open, onClose);

  // Reset tab and copy state when modal opens with a new finding
  useEffect(() => {
    if (open) {
      setActiveTab("formatted");
      setCopySuccess(false);
    }
  }, [open, finding]);

  if (!open) return null;

  const rawJson = buildRawJson(finding, scanContext);
  const jsonString = JSON.stringify(rawJson, null, 2);
  const formattedFields = buildFormattedFields(finding, type);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
    } catch {
      // Fallback for insecure contexts / older browsers
      try {
        const textarea = document.createElement("textarea");
        textarea.value = jsonString;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 1500);
      } catch {
        // Silently fail — no console error
      }
    }
  };

  return (
    <div className="raw-evidence-overlay" onClick={onClose}>
      <div
        className="raw-evidence-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="raw-evidence-header">
          <div className="raw-evidence-header-left">
            <h2 className="raw-evidence-title">{title}</h2>
            <p className="raw-evidence-subtitle">{subtitle}</p>
          </div>
          <button className="raw-evidence-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="raw-evidence-tabs">
          <button
            className={`raw-evidence-tab ${activeTab === "formatted" ? "active" : ""}`}
            onClick={() => setActiveTab("formatted")}
          >
            Formatted View
          </button>
          <button
            className={`raw-evidence-tab ${activeTab === "json" ? "active" : ""}`}
            onClick={() => setActiveTab("json")}
          >
            JSON View
          </button>
        </div>

        {/* Body */}
        <div className="raw-evidence-body">
          {activeTab === "formatted" ? (
            <div className="formatted-grid">
              {formattedFields.map((field, idx) => (
                <div className="formatted-field" key={idx}>
                  <div className="formatted-field-label">{field.label}</div>
                  <div className="formatted-field-value">{field.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="json-view-container">{jsonString}</div>
          )}
        </div>

        {/* Footer */}
        <div className="raw-evidence-footer">
          <button
            className={`raw-evidence-btn raw-evidence-btn-secondary ${copySuccess ? "copy-success" : ""}`}
            onClick={handleCopy}
          >
            {copySuccess ? "Copied!" : "Copy JSON"}
          </button>
          <button
            className="raw-evidence-btn raw-evidence-btn-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default RawEvidenceModal;
