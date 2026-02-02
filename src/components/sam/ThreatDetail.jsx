const ThreatDetail = ({ threat, onBack }) => {
  return (
    <div className="sam-page">
      <button className="back-btn" onClick={onBack}>
        Return
      </button>

      <h2 className="detail-title">Detailed View</h2>

      <div className="detail-card">
        <div className="detail-header">
          <span className="severity critical">{threat.severity}</span>
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

      <button className="export-btn">Export</button>
    </div>
  );
};

export default ThreatDetail;
