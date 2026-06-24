// components/accounts/AuditToolbar.jsx
//
// Audit Logs toolbar: left side holds the honest, server-backed filters
// (search, status, event category, date range + quick ranges); the right side
// holds the Export CSV action. Every filter here maps to a backend query param,
// so results span all server-paginated records — never just the loaded page.
import { useCallback, useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "SUCCESS", label: "Success" },
  { value: "FAILED", label: "Failed" },
  { value: "DENIED", label: "Denied" },
];

// Module options map 1:1 to the Module column badges and to the backend
// `eventCategory` filter (auditRepository CATEGORY_EVENT_PATTERNS) — so the
// dropdown, the badge, and the server-side filter all use one taxonomy.
const MODULE_OPTIONS = [
  { value: "", label: "All modules" },
  { value: "AUTH", label: "AUTH" },
  { value: "ACCOUNTS", label: "ACCOUNTS" },
  { value: "SCANS", label: "SCANS" },
  { value: "DEVICE", label: "DEVICE" },
  { value: "DETECTION", label: "DETECTION" },
  { value: "SYSTEM", label: "SYSTEM" },
  { value: "GENERAL", label: "GENERAL" },
];

/** Returns a YYYY-MM-DD string for `daysAgo` days before today (0 = today). */
function isoDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const AuditToolbar = ({
  search,
  onSearch,
  status,
  onStatus,
  eventCategory,
  onEventCategory,
  fromDate,
  onFromDate,
  toDate,
  onToDate,
  isSuperadmin,
  isExporting,
  exportError,
  onExport,
}) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportValidationError, setExportValidationError] = useState("");

  const applyQuickRange = (days) => {
    const today = isoDaysAgo(0);
    onFromDate(days === 0 ? today : isoDaysAgo(days));
    onToDate(today);
  };

  const datesActive = !!(fromDate || toDate);

  const clearDates = () => {
    // Clears From/To and any active quick range; handlers reset page to 1.
    onFromDate("");
    onToDate("");
  };

  const openExport = useCallback(() => {
    // Pre-fill the export range with the active date filter, if any.
    setExportFrom(fromDate || "");
    setExportTo(toDate || "");
    setExportValidationError("");
    setShowExportModal(true);
  }, [fromDate, toDate]);

  const confirmExport = useCallback(async () => {
    if (!exportFrom || !exportTo) {
      setExportValidationError("Please select both a start and end date.");
      return;
    }
    if (new Date(exportFrom) > new Date(exportTo)) {
      setExportValidationError("Start date cannot be after end date.");
      return;
    }
    setExportValidationError("");
    setShowExportModal(false);
    if (onExport) await onExport(exportFrom, exportTo);
  }, [onExport, exportFrom, exportTo]);

  const cancelExport = useCallback(() => {
    setShowExportModal(false);
    setExportValidationError("");
  }, []);

  return (
    <div className="audit-toolbar">
      <div className="audit-toolbar-filters">
        <input
          type="text"
          placeholder="Search user, event, target, details…"
          className="search-input"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />

        <select
          className="status-filter-select"
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          aria-label="Status filter"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="status-filter-select"
          value={eventCategory}
          onChange={(e) => onEventCategory(e.target.value)}
          aria-label="Module filter"
        >
          {MODULE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="date-range-filters">
          <label className="date-filter-label">
            From
            <input
              type="date"
              className="date-input"
              value={fromDate}
              onChange={(e) => onFromDate(e.target.value)}
            />
          </label>
          <label className="date-filter-label">
            To
            <input
              type="date"
              className="date-input"
              value={toDate}
              onChange={(e) => onToDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="quick-range-btn clear-dates-btn"
            onClick={clearDates}
            disabled={!datesActive}
            title="Clear date filters"
          >
            Clear dates
          </button>
        </div>

        <div className="audit-quick-ranges">
          <button type="button" className="quick-range-btn" onClick={() => applyQuickRange(0)}>Today</button>
          <button type="button" className="quick-range-btn" onClick={() => applyQuickRange(7)}>7d</button>
          <button type="button" className="quick-range-btn" onClick={() => applyQuickRange(30)}>30d</button>
        </div>
      </div>

      {isSuperadmin && (
        <div className="audit-toolbar-actions">
          {exportError && <span className="export-error">{exportError}</span>}
          <button
            className="export-csv-btn"
            disabled={isExporting}
            onClick={openExport}
            title={isExporting ? "Export in progress…" : "Export audit logs as CSV"}
          >
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      )}

      {/* Export date range modal */}
      {showExportModal && (
        <div className="export-confirm-overlay" onClick={cancelExport}>
          <div className="export-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="export-confirm-title">Export Audit Logs</p>
            <p className="export-confirm-text">
              Select a date range for the audit logs you want to export.
            </p>
            <div className="export-date-fields">
              <label className="export-date-label">
                From
                <input
                  type="date"
                  className="date-input"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                />
              </label>
              <label className="export-date-label">
                To
                <input
                  type="date"
                  className="date-input"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                />
              </label>
            </div>
            {exportValidationError && (
              <p className="export-error" style={{ marginTop: 8 }}>{exportValidationError}</p>
            )}
            <span className="export-confirm-note">This action will be recorded in the audit log.</span>
            <div className="export-confirm-actions">
              <button className="cancel-btn" onClick={cancelExport}>Cancel</button>
              <button className="confirm-btn" onClick={confirmExport} disabled={isExporting}>
                {isExporting ? "Exporting…" : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditToolbar;
