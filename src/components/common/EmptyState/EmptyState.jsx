// components/common/EmptyState/EmptyState.jsx
import "./EmptyState.css";

const EmptyState = ({ message, icon = null }) => (
  <div className="shared-empty-state">
    {icon && <span className="shared-empty-state-icon" aria-hidden="true">{icon}</span>}
    <p className="shared-empty-state-message">{message}</p>
  </div>
);

export default EmptyState;
