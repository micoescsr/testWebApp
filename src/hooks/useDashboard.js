// hooks/useDashboard.js
import { useState, useEffect, useCallback } from "react";
import {
  getDashboardSummary,
  getDashboardForNetwork,
  getNetworks,
} from "../api/dashboardApi";

export const useDashboard = () => {
  // ΓöÇΓöÇ View mode: "Summary" or a network_id UUID ΓöÇΓöÇ
  const [viewMode, setViewMode] = useState("Summary");
  const [showLegend, setShowLegend] = useState(false);
  const isSummary = viewMode === "Summary";
  const toggleLegend = () => setShowLegend((prev) => !prev);

  // ΓöÇΓöÇ Shared hover state for linked highlighting ΓöÇΓöÇ
  const [hoverContext, setHoverContext] = useState(null);
  const clearHoverContext = () => setHoverContext(null);

  // ΓöÇΓöÇ Network list (for dropdown) ΓöÇΓöÇ
  const [networks, setNetworks] = useState([]);

  // ΓöÇΓöÇ Date filter: selected scan ΓöÇΓöÇ
  const [selectedScanId, setSelectedScanId] = useState(null);
  const [scanList, setScanList] = useState([]);

  // ΓöÇΓöÇ Data state (null = not yet loaded) ΓöÇΓöÇ
  const [summary, setSummary] = useState(null);
  const [networkData, setNetworkData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ΓöÇΓöÇ Fetch network list once on mount ΓöÇΓöÇ
  useEffect(() => {
    let cancelled = false;
    const fetchNetworks = async () => {
      try {
        const res = await getNetworks();
        if (!cancelled) setNetworks(res.data || []);
      } catch (err) {
        console.error("Failed to fetch networks:", err);
      }
    };
    fetchNetworks();
    return () => { cancelled = true; };
  }, []);

  // ΓöÇΓöÇ Reset selectedScanId when network changes ΓöÇΓöÇ
  const handleSetViewMode = useCallback((mode) => {
    setViewMode(mode);
    setSelectedScanId(null);
    setScanList([]);
    // Clear stale data so loading shows
    if (mode === "Summary") {
      setNetworkData(null);
    } else {
      setSummary(null);
    }
  }, []);

  // ΓöÇΓöÇ Main data fetch: runs on viewMode or selectedScanId change ΓöÇΓöÇ
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isSummary) {
          const res = await getDashboardSummary();
          if (!cancelled) setSummary(res.data);
        } else {
          const networkId = viewMode;
          const res = await getDashboardForNetwork(
            networkId,
            selectedScanId
          );
          if (!cancelled) {
            setNetworkData(res.data);
            // scanList comes from the per-network response
            if (res.data?.scanList) {
              setScanList(res.data.scanList);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || err.message || "Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [viewMode, isSummary, selectedScanId]);

  return {
    viewMode,
    setViewMode: handleSetViewMode,
    isSummary,
    showLegend,
    toggleLegend,
    loading,
    error,
    summary,
    networkData,
    hoverContext,
    setHoverContext,
    clearHoverContext,
    // New: for dropdowns
    networks,
    scanList,
    selectedScanId,
    setSelectedScanId,
  };
};
