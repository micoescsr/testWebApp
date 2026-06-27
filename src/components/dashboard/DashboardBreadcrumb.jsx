// components/dashboard/DashboardBreadcrumb.jsx
//
// Path navigation for the Dashboard module. The dashboard switches views via
// React state (useDashboard -> viewMode), not routing, so the breadcrumb is
// derived from that state rather than the URL.
//
// Only rendered on a network drill-down view (the caller gates on !isSummary).
// Summary is the dashboard's starting point, so "Dashboard / Summary" alone is
// redundant and not shown.
//
//   Dashboard / Summary / <NetworkName>   [← Back to Summary]
//
// "Dashboard" and "Summary" return to the Summary view. The trailing crumb is
// the current location (non-interactive, highlighted, aria-current). Drawer
// drill-downs keep their own title + close button and are not reflected here.
import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import "./DashboardBreadcrumb.css";

const DashboardBreadcrumb = ({ currentLabel, onGoSummary }) => {
  return (
    <div className="dash-breadcrumb-bar">
      <nav className="dash-breadcrumb" aria-label="Breadcrumb">
        <ol className="dash-crumb-list">
          <li className="dash-crumb">
            <button
              type="button"
              className="dash-crumb-link"
              onClick={onGoSummary}
            >
              Dashboard
            </button>
          </li>

          <li className="dash-crumb-sep" aria-hidden="true">
            <CaretRight size={12} weight="bold" />
          </li>

          <li className="dash-crumb">
            <button
              type="button"
              className="dash-crumb-link"
              onClick={onGoSummary}
            >
              Summary
            </button>
          </li>

          <li className="dash-crumb-sep" aria-hidden="true">
            <CaretRight size={12} weight="bold" />
          </li>

          <li className="dash-crumb">
            <span className="dash-crumb-current" aria-current="page">
              {currentLabel || "Network"}
            </span>
          </li>
        </ol>
      </nav>

      <button type="button" className="dash-back-btn" onClick={onGoSummary}>
        <ArrowLeft size={14} weight="bold" />
        Back to Summary
      </button>
    </div>
  );
};

export default DashboardBreadcrumb;
