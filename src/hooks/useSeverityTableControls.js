// hooks/useSeverityTableControls.js
import { useMemo, useState } from "react";

const severityOrder = {
  none: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

export const useSeverityTableControls = ({
  data = [],
  defaultSortField = "severity",
  searchFields = ["name"],
}) => {
  const [globalSearch, setGlobalSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState([]);
  const [sortBy, setSortBy] = useState({ field: defaultSortField, dir: "desc" });

  const rows = useMemo(() => {
    let result = Array.isArray(data) ? [...data] : [];

    // search
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      result = result.filter((row) =>
        searchFields.some((f) =>
          String(row[f] || "").toLowerCase().includes(q)
        )
      );
    }

    // severity multi-filter
    if (severityFilter.length > 0) {
      result = result.filter((row) =>
        severityFilter.includes(String(row.severity || "").toLowerCase())
      );
    }

    // sort
    result.sort((a, b) => {
      let aVal = a[sortBy.field];
      let bVal = b[sortBy.field];

      if (sortBy.field === "severity") {
        aVal = severityOrder[String(a.severity || "").toLowerCase()] || 0;
        bVal = severityOrder[String(b.severity || "").toLowerCase()] || 0;
      } else if (sortBy.field === "score") {
        aVal = Number(a.score) || 0;
        bVal = Number(b.score) || 0;
      } else if (sortBy.field === "detectedTime") {
        aVal = new Date(a.detectedTime || 0).getTime();
        bVal = new Date(b.detectedTime || 0).getTime();
      } else {
        aVal = String(aVal || "").toLowerCase();
        bVal = String(bVal || "").toLowerCase();
      }

      if (aVal < bVal) return sortBy.dir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortBy.dir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, globalSearch, severityFilter, sortBy, searchFields]);

  const toggleSort = (field) => {
    setSortBy((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "desc" }
    );
  };

  const toggleSeverity = (sev) => {
    const val = sev.toLowerCase();
    setSeverityFilter((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    );
  };

  const clearFilters = () => {
    setSeverityFilter([]);
    setGlobalSearch("");
    setSortBy({ field: defaultSortField, dir: "desc" });
  };

  return {
    rows,
    globalSearch,
    setGlobalSearch,
    severityFilter,
    toggleSeverity,
    clearFilters,
    sortBy,
    toggleSort,
  };
};
