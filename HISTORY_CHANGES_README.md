# History Page — Changelog & Architecture

## Overview

The History module was reconstructed to replace the old **expand/collapse row** interaction with a **right-side Scan Details drawer** and a **Raw Evidence modal**. The top-level Vulnerabilities / Threats tabs remain unchanged.

---

## Recent Changes (Feb 25, 2026)

### Backend API Fixes (`backend/server.js`)

Both `/api/history/vulnerabilities` and `/api/history/threats` endpoints were updated to return complete scan data:

| Field Added      | Source                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `bssid`          | Joined from `networks` table (fallback: `scan_data.bssid`)          |
| `channel`        | Joined from `networks` table (fallback: `scan_data.channel`)        |
| `num_clients`    | Joined from `networks` table (fallback: `scan_data.num_clients`)    |
| `scan_start`     | From `scans` table (fallback: `scan_data.scan_start`)               |
| `scan_end`       | From `scans` table (fallback: `scan_data.scan_end`)                 |
| `details[].id`   | `vt_code` from `vulnerability_threat_details` join                  |
| `details[].severity` | `vt_severity_rating` from `vulnerability_threat_details` join   |
| `details[].status`   | `vt_status` from `vulnerabilities_threat` table                 |
| `details[].value`    | `vt_value` from `vulnerabilities_threat` table                  |

**Previously missing**: These fields were never included in the API response, causing the drawer to display "—" for BSSID, Channel, Scan Start, Scan End, Duration, and Clients Connected.

### Frontend Fixes (`src/components/history/ScanDetailsDrawer.jsx`)

- Added `formatTimestamp(ts)` — converts ISO/epoch timestamps to readable local format
- Added `computeDuration(start, end)` — calculates human-readable duration (e.g., "2m 30s", "1h 15m")
- Changed button label from "View Full JSON" to "View Details"

---

## Files Changed

### Modified

| File                                                   | Summary                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/server.js`                                    | Updated `/api/history/vulnerabilities` and `/api/history/threats` to join with `networks` table for BSSID/channel/num_clients, include scan_start/scan_end, and join with `vulnerability_threat_details` for vt_code/vt_severity_rating/vt_status.                  |
| `src/pages/History/History.jsx`                        | Removed expand/collapse state and `FindingDetailModal` import. Added drawer + raw evidence modal state management. Wires new `ScanDetailsDrawer` and `RawEvidenceModal` components. Top bar layout now includes Tabs, Search, and tab indicator inline.             |
| `src/pages/History/History.css`                        | Added `.history-top-bar` flex layout, `.history-tab-indicator`, `.risk-score-chip` with severity-aligned color variants, `.view-btn` styling, `.history-empty-cell`, and 6-column `.history-table-summary` width rules. Removed unused expand/collapse-only styles. |
| `src/components/history/VulnerabilityHistoryTable.jsx` | Removed all row expansion logic. Table now renders 6 summary columns: Date & Time, Network, Risk Score chip, Vulns count, Threats count, VIEW button. Accepts `onView(scanRow)` callback instead of `onToggleExpand`/`onViewDetail`.                                |
| `src/components/history/ThreatHistoryTable.jsx`        | Same refactor as VulnerabilityHistoryTable — summary rows only with `onView` callback.                                                                                                                                                                              |
| `src/components/history/ScanDetailsDrawer.jsx`         | Added `formatTimestamp()` and `computeDuration()` helpers for KPI display. Changed "View Full JSON" button text to "View Details".                                                                                                                                   |

### Created

| File                                                          | Summary                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/components/history/ScanDetailsDrawer.jsx`                | Right-side fixed drawer with KPI section, internal Vuln/Threat tab switch, and finding cards.      |
| `src/components/history/ScanDetailsDrawer.css`                | Full drawer styling — panel, backdrop, KPIs, tabs, finding cards, responsive.                      |
| `src/components/modals/RawEvidenceModal/RawEvidenceModal.jsx` | Modal for viewing raw scan evidence in Formatted View or JSON View, with Copy JSON + Done buttons. |
| `src/components/modals/RawEvidenceModal/RawEvidenceModal.css` | Modal overlay, tabs, formatted grid, JSON code block, footer buttons, responsive.                  |

---

## Interaction Flow

```
History Table (summary rows)
  └── Click "VIEW" on a scan row
        └── Opens ScanDetailsDrawer (right panel)
              ├── KPIs: Risk Score, Scan Start/End, Duration, Clients
              ├── Tabs: Vulnerabilities | Threats (with count badges)
              └── Finding cards
                    └── Click "View Details"
                          └── Opens RawEvidenceModal (centered overlay)
                                ├── Formatted View (grid of labeled fields)
                                ├── JSON View (pretty-printed code block)
                                └── Copy JSON / Done buttons
```

---

## Key State Changes in `History.jsx`

### Removed

- `expandedRow` — no longer needed (expand/collapse removed)
- `FindingDetailModal` import and usage
- `useThreats` / `useVulnerabilities` hook imports (no longer fetching detail via old modal)

### Added

| State Variable        | Type                          | Purpose                                  |
| --------------------- | ----------------------------- | ---------------------------------------- |
| `drawerOpen`          | `boolean`                     | Controls right drawer visibility         |
| `selectedScan`        | `object \| null`              | The scan row object passed to the drawer |
| `activeDrawerTab`     | `'vuln' \| 'threat'`          | Which tab the drawer opens to            |
| `modalOpen`           | `boolean`                     | Controls raw evidence modal visibility   |
| `selectedFinding`     | `object \| null`              | The finding object shown in the modal    |
| `selectedFindingType` | `'vulnerability' \| 'threat'` | Determines modal title and field mapping |

---

## Summary Table Columns (both tabs)

| Column      | Source                                                                            |
| ----------- | --------------------------------------------------------------------------------- |
| DATE & TIME | `item.datetime` (formatted)                                                       |
| NETWORK     | `item.ssid`                                                                       |
| RISK SCORE  | Computed from max CVSS across `details[]` + `threats[]`; shown as chip with color |
| VULNS       | `item.details.length` (or `item.vulnCount` if provided)                           |
| THREATS     | `item.threats.length` (or `item.threatCount` if provided)                         |
| ACTION      | VIEW button → opens drawer                                                        |

---

## ScanDetailsDrawer Props

| Prop              | Type                      | Description                                                 |
| ----------------- | ------------------------- | ----------------------------------------------------------- |
| `open`            | `boolean`                 | Whether the drawer is visible                               |
| `onClose`         | `() => void`              | Close handler                                               |
| `scan`            | `object`                  | Full scan row from history data                             |
| `initialTab`      | `'vuln' \| 'threat'`      | Which internal drawer tab to show first                     |
| `onOpenJsonModal` | `(finding, type) => void` | Callback when "View Details" is clicked on a finding card   |

### KPI Section

Displays: Overall Risk Score (number + label badge), Scan Start, Scan End, Scan Duration, Clients Connected. Falls back to `"—"` for any missing field.

### Finding Cards

- **Vulnerabilities**: name, WFVT ID, severity chip, CVSS score, status, attribute value
- **Threats**: name, WFVT ID, severity chip, CVSS score, status, occurrences, duration

---

## RawEvidenceModal Props

| Prop          | Type                          | Description                                               |
| ------------- | ----------------------------- | --------------------------------------------------------- |
| `open`        | `boolean`                     | Visibility                                                |
| `onClose`     | `() => void`                  | Close handler                                             |
| `title`       | `string`                      | "Vulnerability Raw Payload" or "Threat Detection Payload" |
| `subtitle`    | `string`                      | e.g. "WFVT-004 — PMF Disabled"                            |
| `finding`     | `object`                      | The finding to display                                    |
| `scanContext` | `object`                      | Scan-level fields (ssid, bssid, channel) for JSON build   |
| `type`        | `'vulnerability' \| 'threat'` | Controls field mapping                                    |

### Raw JSON Construction

- Uses `finding.raw` if present
- Otherwise builds a minimal JSON object from available fields
- WFVT source mapping: `WFVT-004 → findings.mfp`, `WFVT-003 → findings.wps`, `WFVT-002 → findings.encryption`, `WFVT-006 → findings.evil_twin.details`

### Formatted View Fields

**Vulnerabilities**: WFVT ID, Finding, Severity/Score, Status, SSID/BSSID, Channel, Scan Start, Scan End, Aligned Attribute, Halted for Scan

**Threats**: WFVT ID, Threat, Severity/Score, Status, First Seen, Last Seen, Duration, Scan End

---

## Robustness / Edge Cases

| Scenario                             | Behavior                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Empty history list                   | Table shows "No vulnerability/threat scan history found."                                          |
| Scan has no vulns                    | Drawer Vulnerabilities tab shows "No vulnerabilities recorded"                                     |
| Scan has no threats                  | Drawer Threats tab shows "No threats recorded"                                                     |
| Missing BSSID / Channel / scan times | Displays `"—"` — no crashes                                                                        |
| Status = CLEARED                     | Shown with muted gray text (`status-cleared` class)                                                |
| Drawer open                          | Body scroll is locked; drawer scrolls independently with `overscroll-behavior: contain`            |
| Backdrop click                       | Closes drawer; modal overlay click closes modal                                                    |
| Copy JSON                            | Uses `navigator.clipboard.writeText()` with hidden-textarea fallback for insecure contexts         |
| Risk score not provided by API       | Computed as max CVSS score among all findings; label: 0–3 LOW, 4–6 MEDIUM, 7–8 HIGH, 9–10 CRITICAL |

---

## Severity Color Mapping (consistent across all components)

| Level    | Background | Text/Badge |
| -------- | ---------- | ---------- |
| CRITICAL | `#b91c1c`  | white      |
| HIGH     | `#f97316`  | white      |
| MEDIUM   | `#eab308`  | white      |
| LOW      | `#16a34a`  | white      |

Risk score chips in the table use lighter tinted backgrounds with the same hue as text color.
