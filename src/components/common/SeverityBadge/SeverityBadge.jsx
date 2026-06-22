import "./SeverityBadge.css";
import {
  Warning,
  WarningDiamond,
  WarningCircle,
  CheckCircle,
  Info,
  MinusCircle,
  Question,
} from "@phosphor-icons/react";

const normalizeLevel = (level) => {
  const key = String(level ?? "").trim().toLowerCase();
  if (["critical", "high", "medium", "low", "info", "none"].includes(key)) {
    return key;
  }
  return "unknown";
};

const ICON_SIZE = { sm: 12, md: 14, lg: 16 };

const ICON = {
  critical: Warning,
  high: WarningDiamond,
  medium: WarningCircle,
  low: CheckCircle,
  info: Info,
  none: MinusCircle,
  unknown: Question,
};

const SeverityBadge = ({ level, showLabel = true, size = "md", className = "" }) => {
  const key = normalizeLevel(level);
  const label =
    level != null && String(level).trim() !== ""
      ? String(level).toUpperCase()
      : "UNKNOWN";

  const IconComponent = ICON[key];
  const iconSize = ICON_SIZE[size] || ICON_SIZE.md;

  return (
    <span
      className={`severity-badge severity-badge--${key} severity-badge--${size} ${className}`}
      data-severity={key}
    >
      <span className="severity-badge__glyph" aria-hidden="true">
        <IconComponent size={iconSize} weight="fill" />
      </span>
      {showLabel && <span className="severity-badge__label">{label}</span>}
      {!showLabel && <span className="sr-only">{label}</span>}
    </span>
  );
};

export default SeverityBadge;
