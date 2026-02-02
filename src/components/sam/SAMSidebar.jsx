// components/sam/SAMSidebar.jsx
const SAMSidebar = ({
  selectedNetwork,
  onSelectNetwork,
  availableNetworks,
  onScan,
}) => {
  return (
    <div className="sam-sidebar">
      <div className="sidebar-section">
        <div className="info-row">
          <span className="info-label">Current Network</span>
          <span className="info-value">
            {selectedNetwork || "N/A"}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Last Scan</span>
          <span className="info-value">N/A</span>
        </div>
        <div className="info-row">
          <span className="info-label">Scheduled Scan</span>
          <span className="info-value">N/A</span>
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-title">Available Networks</h3>
        <div className="network-list">
          {availableNetworks.map((network, index) => (
            <div
              key={index}
              className={`network-item ${
                selectedNetwork === network ? "active" : ""
              }`}
              onClick={() => onSelectNetwork(network)}
            >
              {network}
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-header">
          <h3 className="sidebar-title">Network Details</h3>
          <button className="edit-btn">✏️</button>
        </div>
        <div className="network-form">
          <input type="text" placeholder="City" className="form-input" />
          <input type="text" placeholder="Province" className="form-input" />
          <textarea
            placeholder="Notes (e.g. SM Mall)"
            className="form-textarea"
            rows="4"
          ></textarea>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="action-btn primary" onClick={onScan}>
          + Scan Now
        </button>
      </div>
    </div>
  );
};

export default SAMSidebar;
