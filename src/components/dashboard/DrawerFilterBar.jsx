// components/dashboard/DrawerFilterBar.jsx
//
// Compact, reusable filter/sort toolbar for the dashboard metric drawers.
// Presentation only — the parent owns state and passes a config describing the
// search box, dropdown filters, and sort options. Sized for the 440px drawer.
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import "./DrawerFilterBar.css";

const Select = ({ id, label, value, options, onChange, includeAll = true, allLabel = "All" }) => (
  <label className="dfb-field" htmlFor={id}>
    <span className="dfb-field-label">{label}</span>
    <select
      id={id}
      className="dfb-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {includeAll && <option value="all">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

const DrawerFilterBar = ({
  config,
  state,
  onSearch,
  onFilter,
  onSort,
  onClear,
  activeCount,
  searchPlaceholder = "Search…",
}) => {
  const { searchFields = [], filters = [], sorts = [] } = config;
  const hasSearch = searchFields.length > 0;

  return (
    <div className="dfb" role="group" aria-label="Filter and sort">
      {hasSearch && (
        <div className="dfb-search">
          <MagnifyingGlass size={14} weight="bold" aria-hidden="true" />
          <input
            type="search"
            className="dfb-search-input"
            value={state.search}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}

      <div className="dfb-controls">
        {filters.map((f) => (
          <Select
            key={f.id}
            id={`dfb-${f.id}`}
            label={f.label}
            allLabel={f.allLabel}
            value={state.filters[f.id] ?? "all"}
            options={f.options}
            onChange={(v) => onFilter(f.id, v)}
          />
        ))}

        {sorts.length > 0 && (
          <Select
            id="dfb-sort"
            label="Sort by"
            value={state.sort}
            options={sorts.map((s) => ({ value: s.id, label: s.label }))}
            onChange={onSort}
            includeAll={false}
          />
        )}
      </div>

      {activeCount > 0 && (
        <div className="dfb-active-row">
          <span className="dfb-active-count">
            {activeCount} active filter{activeCount === 1 ? "" : "s"}
          </span>
          <button type="button" className="dfb-clear" onClick={onClear}>
            <X size={12} weight="bold" aria-hidden="true" />
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};

export default DrawerFilterBar;
