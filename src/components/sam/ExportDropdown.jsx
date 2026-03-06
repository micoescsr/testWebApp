// components/sam/ExportDropdown.jsx
// Dropdown button that lets users choose between Summary or Per-Network PDF export.

import { useState, useRef, useEffect } from "react";
import { overallMockData, perNetworkMockData } from "../../data/mockReportData";
import {
  generateOverallReportHTML,
  generatePerNetworkReportHTML,
} from "../../utils/reportTemplates";
import { exportReport } from "../../utils/exportReport";
import "./ExportDropdown.css";

const ExportDropdown = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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

  const handleExportSummary = () => {
    setOpen(false);
    const html = generateOverallReportHTML(overallMockData);
    exportReport(html);
  };

  const handleExportPerNetwork = () => {
    setOpen(false);
    const html = generatePerNetworkReportHTML(perNetworkMockData);
    exportReport(html);
  };

  return (
    <div className="export-dropdown-wrapper" ref={ref}>
      <button
        className="export-btn"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
      >
        📎 Export
      </button>
      {open && (
        <div className="export-dropdown-menu">
          <button
            className="export-dropdown-item"
            type="button"
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
