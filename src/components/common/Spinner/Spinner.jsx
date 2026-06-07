// components/common/Spinner/Spinner.jsx
import "./Spinner.css";

const Spinner = ({ label = "Loading...", fullScreen = false }) => {
  const content = (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  );

  if (fullScreen) {
    return <div className="spinner-fullscreen">{content}</div>;
  }
  return content;
};

export default Spinner;
