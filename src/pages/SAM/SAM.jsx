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
  const [lastScannedNetwork, setLastScannedNetwork] = useState(null); //added for vulnerability scan display
   const [selectedNetwork, setSelectedNetwork] = useState(null);      // <-- add this
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
    reloadVulnerabilities,  // <-- ADD THIS LINE
  } = useVulnerabilities(selectedNetwork?.bssid);  // <-- pass bssid

   /* const { //added for networks list
    networks, 
    loading: networksLoading, 
    error: networksError 
  } = useNetworks();
 */

  const networks = [
  {
    ssid: "......",
    bssid: "2E:B4:BE:DA:B7:38",
    channel: 6,
  }
];
  const [locationMeta, setLocationMeta] = useState({
    city: "",
    province: "",
    notes: "",
  });

  console.log("selectedNetwork", selectedNetwork);
  console.log("raw vulnerabilities", vulnerabilities);

  const filteredVulns =
  selectedNetwork && Array.isArray(vulnerabilities)
    ? vulnerabilities.filter(
        (v) => v.bssid === selectedNetwork.bssid // adjust field name below
      )
    : []; 
  console.log("filteredVulns", filteredVulns);

  /* const filteredVulns = selectedNetwork //Explicitly filter in the component (if backend returns multiple BSSIDs)
    ? vulnerabilities.filter(v => v.network_bssid === selectedNetwork.bssid)
    : []; */

  const handleMetaChange = (field, value) => {
    setLocationMeta((prev) => ({ ...prev, [field]: value }));
  };

  //prevents the crash, clears fields for new/unknown networks, and pre-fills only for existing ones with valid JSON.
  const handleSelectNetwork = async (net) => {
  setSelectedNetwork(net);

  try {
    const res = await fetch(`/api/webApp/network_metadata?bssid=${net.bssid}`);
    if (!res.ok) {  // Add this check FIRST
      console.warn(`Metadata fetch failed: ${res.status} ${res.statusText}`);
      setLocationMeta({ city: "", province: "", notes: "" });
      return;  // Exit early
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('Response is not JSON:', contentType);
      setLocationMeta({ city: "", province: "", notes: "" });
      return;
    }
    
    const data = await res.json();
    setLocationMeta({
      city: data.city || "",
      province: data.province || "",
      notes: data.notes || "",
    });
  } catch (e) {
    console.error("Failed to load metadata:", e);
    setLocationMeta({ city: "", province: "", notes: "" });
  }

  // ⬇️ reload vulns for this network (if it has past scans) -- Optionally reload when user changes selected network
  await reloadVulnerabilities(net.bssid);
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
      // 1) trigger scan (fastapi only)
      const result = await triggerScan(selectedNetwork); // single scan object
      setLastScan(result); // scan object
      setLastScannedNetwork(selectedNetwork); // for display in sidebar (freeze current network until new selection/scan)

      // 2) save network + metadata + scan
      const saveRes = await fetch("http://localhost:3000/api/rasPi/networks", {
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
          encryption_status: selectedNetwork.encryption_status,
          num_clients: selectedNetwork.num_clients,

        }),
      });
      console.log("Save response:", saveRes);

      if (!saveRes.ok) {
        throw new Error("Save failed");
      }

      alert("Scan started successfully");

    // After scan/save, refresh vulnerabilities for this network
    await reloadVulnerabilities(selectedNetwork.bssid);

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
            //vulnerabilities={filteredVulns} // <-- use filtered list
            onView={openVulnDetail}
          />
        )}
      </div>

      {activeTab === "vulnerabilities" && (
        <SAMSidebar
          selectedNetwork={selectedNetwork}
          lastScannedNetwork={lastScannedNetwork} //pass for display in sidebar (freeze current network until new selection/scan)
          //onSelectNetwork={setSelectedNetwork}
          onSelectNetwork={handleSelectNetwork}
          availableNetworks={networks}
          onScan={handleScan} 
          //networksLoading={networksLoading}  // optional, if you want to show spinner
          //networksError={networksError}      // optional
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
