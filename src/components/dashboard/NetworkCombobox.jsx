// components/dashboard/NetworkCombobox.jsx
//
// Searchable network selector for the dashboard. Replaces the plain <select>.
// - Groups duplicate SSIDs and shows the AP count; a multi-AP group expands so
//   the user can pick a specific BSSID (each AP maps to its own network_id).
// - Searches across SSID / BSSID / encryption / risk / channel.
// - "Summary" stays the first option (value passed straight through to setViewMode).
import { useState, useRef, useEffect, useMemo } from "react";
import { MagnifyingGlass, CaretDown, CaretRight, Check } from "@phosphor-icons/react";
import SeverityBadge from "../common/SeverityBadge/SeverityBadge";
import { groupNetworksBySsid, apMatchesQuery } from "../../utils/networkGrouping";
import "./NetworkCombobox.css";

const SUMMARY = "Summary";

const NetworkCombobox = ({ value, networks, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedSsid, setExpandedSsid] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const groups = useMemo(() => groupNetworksBySsid(networks), [networks]);

  // Flat lookup of the currently-selected AP (for the trigger label).
  const selectedAp = useMemo(() => {
    if (value === SUMMARY) return null;
    for (const g of groups) {
      const found = g.aps.find((a) => a.network_id === value);
      if (found) return found;
    }
    return null;
  }, [value, groups]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search when opened.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();

  // Filter groups by query; auto-expand matching multi-AP groups while searching.
  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, aps: g.aps.filter((a) => apMatchesQuery(a, q)) }))
      .filter((g) => g.aps.length > 0 || g.ssid.toLowerCase().includes(q));
  }, [groups, q]);

  const select = (val) => {
    onChange(val);
    setOpen(false);
  };

  const triggerLabel =
    value === SUMMARY
      ? "Summary"
      : selectedAp
      ? selectedAp.displaySsid
      : "Select network";

  // indented = child of a multi-AP group; the SSID is in the group header, so
  // the child's primary line shows the BSSID. Single-AP rows show the SSID.
  const renderApRow = (ap, indented) => {
    const primary = indented
      ? `BSSID ${ap.bssidShort || ap.bssid || "—"}`
      : ap.displaySsid;

    const subParts = [];
    if (!indented && ap.bssidShort) subParts.push(`BSSID ${ap.bssidShort}`);
    if (ap.channel != null) subParts.push(`CH ${ap.channel}`);
    const sub = subParts.join(" · ");

    return (
      <button
        key={ap.network_id}
        type="button"
        role="option"
        aria-selected={ap.network_id === value}
        className={`nc-option ${indented ? "nc-option--indent" : ""} ${
          ap.network_id === value ? "nc-option--selected" : ""
        }`}
        onClick={() => select(ap.network_id)}
      >
        <span className="nc-option-main">
          <span className="nc-option-title">
            {primary}
            {ap.network_id === value && (
              <Check size={13} weight="bold" className="nc-check" />
            )}
          </span>
          {sub && <span className="nc-option-sub">{sub}</span>}
          <span className="nc-badges">
            {ap.encryption_status && (
              <span className="nc-enc-badge">{ap.encryption_status}</span>
            )}
            <SeverityBadge level={ap.riskLevel} size="sm" />
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="network-combobox" ref={rootRef}>
      <button
        type="button"
        className="nc-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="nc-trigger-label">{triggerLabel}</span>
        <CaretDown size={14} />
      </button>

      {open && (
        <div className="nc-panel" role="dialog">
          <div className="nc-search">
            <MagnifyingGlass size={14} className="nc-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="nc-search-input"
              placeholder="Search SSID, BSSID, encryption, risk…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            />
          </div>

          <div className="nc-list" role="listbox">
            <button
              type="button"
              role="option"
              aria-selected={value === SUMMARY}
              className={`nc-option ${
                value === SUMMARY ? "nc-option--selected" : ""
              }`}
              onClick={() => select(SUMMARY)}
            >
              <span className="nc-option-title">Summary (all networks)</span>
              {value === SUMMARY && <Check size={14} weight="bold" />}
            </button>

            {filteredGroups.length === 0 && (
              <p className="nc-empty">No networks match “{query}”.</p>
            )}

            {filteredGroups.map((g) => {
              const multi = g.aps.length > 1;
              // While searching, show matches expanded; otherwise collapse groups.
              const expanded = q ? true : expandedSsid === g.ssid;

              if (!multi) {
                return g.aps.map((ap) => renderApRow(ap, false));
              }

              return (
                <div key={g.ssid} className="nc-group">
                  <button
                    type="button"
                    className="nc-group-header"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedSsid((cur) => (cur === g.ssid ? null : g.ssid))
                    }
                  >
                    {expanded ? (
                      <CaretDown size={13} />
                    ) : (
                      <CaretRight size={13} />
                    )}
                    <span className="nc-group-title">{g.ssid}</span>
                    <span className="nc-ap-count">{g.aps.length} APs</span>
                  </button>
                  {expanded && g.aps.map((ap) => renderApRow(ap, true))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkCombobox;
