// hooks/useDashboard.js
import { useState, useEffect } from "react";
import {
  getDashboardSummary,
  getDashboardForNetwork,
} from "../api/dashboardApi";
import {
  riskScoreData,
  riskScoreDataPerNetwork,
  severityData,
  severityDataPerNetwork,
  threatsData,
  threatsDataPerNetwork,
  commonVulnsData,
  commonVulnsPerNetwork,
  detectedThreatsData,
} from "../data/dashboardData";

export const useDashboard = () => {
  const [viewMode, setViewMode] = useState("Summary"); // "Summary" or SSID
  const [showLegend, setShowLegend] = useState(false);
  const isSummary = viewMode === "Summary";
  const toggleLegend = () => setShowLegend((prev) => !prev);

  // SHARED HOVER STATE FOR LINKED HIGHLIGHTING
  // dimension can be: "network", "severity", "kind", "encryption", "time", etc.
  const [hoverContext, setHoverContext] = useState(null);
  const clearHoverContext = () => setHoverContext(null);

  // Data state (initialized with mock data)
  const [summary, setSummary] = useState({
    riskScoreData,
    severityData,
    threatsData,
    commonVulnsData,
  });

  const [networkData, setNetworkData] = useState({
    riskScoreData: riskScoreDataPerNetwork,
    severityData: severityDataPerNetwork,
    threatsData: threatsDataPerNetwork,
    commonVulnsData: commonVulnsPerNetwork,
    detectedThreatsData,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isSummary) {
          // const res = await getDashboardSummary();
          // setSummary(res.data);
        } else {
          const ssid = viewMode;
          // const res = await getDashboardForNetwork(ssid);
          // setNetworkData(res.data);
        }
      } catch (err) {
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [viewMode, isSummary]);

  return {
    viewMode,
    setViewMode,
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
  };
};
