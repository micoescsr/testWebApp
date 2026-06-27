// components/dashboard/DashboardBreadcrumb.jsx
//
// Path navigation for the Dashboard module. The dashboard switches views via
// React state (useDashboard -> viewMode), not routing, so the breadcrumb is
// derived from that state rather than the URL.
//
//   Summary view : Dashboard / Summary
//   Network view : Dashboard / Summary / <NetworkName>   [← Back to Summary]
//
// "Dashboard" and "Summary" return to the Summary view. The trailing crumb is
// the current location (non-interactive, highlighted). Drawer drill-downs keep
// their own title + close button and are not reflected here.
import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import "./DashboardBreadcrumb.css";

const DashboardBreadcrumb = ({ isSummary, networkName, onGoSummary }) => {
  return (
    <div className="dash-breadcrumb-bar">
      <nav className="dash-breadcrumb" aria-label="Breadcrumb">
        <ol className="dash-crumb-list">
          <li className="dash-crumb">
            {isSummary ? (
              <span className="dash-crumb-text">Dashboard</span>
            ) : (
              <button
                type="button"
                className="dash-crumb-link"
                onClick={onGoSummary}
              >
                Dashboard
              </button>
            )}
          </li>

          <li className="dash-crumb-sep" aria-hidden="true">
            <CaretRight size={12} weight="bold" />
          </li>

          <li className="dash-crumb">
            {isSummary ? (
              <span className="dash-crumb-current" aria-current="page">
                Summary
              </span>
            ) : (
              <button
                type="button"
                className="dash-crumb-link"
                onClick={onGoSummary}
              >
                Summary
              </button>
            )}
          </li>

          {!isSummary && (
            <>
              <li className="dash-crumb-sep" aria-hidden="true">
                <CaretRight size={12} weight="bold" />
              </li>
              <li className="dash-crumb">
                <span className="dash-crumb-current" aria-current="page">
                  {networkName || "Network"}
                </span>
              </li>
            </>
          )}
        </ol>
      </nav>

      {!isSummary && (
        <button
          type="button"
          className="dash-back-btn"
          onClick={onGoSummary}
        >
          <ArrowLeft size={14} weight="bold" />
          Back to Summary
        </button>
      )}
    </div>
  );
};

export default DashboardBreadcrumb;
