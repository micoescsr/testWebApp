// pages/Dashboard/Dashboard.jsx
import "./Dashboard.css";
import { useDashboard } from "../../hooks/useDashboard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import SummarySection from "../../components/dashboard/SummarySection";
import NetworkSection from "../../components/dashboard/NetworkSection";
import Spinner from "../../components/common/Spinner/Spinner";

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
    piStatus,
  } = useDashboard();

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
        piStatus={piStatus}
      />

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
