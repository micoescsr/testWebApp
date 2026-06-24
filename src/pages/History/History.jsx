// pages/History/History.jsx
import { useState, useMemo } from "react";
import Pagination from "../../components/common/Pagination/Pagination";
import VulnerabilityHistoryTable from "../../components/history/VulnerabilityHistoryTable";
import ThreatHistoryTable from "../../components/history/ThreatHistoryTable";
import ScanDetailsDrawer from "../../components/history/ScanDetailsDrawer";
import RawEvidenceModal from "../../components/modals/RawEvidenceModal/RawEvidenceModal";
import Tabs from "../../components/common/Tabs/Tabs";
import { useSAMHistory } from "../../hooks/useSAMHistory";
import { usePagination } from "../../hooks/usePagination";
import { enrichHistoryRow } from "../../utils/historyRows";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import "./History.css";

const PAGE_SIZE_OPTIONS = [15, 25, 50];

const DATE_FILTERS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const RISK_FILTERS = [
  { value: "all", label: "All risks" },
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const FINDING_FILTERS = [
  { value: "all", label: "All records" },
  { value: "vulns", label: "With vulnerabilities" },
  { value: "threats", label: "With threats" },
  { value: "either", label: "With vulns or threats" },
  { value: "none", label: "No findings" },
];

// Default sort direction per column when first selected.
const DEFAULT_DIR = {
  datetime: "desc",
  network: "asc",
  risk: "desc",
  vulns: "desc",
  threats: "desc",
};

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const withinDateRange = (iso, filter) => {
  if (filter === "all") return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  if (filter === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return t >= start.getTime();
  }
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 0;
  return t >= now - days * 24 * 60 * 60 * 1000;
};

const matchesFinding = (row, filter) => {
  const v = row.vulnCount > 0;
  const t = row.threatCount > 0;
  switch (filter) {
    case "vulns":
      return v;
    case "threats":
      return t;
    case "either":
      return v || t;
    case "none":
      return !v && !t;
    default:
      return true;
  }
};

const matchesSearch = (row, q) => {
  if (!q) return true;
  const hay = [
    row.ssid,
    row.datetimeLabel,
    row.datetime,
    row.riskLabel,
    `${row.riskScore}`,
    `${row.vulnCount}`,
    `${row.threatCount}`,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
};

const compareRows = (a, b, field, dir) => {
  let diff = 0;
  switch (field) {
    case "network":
      diff = (a.ssid || "").localeCompare(b.ssid || "");
      break;
    case "risk":
      diff = a.riskScore - b.riskScore;
      break;
    case "vulns":
      diff = a.vulnCount - b.vulnCount;
      break;
    case "threats":
      diff = a.threatCount - b.threatCount;
      break;
    default:
      diff = new Date(a.datetime) - new Date(b.datetime);
  }
  return dir === "asc" ? diff : -diff;
};

const History = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [findingFilter, setFindingFilter] = useState("all");
  const [sortField, setSortField] = useState("datetime");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(15);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedScan, setSelectedScan] = useState(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState("vuln");

  // Raw Evidence Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [selectedFindingType, setSelectedFindingType] = useState("vulnerability");

  const { vulnHistory, threatHistory, loading } = useSAMHistory();

  // Enrich once: derived risk/counts + a preformatted datetime label (for search).
  const enrich = (list) =>
    (list || []).map((item) => {
      const row = enrichHistoryRow(item);
      return { ...row, datetimeLabel: formatDate(item.datetime) };
    });
  const enrichedVuln = useMemo(() => enrich(vulnHistory), [vulnHistory]);
  const enrichedThreat = useMemo(() => enrich(threatHistory), [threatHistory]);

  // Filter + sort the FULL dataset (pagination happens after, so it spans all rows).
  const processList = (list) => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = list.filter(
      (row) =>
        matchesSearch(row, q) &&
        withinDateRange(row.datetime, dateFilter) &&
        (riskFilter === "all" || row.riskLevel === riskFilter) &&
        matchesFinding(row, findingFilter)
    );
    return [...filtered].sort((a, b) => compareRows(a, b, sortField, sortDir));
  };

  const filteredVuln = useMemo(processList.bind(null, enrichedVuln), [
    enrichedVuln,
    searchQuery,
    dateFilter,
    riskFilter,
    findingFilter,
    sortField,
    sortDir,
  ]);
  const filteredThreat = useMemo(processList.bind(null, enrichedThreat), [
    enrichedThreat,
    searchQuery,
    dateFilter,
    riskFilter,
    findingFilter,
    sortField,
    sortDir,
  ]);

  const vulnPager = usePagination(filteredVuln, pageSize);
  const threatPager = usePagination(filteredThreat, pageSize);

  const resetPages = () => {
    vulnPager.resetPage();
    threatPager.resetPage();
  };

  // --- Handlers ---
  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(DEFAULT_DIR[field] || "desc");
    }
    resetPages();
  };

  const onFilterChange = (setter) => (e) => {
    setter(e.target.value);
    resetPages();
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    resetPages();
  };

  const handlePageSizeChange = (e) => {
    setPageSize(Number(e.target.value));
    resetPages();
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDateFilter("all");
    setRiskFilter("all");
    setFindingFilter("all");
    resetPages();
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    closeDrawer();
    resetPages();
  };

  const openDrawer = (scanRow) => {
    setSelectedScan(scanRow);
    setActiveDrawerTab(activeTab === "threats" ? "threat" : "vuln");
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedScan(null);
  };

  const openJsonModal = (finding, type) => {
    setSelectedFinding(finding);
    setSelectedFindingType(type);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setSelectedFinding(null);
  };

  const filtersActive =
    searchQuery.trim() !== "" ||
    dateFilter !== "all" ||
    riskFilter !== "all" ||
    findingFilter !== "all";

  const isVuln = activeTab === "vulnerabilities";
  const pager = isVuln ? vulnPager : threatPager;
  const totalCount = isVuln ? filteredVuln.length : filteredThreat.length;

  const modalTitle =
    selectedFindingType === "threat"
      ? "Threat Detection Payload"
      : "Vulnerability Raw Payload";
  const modalSubtitle = selectedFinding
    ? `${selectedFinding.id || selectedFinding.code || "—"} — ${selectedFinding.name || "Unknown"}`
    : "";

  // Footer: result count + rows-per-page + pagination, anchored at card bottom.
  const footer = (
    <>
      <div className="history-footer-left">
        <span className="history-result-count">
          {totalCount} record{totalCount === 1 ? "" : "s"}
        </span>
        <label className="history-page-size">
          Rows
          <select value={pageSize} onChange={handlePageSizeChange}>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Pagination
        page={pager.page}
        totalPages={pager.totalPages}
        onPrev={pager.goPrev}
        onNext={pager.goNext}
      />
    </>
  );

  const tableData = pager.currentItems.map((item) => ({
    ...item,
    datetime: item.datetimeLabel,
  }));

  return (
    <div className="history-page">
      <div className="history-header-row">
        <h1 className="page-title">History</h1>
        <Tabs
          tabs={[
            { label: "Vulnerabilities", value: "vulnerabilities" },
            { label: "Threats", value: "threats" },
          ]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      </div>

      {/* Filter / search / sort toolbar */}
      <div className="history-toolbar">
        <div className="history-search-bar">
          <MagnifyingGlass className="history-search-icon" size={18} />
          <input
            type="text"
            className="history-search-input"
            placeholder="Search by network, date, risk, or finding count..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
          {searchQuery && (
            <button
              className="history-search-clear"
              onClick={() => {
                setSearchQuery("");
                resetPages();
              }}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <select
          className="history-filter-select"
          value={dateFilter}
          onChange={onFilterChange(setDateFilter)}
          aria-label="Date filter"
        >
          {DATE_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          className="history-filter-select"
          value={riskFilter}
          onChange={onFilterChange(setRiskFilter)}
          aria-label="Risk filter"
        >
          {RISK_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          className="history-filter-select"
          value={findingFilter}
          onChange={onFilterChange(setFindingFilter)}
          aria-label="Finding type filter"
        >
          {FINDING_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {filtersActive && (
          <button className="history-clear-filters" onClick={clearFilters}>
            <X size={14} /> Clear filters
          </button>
        )}
      </div>

      {isVuln ? (
        <VulnerabilityHistoryTable
          data={tableData}
          onView={openDrawer}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyMessage={
            filtersActive
              ? "No scan history records match the selected filters."
              : "No vulnerability scan history found."
          }
          footer={footer}
        />
      ) : (
        <ThreatHistoryTable
          data={tableData}
          onView={openDrawer}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyMessage={
            filtersActive
              ? "No scan history records match the selected filters."
              : "No threat scan history found."
          }
          footer={footer}
        />
      )}

      <ScanDetailsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        scan={selectedScan}
        initialTab={activeDrawerTab}
        onOpenJsonModal={openJsonModal}
      />

      <RawEvidenceModal
        open={modalOpen}
        onClose={closeModal}
        title={modalTitle}
        subtitle={modalSubtitle}
        finding={selectedFinding}
        scanContext={selectedScan}
        type={selectedFindingType}
      />
    </div>
  );
};

export default History;
