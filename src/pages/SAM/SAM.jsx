// pages/SAM.jsx
import { useState } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import "./SAM.css";
import ThreatsTable from "../../components/sam/ThreatsTable";
import VulnerabilitiesTable from "../../components/sam/VulnerabilitiesTable";
import SAMSidebar from "../../components/sam/SAMSidebar";
import { useThreats, useVulnerabilities } from "../../hooks/useSAM";
import { triggerScan } from "../../api/rasPiApi";
import FindingDetailModal from "../../components/modals/FindingDetailModal/FindingDetailModal";
import { useNetworks } from "../../hooks/useSAM"; //added from hook

const SAM = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    threats,
    fetchThreatDetail,
    threatDetail,
    threatDetailLoading,
  } = useThreats();

  const {
    vulnerabilities,
    fetchVulnDetail,
    vulnDetail,
    vulnDetailLoading,
  } = useVulnerabilities();

   const { //added for networks list
    networks, loading: networksLoading, 
    error: networksError 
  } = useNetworks();
  // remove the hard-coded availableNetworks array

  /* const availableNetworks = [
    "Nacho_WiFi",
    "TheGOODWiFi",
    "kWsk1N1nJ4ZX",
    "Back2HonoluluWiFi_5G",
    "LibrengWiFi:>",
    "Free_WiFi",
  ]; */

  const handleScan = async () => {
    if (!selectedNetwork) {
      alert("Please select a network first");
      return;
    }

    try {
      const result = await triggerScan(selectedNetwork);
      alert("Scan started successfully");
      console.log(result);
    } catch (err) {
      console.error("Scan error:", err);
      alert("Scan failed");
    }
  };

  const openThreatDetail = async (threat) => {
    await fetchThreatDetail(threat.name); // later: use id from DB
    setIsModalOpen(true);
  };

  const openVulnDetail = async (vuln) => {
    await fetchVulnDetail(vuln.name); // later: use id from DB
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const currentDetail =
    activeTab === "threats" ? threatDetail : vulnDetail;
  const detailLoading =
    activeTab === "threats"
      ? threatDetailLoading
      : vulnDetailLoading;

  const tabs = [
    { label: "Threats", value: "threats" },
    { label: "Vulnerabilities", value: "vulnerabilities" },
  ];

  return (
    <div
      className={
        activeTab === "vulnerabilities" ? "sam-layout" : "sam-page"
      }
    >
      <div className="sam-main">
        <h1 className="page-title">Security Assessment Management</h1>

        <div className="sam-header">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        {activeTab === "threats" && (
          <ThreatsTable
            threats={threats}
            onView={openThreatDetail}
          />
        )}

        {activeTab === "vulnerabilities" && (
          <VulnerabilitiesTable
            vulnerabilities={vulnerabilities}
            onView={openVulnDetail}
          />
        )}
      </div>

      {activeTab === "vulnerabilities" && (
        <SAMSidebar
          selectedNetwork={selectedNetwork}
          onSelectNetwork={setSelectedNetwork}
          availableNetworks={networks}
          onScan={handleScan} 
          networksLoading={networksLoading}  // optional, if you want to show spinner
          networksError={networksError}      // optional
        />

        
      )}

      {isModalOpen && currentDetail && (
        <FindingDetailModal
          onClose={closeModal}
          vulnerability={currentDetail}
          loading={detailLoading}
        />
      )}
    </div>
  );
};

export default SAM;
