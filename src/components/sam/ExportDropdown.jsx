// components/sam/ExportDropdown.jsx
// Dropdown button that lets users choose between Summary or Per-Network PDF export.

import { useState, useRef, useEffect } from "react";
import {
  buildOverallReportData,
  buildPerNetworkReportData,
} from "../../utils/reportDataAdapter";
import {
  generateOverallReportHTML,
  generatePerNetworkReportHTML,
} from "../../utils/reportTemplates";
import { exportReport } from "../../utils/exportReport";
import { useToast } from "../../context/ToastContext";
import "./ExportDropdown.css";

const ExportDropdown = ({ networkId }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef(null);
  const { showToast } = useToast();

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleExportSummary = async () => {
    setOpen(false);
    setExporting(true);
    try {
      const data = await buildOverallReportData();
      const html = generateOverallReportHTML(data);
      exportReport(html);
    } catch {
      showToast?.("Failed to generate summary report. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPerNetwork = async () => {
    setOpen(false);
    if (!networkId) {
      showToast?.("Scan a network first to export its report.", "error");
      return;
    }
    setExporting(true);
    try {
      const data = await buildPerNetworkReportData(networkId);
      const html = generatePerNetworkReportHTML(data);
      exportReport(html);
    } catch {
      showToast?.("Failed to generate network report. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-dropdown-wrapper" ref={ref}>
      <button
        className="export-btn"
        type="button"
        disabled={exporting}
        onClick={() => setOpen((prev) => !prev)}
      >
        {exporting ? "Generating…" : "📎 Export"}
      </button>
      {open && (
        <div className="export-dropdown-menu">
          <button
            className="export-dropdown-item"
            type="button"
            disabled={exporting}
            onClick={handleExportSummary}
          >
            <span className="export-item-icon">📊</span>
            <div className="export-item-text">
              <span className="export-item-title">Summary Report</span>
              <span className="export-item-desc">
                Overall assessment across all networks
              </span>
            </div>
          </button>
          <button
            className="export-dropdown-item"
            type="button"
            disabled={exporting}
            onClick={handleExportPerNetwork}
          >
            <span className="export-item-icon">📡</span>
            <div className="export-item-text">
              <span className="export-item-title">Per-Network Report</span>
              <span className="export-item-desc">
                Detailed report for selected network
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportDropdown;
