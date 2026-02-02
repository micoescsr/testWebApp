// pages/Dashboard/Dashboard.jsx
import "./Dashboard.css";
import { useDashboard } from "../../hooks/useDashboard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import SummarySection from "../../components/dashboard/SummarySection";
import NetworkSection from "../../components/dashboard/NetworkSection";

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
  } = useDashboard();

  return (
    <div className="dashboard">
      <DashboardHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        isSummary={isSummary}
      />

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          {isSummary ? (
            <SummarySection
              showLegend={showLegend}
              toggleLegend={toggleLegend}
              data={summary}
            />
          ) : (
            <NetworkSection
              showLegend={showLegend}
              toggleLegend={toggleLegend}
              data={networkData}
            />
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
