// components/common/Toast/Toast.jsx
import "./Toast.css";

const ICONS = {
  success: "✔",
  error: "✕",
  info: "ℹ",
};

const Toast = ({ type = "info", message, onDismiss }) => {
  return (
    <div className={`toast toast-${type}`} role="status">
      <span className="toast-icon" aria-hidden="true">{ICONS[type] || ICONS.info}</span>
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
};

export default Toast;
