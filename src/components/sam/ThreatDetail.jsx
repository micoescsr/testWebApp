import { useState } from "react";
import SeverityBadge from "../../components/common/SeverityBadge/SeverityBadge";
import { buildPerNetworkReportData } from "../../utils/reportDataAdapter";
import { generatePerNetworkReportHTML } from "../../utils/reportTemplates";
import { exportReport } from "../../utils/exportReport";
import { useNetworkContext } from "../../context/NetworkContext";
import { useToast } from "../../context/ToastContext";

const ThreatDetail = ({ threat, onBack }) => {
  const { networkId } = useNetworkContext();
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!networkId) {
      showToast?.("Scan a network first to export its report.", "error");
      return;
    }
    setExporting(true);
    try {
      const data = await buildPerNetworkReportData(networkId);
      const html = generatePerNetworkReportHTML(data);
      exportReport(html);
    } catch {
      showToast?.("Failed to generate network report. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="sam-page">
      <button className="back-btn" onClick={onBack}>
        Return
      </button>

      <h2 className="detail-title">Detailed View</h2>

      <div className="detail-card">
        <div className="detail-header">
          <SeverityBadge level={threat.severity} size="lg" />
          <h3>{threat.name}</h3>
        </div>

        <div className="detail-section">
          <h4>Description</h4>
          <p>{threat.description}</p>
        </div>

        <div className="detail-section">
          <div className="recommendation-header">
            <h4>Recommendations</h4>
            <span className="framework-tag">NIST</span>
          </div>

          <div className="recommendation-list">
            {threat.recommendations.map((rec, index) => (
              <div key={index} className="recommendation-item">
                <span className="rec-text">{rec}</span>
                <span className="arrow">›</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="export-btn" onClick={handleExport} disabled={exporting}>
        {exporting ? "Generating…" : "Export"}
      </button>
    </div>
  );
};

export default ThreatDetail;
