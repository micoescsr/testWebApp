// pages/History.jsx
import { useState } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import FindingDetailModal from "../../components/modals/FindingDetailModal/FindingDetailModal";
import VulnerabilityHistoryTable from "../../components/history/VulnerabilityHistoryTable";
import ThreatHistoryTable from "../../components/history/ThreatHistoryTable";
import { useSAMHistory } from "../../hooks/useSAMHistory";
import { useThreats, useVulnerabilities } from "../../hooks/useSAM";
import "./History.css";

const History = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [expandedRow, setExpandedRow] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { vulnHistory, threatHistory } = useSAMHistory();
  const { vulnDetail, vulnDetailLoading, fetchVulnDetail } =
    useVulnerabilities();
  const { threatDetail, threatDetailLoading, fetchThreatDetail } =
    useThreats();

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

  return (
    <div className="history-page">
      <h1 className="page-title">History</h1>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "vulnerabilities" && (
        <VulnerabilityHistoryTable
          data={vulnHistory}
          expandedRow={expandedRow}
          onToggleExpand={toggleExpand}
          onViewDetail={openVulnModal}
        />
      )}

      {activeTab === "threats" && (
        <ThreatHistoryTable
          data={threatHistory}
          expandedRow={expandedRow}
          onToggleExpand={toggleExpand}
          onViewDetail={openThreatModal}
        />
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
