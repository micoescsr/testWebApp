// pages/Dashboard/Dashboard.jsx
import { useMemo } from "react";
import "./Dashboard.css";
import { useDashboard } from "../../hooks/useDashboard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import DashboardBreadcrumb from "../../components/dashboard/DashboardBreadcrumb";
import SummarySection from "../../components/dashboard/SummarySection";
import NetworkSection from "../../components/dashboard/NetworkSection";
import Spinner from "../../components/common/Spinner/Spinner";
import { groupNetworksBySsid } from "../../utils/networkGrouping";

const Dashboard = () => {
  const {
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
    networks,
    scanList,
    selectedScanId,
    setSelectedScanId,
    summaryDate,
    setSummaryDate,
    piStatus,
  } = useDashboard();

  // Label for the trailing breadcrumb crumb when viewing a single network.
  // Reuses the combobox's grouping so the name matches the selector exactly.
  const networkName = useMemo(() => {
    if (isSummary) return null;
    for (const g of groupNetworksBySsid(networks)) {
      const ap = g.aps.find((a) => a.network_id === viewMode);
      if (ap) return ap.displaySsid;
    }
    return null;
  }, [isSummary, networks, viewMode]);

  const goSummary = () => setViewMode("Summary");

  return (
    <div className="dashboard">
      <DashboardHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        isSummary={isSummary}
        networks={networks}
        scanList={scanList}
        selectedScanId={selectedScanId}
        onScanChange={setSelectedScanId}
        summaryDate={summaryDate}
        onSummaryDateChange={setSummaryDate}
        availableScanDates={summary?.availableScanDates || []}
        piStatus={piStatus}
      />

      {!isSummary && (
        <DashboardBreadcrumb
          currentLabel={networkName}
          onGoSummary={goSummary}
        />
      )}

      {loading && <Spinner label="Loading dashboard data..." />}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          {isSummary ? (
            <SummarySection
              showLegend={showLegend}
              toggleLegend={toggleLegend}
              data={summary}
              hoverContext={hoverContext}
              setHoverContext={setHoverContext}
              clearHoverContext={clearHoverContext}
              onSelectNetwork={setViewMode}
            />
          ) : (
            <NetworkSection
              showLegend={showLegend}
              toggleLegend={toggleLegend}
              data={networkData}
              hoverContext={hoverContext}
              setHoverContext={setHoverContext}
              clearHoverContext={clearHoverContext}
            />
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
