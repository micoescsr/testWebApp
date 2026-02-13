// pages/History/History.jsx
import { useState, useMemo, useRef, useEffect } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import Pagination from "../../components/common/Pagination/Pagination";
import FindingDetailModal from "../../components/modals/FindingDetailModal/FindingDetailModal";
import VulnerabilityHistoryTable from "../../components/history/VulnerabilityHistoryTable";
import ThreatHistoryTable from "../../components/history/ThreatHistoryTable";
import { useSAMHistory } from "../../hooks/useSAMHistory";
import { useThreats, useVulnerabilities } from "../../hooks/useSAM";
import { usePagination } from "../../hooks/usePagination";
import "./History.css";

const ITEMS_PER_PAGE = 10;

// Sort option definitions — user can select multiple to combine sorts
const SORT_OPTIONS = [
  { key: "datetime-desc", label: "Date & Time (Newest first)" },
  { key: "datetime-asc", label: "Date & Time (Oldest first)" },
  { key: "summary-desc", label: "Summary Counts (Highest)" },
  { key: "summary-asc", label: "Summary Counts (Lowest)" },
];

const History = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [expandedRow, setExpandedRow] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Multi-select sort: ordered list of selected sort keys (first = primary)
  const [activeSorts, setActiveSorts] = useState(["datetime-desc"]);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target)) {
        setSortDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { vulnHistory, threatHistory } = useSAMHistory();
  const { vulnDetail, vulnDetailLoading, fetchVulnDetail } = useVulnerabilities();
  const { threatDetail, threatDetailLoading, fetchThreatDetail } = useThreats();

  // Multi-level sort comparator — applies sorts in order (first selected = primary)
  const multiSortComparator = (a, b) => {
    for (const sortKey of activeSorts) {
      const [field, order] = sortKey.split("-");
      let diff = 0;

      if (field === "summary") {
        diff = (Number(a.summary) || 0) - (Number(b.summary) || 0);
      } else {
        diff = new Date(a.datetime) - new Date(b.datetime);
      }

      if (diff !== 0) {
        return order === "desc" ? -diff : diff;
      }
    }
    return 0;
  };

  // Filter + sort data
  const filteredVulnHistory = useMemo(() => {
    let data = vulnHistory;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (item) =>
          item.ssid?.toLowerCase().includes(q) ||
          item.datetime?.toLowerCase().includes(q)
      );
    }
    return [...data].sort(multiSortComparator);
  }, [vulnHistory, searchQuery, activeSorts]);

  const filteredThreatHistory = useMemo(() => {
    let data = threatHistory;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (item) =>
          item.ssid?.toLowerCase().includes(q) ||
          item.datetime?.toLowerCase().includes(q)
      );
    }
    return [...data].sort(multiSortComparator);
  }, [threatHistory, searchQuery, activeSorts]);

  // Pagination on filtered + sorted data
  const vulnPager = usePagination(filteredVulnHistory, ITEMS_PER_PAGE);
  const threatPager = usePagination(filteredThreatHistory, ITEMS_PER_PAGE);

  const tabs = [
    { label: "Vulnerabilities", value: "vulnerabilities" },
    { label: "Threats", value: "threats" },
  ];

  const toggleExpand = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const openVulnModal = async (vulnName) => {
    await fetchVulnDetail(vulnName);
    setModalOpen(true);
  };

  const openThreatModal = async (threatName) => {
    await fetchThreatDetail(threatName);
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const currentDetail =
    activeTab === "vulnerabilities" ? vulnDetail : threatDetail;
  const detailLoading =
    activeTab === "vulnerabilities"
      ? vulnDetailLoading
      : threatDetailLoading;

  // Toggle a sort option on/off. Prevents selecting conflicting directions for same field.
  const handleToggleSort = (key) => {
    const [field] = key.split("-");

    setActiveSorts((prev) => {
      if (prev.includes(key)) {
        // Remove it — but keep at least one sort active
        const next = prev.filter((k) => k !== key);
        return next.length > 0 ? next : ["datetime-desc"];
      }
      // Remove any existing sort for the same field (can't have both asc & desc)
      const withoutConflict = prev.filter((k) => !k.startsWith(field + "-"));
      return [...withoutConflict, key];
    });

    setExpandedRow(null);
    vulnPager.resetPage();
    threatPager.resetPage();
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    setExpandedRow(null);
    setSearchQuery("");
    setActiveSorts(["datetime-desc"]);
    setSortDropdownOpen(false);
    vulnPager.resetPage();
    threatPager.resetPage();
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setExpandedRow(null);
    vulnPager.resetPage();
    threatPager.resetPage();
  };

  const clearSearch = () => {
    setSearchQuery("");
    setExpandedRow(null);
    vulnPager.resetPage();
    threatPager.resetPage();
  };

  // Build label for the sort button
  const sortButtonLabel = activeSorts
    .map((k) => SORT_OPTIONS.find((o) => o.key === k)?.label)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="history-page">
      <h1 className="page-title">History</h1>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Search bar */}
      <div className="history-search-bar">
        <svg
          className="history-search-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="history-search-input"
          placeholder={`Search ${activeTab === "vulnerabilities" ? "vulnerabilities" : "threats"} by SSID or date...`}
          value={searchQuery}
          onChange={handleSearchChange}
        />
        {searchQuery && (
          <button
            className="history-search-clear"
            onClick={clearSearch}
            aria-label="Clear search"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {activeTab === "vulnerabilities" && (
        <>
          <VulnerabilityHistoryTable
            data={vulnPager.currentItems}
            expandedRow={expandedRow}
            onToggleExpand={toggleExpand}
            onViewDetail={openVulnModal}
            activeSorts={activeSorts}
            sortDropdownOpen={sortDropdownOpen}
            sortDropdownRef={sortDropdownRef}
            onToggleDropdown={() => setSortDropdownOpen((v) => !v)}
            onToggleSort={handleToggleSort}
            sortButtonLabel={sortButtonLabel}
          />

          <Pagination
            page={vulnPager.page}
            totalPages={vulnPager.totalPages}
            onPrev={vulnPager.goPrev}
            onNext={vulnPager.goNext}
          />
        </>
      )}

      {activeTab === "threats" && (
        <>
          <ThreatHistoryTable
            data={threatPager.currentItems}
            expandedRow={expandedRow}
            onToggleExpand={toggleExpand}
            onViewDetail={openThreatModal}
            activeSorts={activeSorts}
            sortDropdownOpen={sortDropdownOpen}
            sortDropdownRef={sortDropdownRef}
            onToggleDropdown={() => setSortDropdownOpen((v) => !v)}
            onToggleSort={handleToggleSort}
            sortButtonLabel={sortButtonLabel}
          />

          <Pagination
            page={threatPager.page}
            totalPages={threatPager.totalPages}
            onPrev={threatPager.goPrev}
            onNext={threatPager.goNext}
          />
        </>
      )}

      {modalOpen && currentDetail && (
        <FindingDetailModal
          onClose={closeModal}
          vulnerability={currentDetail}
          loading={detailLoading}
        />
      )}
    </div>
  );
};

export default History;
