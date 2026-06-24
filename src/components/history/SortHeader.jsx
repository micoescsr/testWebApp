// components/history/SortHeader.jsx
// Clickable, keyboard-accessible table header that shows sort direction.
import { CaretUp, CaretDown, CaretUpDown } from "@phosphor-icons/react";

const SortHeader = ({ field, label, sortField, sortDir, onSort, align }) => {
  const active = sortField === field;
  const Icon = !active ? CaretUpDown : sortDir === "asc" ? CaretUp : CaretDown;

  return (
    <th className={align === "right" ? "th-right" : ""}>
      <button
        type="button"
        className={`sort-th ${active ? "sort-th--active" : ""}`}
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{label}</span>
        <Icon size={13} weight="bold" className="sort-th-icon" />
      </button>
    </th>
  );
};

export default SortHeader;
