import "./SeverityBadge.css";

/**
 * SeverityBadge — the single source of truth for rendering a severity level.
 *
 * Replaces the previously duplicated `<span className="severity {level}">`
 * implementations across SAM tables and the threat detail view, which used
 * conflicting hardcoded colors and only defined some levels.
 *
 * Encoding is color + label + shape glyph (not color alone) so it remains
 * legible for colour-blind users and at a glance in dense tables.
 *
 * Colors come from the severity tokens in styles/tokens.css and adapt to the
 * active theme automatically.
 *
 * NOTE: the glyphs are simple inline shapes for now. They are intended to be
 * swapped for Phosphor icons in the icon-system phase (per the redesign plan).
 */

// Canonicalize whatever the data layer hands us into a known level key.
const normalizeLevel = (level) => {
  const key = String(level ?? "").trim().toLowerCase();
  if (["critical", "high", "medium", "low", "info", "none"].includes(key)) {
    return key;
  }
  return "unknown";
};

// Distinct shape per level so severity is conveyed without relying on color.
const GLYPH = {
  critical: "◆",
  high: "▲",
  medium: "■",
  low: "●",
  info: "ℹ",
  none: "–",
  unknown: "?",
};

const SeverityBadge = ({ level, showLabel = true, size = "md", className = "" }) => {
  const key = normalizeLevel(level);
  // Preserve the original casing for display when a real value was supplied.
  const label =
    level != null && String(level).trim() !== ""
      ? String(level).toUpperCase()
      : "UNKNOWN";

  return (
    <span
      className={`severity-badge severity-badge--${key} severity-badge--${size} ${className}`}
      data-severity={key}
    >
      <span className="severity-badge__glyph" aria-hidden="true">
        {GLYPH[key]}
      </span>
      {showLabel && <span className="severity-badge__label">{label}</span>}
      {!showLabel && <span className="sr-only">{label}</span>}
    </span>
  );
};

export default SeverityBadge;
