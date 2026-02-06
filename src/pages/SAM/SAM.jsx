// pages/SAM.jsx
import { useState } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import "./SAM.css";
import ThreatsTable from "../../components/sam/ThreatsTable";
import VulnerabilitiesTable from "../../components/sam/VulnerabilitiesTable";
import SAMSidebar from "../../components/sam/SAMSidebar";
import { useThreats, useVulnerabilities, useNetworks, useThreatDetection } from "../../hooks/useSAM";
import { triggerScan } from "../../api/rasPiApi";
import FindingDetailModal from "../../components/modals/FindingDetailModal/FindingDetailModal";

const SAM = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [lastScannedNetwork, setLastScannedNetwork] = useState(null); 
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [locationMeta, setLocationMeta] = useState({
    city: "",
    province: "",
    notes: "",
  });

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
    reloadVulnerabilities,
  } = useVulnerabilities(selectedNetwork?.bssid);

  const {
    networks, 
    loading: networksLoading, 
    error: networksError 
  } = useNetworks();

  // --- POLLING HOOK ---
  const { 
    detectionStatus, 
    setDetectionStatus, 
    detectionResults, 
    resetDetection 
  } = useThreatDetection();

  // Helper: Filter vulnerabilities locally if needed
  const filteredVulns = selectedNetwork && Array.isArray(vulnerabilities)
    ? vulnerabilities.filter((v) => v.bssid === selectedNetwork.bssid)
    : [];

  const handleMetaChange = (field, value) => {
    setLocationMeta((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectNetwork = async (net) => {
    setSelectedNetwork(net);

    try {
      const res = await fetch(`/api/webApp/network_metadata?bssid=${net.bssid}`);
      if (!res.ok) {
        console.warn(`Metadata fetch failed: ${res.status}`);
        setLocationMeta({ city: "", province: "", notes: "" });
        return;
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
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

    await reloadVulnerabilities(net.bssid);
  };

  const handleScan = async () => {
    if (!selectedNetwork) {
      alert("Please select a network first");
      return;
    }

    if (!locationMeta.city || !locationMeta.province || !locationMeta.notes) {
      alert("City, Province, and Notes are required");
      return;
    }

    // 1. STOP previous detection & set scanning state
    resetDetection(); 
    setDetectionStatus('SCANNING');

    try {
      // 2. Trigger Scan
      const result = await triggerScan(selectedNetwork);
      setLastScan(result);
      setLastScannedNetwork(selectedNetwork);

      // 3. Save Results
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
          scan: result,
          encryption_status: selectedNetwork.encryption_status,
          num_clients: selectedNetwork.num_clients,
        }),
      });

      if (!saveRes.ok) throw new Error("Save failed");

      alert("Scan finished. Starting Threat Detection...");
      
      // 4. Start Detection Phase
      setDetectionStatus('DETECTING'); 
      await reloadVulnerabilities(selectedNetwork.bssid);

    } catch (err) {
      console.error("Scan error:", err);
      alert("Scan failed");
      setDetectionStatus('IDLE');
    }
  };

  const saveSelectedNetwork = async () => {
    if (!selectedNetwork?.bssid || selectedNetwork?.channel === undefined) {
      alert('Select a full network first');
      return;
    }

    try {
      const res = await fetch('/api/networks', {
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
    } catch (err) {
      console.error(err);
      alert(`Save failed: ${err.message}`);
    }
  };

  const openThreatDetail = async (threat) => {
    await fetchThreatDetail(threat.name);
    setIsModalOpen(true);
  };

  const openVulnDetail = async (vuln) => {
    await fetchVulnDetail(vuln.name);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // --- MERGE REAL-TIME THREATS ---
  const displayThreats = detectionResults?.results?.length > 0 
    ? detectionResults.results.map(r => ({
        id: r.findings.evil_twin?.id || "Unknown",
        name: r.findings.evil_twin?.value || "Threat",
        severity: r.findings.evil_twin?.status === "DETECTED" ? "CRITICAL" : "SAFE",
        detectedTime: r.detection_start,
        status: r.findings.evil_twin?.status
      }))
    : threats;

  const currentDetail = activeTab === "threats" ? threatDetail : vulnDetail;
  const detailLoading = activeTab === "threats" ? threatDetailLoading : vulnDetailLoading;

  const tabs = [
    { label: "Threats", value: "threats" },
    { label: "Vulnerabilities", value: "vulnerabilities" },
  ];

  return (
    <div className={activeTab === "vulnerabilities" ? "sam-layout" : "sam-page"}>
      <div className="sam-main">
        <h1 className="page-title">Security Assessment Management</h1>

        {/* STATUS BANNER */}
        {detectionStatus === 'DETECTING' && (
           <div className="status-banner detecting" style={{background: '#e6fffa', color: '#047857', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #047857'}}>
              Scanning active... Monitoring for threats ({detectionResults?.results?.length || 0} found)
           </div>
        )}

        <div className="sam-header">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        {activeTab === "threats" && (
          <ThreatsTable
            threats={displayThreats}
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
          lastScannedNetwork={lastScannedNetwork}
          onSelectNetwork={handleSelectNetwork}
          availableNetworks={networks}
          onScan={handleScan}
          onSaveNetwork={saveSelectedNetwork}
          lastScan={lastScan}
          locationMeta={locationMeta}
          onChangeMeta={handleMetaChange}
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
