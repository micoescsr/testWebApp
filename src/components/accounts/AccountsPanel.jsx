// components/accounts/AccountsPanel.jsx
//
// Accounts tab: summary cards + search/role/status filters + sortable table.
// All frontend-only — `users` already loads as a full array, so filtering and
// sorting span every record. The dataset is small (well under a page), so there
// is no pagination/rows-per-page control; the full filtered list is shown.
import { useMemo, useState } from "react";
import AccountsTable from "./AccountsTable";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "inactive", label: "Inactive" },
];

const DEFAULT_DIR = { name: "asc", username: "asc", email: "asc", role: "asc", status: "asc" };

// "Available Slot" placeholder rows (username 'Unknown') aren't real accounts —
// excluded from the summary counts so totals stay meaningful.
const isRealUser = (u) => u.username && u.username !== "Unknown";

const normalizeStatus = (s) => (s || "active").toLowerCase();

const compareUsers = (a, b, field, dir) => {
  const av = (a[field] || "").toString().toLowerCase();
  const bv = (b[field] || "").toString().toLowerCase();
  const diff = av.localeCompare(bv);
  return dir === "asc" ? diff : -diff;
};

const AccountsPanel = ({ users, onEdit, onResetMfa, onAddUser }) => {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  // Summary counts (real users only).
  const summary = useMemo(() => {
    const real = users.filter(isRealUser);
    const by = (s) => real.filter((u) => normalizeStatus(u.status) === s).length;
    return {
      total: real.length,
      active: by("active"),
      onHold: by("on_hold"),
      inactive: by("inactive"),
      admins: real.filter((u) => ["admin", "superadmin"].includes((u.role || "").toLowerCase())).length,
    };
  }, [users]);

  const roleOptions = useMemo(() => {
    const set = new Set(users.map((u) => u.role).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => {
      const matchesSearch =
        !q ||
        [u.name, u.username, u.email].filter(Boolean).join(" ").toLowerCase().includes(q);
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" || normalizeStatus(u.status) === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
    return [...list].sort((a, b) => compareUsers(a, b, sortField, sortDir));
  }, [users, search, roleFilter, statusFilter, sortField, sortDir]);

  const totalCount = users.length;

  const onSort = (field) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(DEFAULT_DIR[field] || "asc");
    }
  };

  const filtersActive =
    search.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  const summaryCards = [
    { label: "Total Accounts", value: summary.total },
    { label: "Active", value: summary.active, tone: "active" },
    { label: "On Hold", value: summary.onHold, tone: "on_hold" },
    { label: "Inactive", value: summary.inactive, tone: "inactive" },
    { label: "Admins", value: summary.admins },
  ];

  // Honest result count: "6 accounts", or "Showing 3 of 6 accounts" when filtered.
  const countLabel = filtersActive
    ? `Showing ${filtered.length} of ${totalCount} account${totalCount === 1 ? "" : "s"}`
    : `${totalCount} account${totalCount === 1 ? "" : "s"}`;

  const footer = (
    <div className="history-footer-left">
      <span className="history-result-count">{countLabel}</span>
    </div>
  );

  return (
    <div className="accounts-panel">
      {/* Summary cards */}
      <div className="accounts-summary">
        {summaryCards.map((c) => (
          <div key={c.label} className={`account-stat ${c.tone ? `account-stat--${c.tone}` : ""}`}>
            <span className="account-stat-value">{c.value}</span>
            <span className="account-stat-label">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="accounts-toolbar">
        <div className="history-search-bar">
          <MagnifyingGlass className="history-search-icon" size={18} />
          <input
            type="text"
            className="history-search-input"
            placeholder="Search by name, username, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="history-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <select
          className="history-filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Role filter"
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r === "all" ? "All roles" : r}
            </option>
          ))}
        </select>

        <select
          className="history-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Status filter"
        >
          {STATUS_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {filtersActive && (
          <button className="history-clear-filters" onClick={clearFilters}>
            <X size={14} /> Clear filters
          </button>
        )}

        <button className="add-user-btn accounts-add-inline" onClick={onAddUser}>
          Add a New User
        </button>
      </div>

      <AccountsTable
        users={filtered}
        onEdit={onEdit}
        onResetMfa={onResetMfa}
        sortField={sortField}
        sortDir={sortDir}
        onSort={onSort}
        emptyMessage={
          filtersActive
            ? "No accounts match the selected filters."
            : "No accounts found."
        }
        footer={footer}
      />
    </div>
  );
};

export default AccountsPanel;
