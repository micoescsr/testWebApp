// components/dashboard/DashboardHeader.jsx
import NetworkCombobox from "./NetworkCombobox";

const DashboardHeader = ({
  viewMode,
  setViewMode,
  isSummary,
  networks,
  scanList,
  selectedScanId,
  onScanChange,
  summaryDate,
  onSummaryDateChange,
  availableScanDates = [],
  piStatus,
}) => {
  const formatDate = (iso) => {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  // "YYYY-MM-DD" → "Jun 25, 2026" (plain calendar date, no TZ math needed).
  const formatDay = (day) => {
    if (!day) return "Unknown";
    try {
      return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return day;
    }
  };

  const latestDate = availableScanDates[0] || null;

  const isOnline = piStatus?.online === true;
  const isLoading = piStatus?.online === null;
  const deviceModel = piStatus?.data?.model || "Raspberry Pi";

  return (
    <div className={isSummary ? "dash-header-summary" : "dash-header"}>
      <h1>Dashboard</h1>

      <div className="dash-filters">
        <div className="filter-group">
          <label>NETWORK</label>
          <NetworkCombobox
            value={viewMode}
            networks={networks}
            onChange={setViewMode}
          />
        </div>

        {isSummary && (
          <div className="filter-group">
            <label htmlFor="summary-date-select">SUMMARY DATE</label>
            <select
              id="summary-date-select"
              value={summaryDate || ""}
              onChange={(e) => onSummaryDateChange?.(e.target.value || null)}
              disabled={availableScanDates.length === 0}
              aria-label="Summary date"
            >
              <option value="">
                {latestDate ? `Latest — ${formatDay(latestDate)}` : "Latest"}
              </option>
              {availableScanDates.map((day) => (
                <option key={day} value={day}>
                  {formatDay(day)}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isSummary && (
          <div className="filter-group">
            <label>DATE</label>
            <select
              value={selectedScanId || ""}
              onChange={(e) => onScanChange(e.target.value || null)}
              disabled={!scanList || scanList.length === 0}
            >
              <option value="">Latest</option>
              {(scanList || []).map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {formatDate(s.finished_at)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="device-status">
        <p className="status-label">Device Status:</p>
        <p className="status-line">
          Model: <span>{deviceModel}</span>
        </p>
        <p className="status-line">
          Status:{" "}
          {isLoading ? (
            <span className="status-checking">Checking…</span>
          ) : isOnline ? (
            <span className="status-online">Online</span>
          ) : (
            <span className="status-offline">Offline</span>
          )}
        </p>
      </div>
    </div>
  );
};

export default DashboardHeader;
