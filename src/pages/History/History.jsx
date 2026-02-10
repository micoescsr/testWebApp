// pages/History/History.jsx
import { useState } from "react";
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

const History = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [expandedRow, setExpandedRow] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { vulnHistory, threatHistory } = useSAMHistory();
  const { vulnDetail, vulnDetailLoading, fetchVulnDetail } = useVulnerabilities();
  const { threatDetail, threatDetailLoading, fetchThreatDetail } = useThreats();

  // Reusable pagination per dataset
  const vulnPager = usePagination(vulnHistory, ITEMS_PER_PAGE);
  const threatPager = usePagination(threatHistory, ITEMS_PER_PAGE);

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

  const handleTabChange = (value) => {
    setActiveTab(value);
    setExpandedRow(null);
    // reset pages when switching tabs
    vulnPager.resetPage();
    threatPager.resetPage();
  };

  return (
    <div className="history-page">
      <h1 className="page-title">History</h1>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {activeTab === "vulnerabilities" && (
        <>
          <VulnerabilityHistoryTable
            data={vulnPager.currentItems}
            expandedRow={expandedRow}
            onToggleExpand={toggleExpand}
            onViewDetail={openVulnModal}
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
