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
  const [lastScan, setLastScan] = useState(null);   // NEW

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

  const [locationMeta, setLocationMeta] = useState({
    city: "",
    province: "",
    notes: "",
  });

  const handleMetaChange = (field, value) => {
    setLocationMeta((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectNetwork = async (net) => {
    setSelectedNetwork(net);

    try {
      const res = await fetch(`/api/webApp/network_metadata?bssid=${net.bssid}`); //wla pa to sa backend
      if (res.ok) {
        const data = await res.json();   // { city, province, notes } or null
        if (data) {
          setLocationMeta({
            city: data.city || "",
            province: data.province || "",
            notes: data.notes || "",
          });
        } else {
          setLocationMeta({ city: "", province: "", notes: "" });
        }
      }
    } catch (e) {
      console.error("Failed to load metadata", e); //dito napunta if wla pa record for pre-fill
      setLocationMeta({ city: "", province: "", notes: "" });
    }
  };

  const handleScan = async () => {
    if (!selectedNetwork) {
      alert("Please select a network first");
      return;
    }

    // required
    if (!locationMeta.city || !locationMeta.province || !locationMeta.notes) {
      alert("City, Province, and Notes are required");
      return;
    }

    try {
      // 1) trigger scan
      const result = await triggerScan(selectedNetwork); // single scan object
      setLastScan(result); // store it

      // 2) save network + metadata + scan
      const saveRes = await fetch("/api/rasPi/networks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssid: selectedNetwork.ssid,
          bssid: selectedNetwork.bssid,
          channel: selectedNetwork.channel,
          city: locationMeta.city,
          province: locationMeta.province,
          notes: locationMeta.notes,
          scan: result, // use result, not scanResult
        }),
      });
      console.log("Save response:", saveRes);

      if (!saveRes.ok) {
        throw new Error("Save failed");
      }

      alert("Scan started successfully");
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

    // Add this function inside SAM component, before return()
  const saveSelectedNetwork = async () => {
    if (!selectedNetwork?.bssid || selectedNetwork?.channel === undefined) {
      alert('Select a full network first');
      return;
    }

    try {
      const res = await fetch('/api/networks', {  // Your new POST endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: selectedNetwork.ssid,
          bssid: selectedNetwork.bssid,
          channel: selectedNetwork.channel
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      alert('Network saved to DB!');
      console.log('Saved:', await res.json());  // { status: 'OK', network: { network_id: 123 } }
    } catch (err) {
      console.error(err);
      alert(`Save failed: ${err.message}`);
    }
  };

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
          //onSelectNetwork={setSelectedNetwork}
          onSelectNetwork={handleSelectNetwork}
          availableNetworks={networks}
          onScan={handleScan} 
          networksLoading={networksLoading}  // optional, if you want to show spinner
          networksError={networksError}      // optional
          onSaveNetwork={saveSelectedNetwork}  // for chosen network 
          lastScan={lastScan}              // pass it down
          locationMeta={locationMeta}            // NEW
          onChangeMeta={handleMetaChange}        // NEW
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
