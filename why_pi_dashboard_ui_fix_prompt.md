# Why-PI Dashboard UI Fix Prompt

## Purpose

This document contains a complete AI prompt for improving the **Why-PI? Dashboard** layout, chart color consistency, network selector/filter behavior, duplicate SSID handling, previous scan status behavior, and interactive metric cards.

Use this prompt in Cursor, GitHub Copilot Chat, Claude Code, ChatGPT, or another coding AI assistant.

---

## Main Problems to Fix

### 1. Summary Page Whitespace

The **Summary view** currently has a large unused whitespace beside the **Networks by Encryption** chart. The dashboard should maximize available screen space without adding unrelated filler cards.

The preferred fix is to expand or reposition the existing **Networks by Encryption** card instead of adding a new unrelated metric.

### 2. Risk/Severity Color Inconsistency

The colors for **Low**, **Medium**, **High**, and **Critical** risk appear inconsistent across charts, legends, badges, and cards.

For example, a **71% High Risk** score appears with an orange-like donut segment, which visually looks closer to Medium Risk. The dashboard should use one centralized color system.

### 3. Previous Scan Status Red Outline

The **Status as of previous scan** card currently shows a red outline. This appears to be hardcoded or incorrectly triggered.

The red outline should only appear when the previous scan status represents a real warning, degraded state, or stale scan condition.

### 4. Network Selector Needs Improvement

The current network selector is a simple dropdown and contains many repeated SSID names. This makes the selector hard to use and less modern.

The selector should be upgraded into a searchable combobox/filter with grouped duplicate SSIDs and useful network metadata.

### 5. Interactive Metric Cards

Dashboard cards and metrics should be interactive. When users click a metric, chart, or meaningful table row, they should see corresponding detail data through a modal, drawer, or expandable panel.

---

# Copy-Paste AI Prompt

```text
Act as a senior AI engineer, frontend engineer, UI/UX engineer, dashboard systems designer, and prompt-driven code reviewer.

I need you to inspect and improve the Dashboard page of our Why-PI? web dashboard. The dashboard has two main modes:

1. Summary view
2. Specified-network view

The current UI has several issues that need to be fixed carefully without rewriting unrelated parts of the system.

Main issues to fix:

1. Dashboard layout issue in Summary view
- The "Networks by Encryption" chart currently leaves large unused whitespace beside it.
- Do not add an unrelated card beside it just to fill the space.
- The dashboard metrics are already interrelated, so adding another separate metric card may create redundancy.
- Instead, improve the layout by expanding, repositioning, or restructuring the existing card.
- Prefer making "Networks by Encryption" a full-width card with a better internal layout:
  - Left side: donut chart
  - Right side: legend, counts, percentages, and short explanation based only on the same encryption data.

2. Risk/severity color inconsistency
- Check all colors assigned to risk/severity levels across the code.
- The colors used in charts, legends, badges, dots, tables, and cards should be unified.
- The current chart color appears incorrect because a High Risk score, such as 71%, is visually shown using an orange-like segment, which looks more like Medium Risk.
- Create a centralized severity/risk color mapping instead of hardcoding different colors in different components.

Use this unified risk color standard unless the project already has a better existing standard:

- None: Green
- Low: Yellow
- Medium: Orange
- High: Red
- Critical: Dark Red

Suggested mapping:

const RISK_COLORS = {
  none: "#22c55e",      // green
  low: "#facc15",       // yellow
  medium: "#fb923c",    // orange
  high: "#ef4444",      // red
  critical: "#b91c1c",  // dark red
};

Important:
- Apply the same color logic to:
  - Network Risk Score donut chart
  - Wi-Fi Security Risk Score chart
  - Severity by Kind chart
  - Severity by Rating chart
  - Top High-Risk Issues badges/dots
  - Table severity labels
  - Legend for Score
  - Any risk percentage visual indicator
- Do not allow High Risk and Medium Risk to share visually similar colors.
- The chart color must correspond to the actual risk label.

3. Risk score legend behavior
- The "Network Risk Score" card has an expandable legend.
- Make sure the legend uses the same centralized risk color mapping.
- The score ranges should remain consistent:
  - None: 0%
  - Low: 1–39%
  - Medium: 40–69%
  - High: 70–89%
  - Critical: 90–100%
- If these thresholds are already defined elsewhere, reuse the existing source of truth.
- Do not duplicate threshold logic across components.

4. "Status as of previous scan" red outline issue
- The red outline currently appears to be permanently displayed or incorrectly triggered.
- The red border should not be hardcoded.
- It should only appear when the previous scan status indicates a meaningful warning or degraded condition.

Suggested status logic:
- If there is no previous scan, show neutral/default styling.
- If the previous scan is older than the configured stale threshold, show warning.
- If the current risk score increased compared with the previous scan by a meaningful threshold, show warning.
- If encryption/security posture became weaker, show warning.
- If new High or Critical vulnerabilities/threats appeared since the previous scan, show warning.
- Otherwise, show normal/default styling.

Implementation requirement:
- Replace any hardcoded red border class with a clear conditional variable, such as:
  - isPreviousScanWarning
  - hasPreviousScanDegraded
  - isPreviousScanStale
- The red dot should use the same condition.
- If the condition is false, use the default card border.

5. Network selection dropdown is not modern enough
- The current network selector is a simple dropdown/select.
- It contains many repeated SSID names, likely because Supabase records include multiple AP records with the same SSID.
- Replace or improve the network selector into a modern searchable filter/combobox.

Suggested design:
- Use a searchable combobox instead of a plain select.
- The user should be able to search by:
  - SSID
  - BSSID/MAC address
  - encryption type
  - risk level
  - channel, if available
- Show useful network metadata inside each option, for example:
  - SSID as primary text
  - BSSID or AP count as secondary text
  - encryption badge
  - risk percentage or risk badge
- Avoid showing many identical-looking duplicate names without context.

Important duplicate handling:
- Do not simply remove duplicates by SSID without checking the data model.
- Multiple records with the same SSID may represent different APs/BSSIDs.
- Group repeated SSIDs visually when appropriate.
- Suggested behavior:
  - If multiple records share the same SSID, show one grouped SSID entry.
  - Inside or beside that entry, show the number of APs/BSSIDs, such as "4 APs".
  - If the user expands or selects the group, allow choosing a specific BSSID/AP if needed.
- If the dashboard logic only supports selecting one network record, display options as:
  - SSID — BSSID suffix — Channel — Risk

Example:
- MPC_Guest · 4 APs
- MPC_Guest · A1:B2:C3 · CH 6 · High Risk

Recommended filter UI:
- Replace the NETWORK select with a compact searchable combobox.
- Add optional filter chips or dropdown filters for:
  - All networks
  - Open
  - Encrypted
  - Low/Medium/High/Critical risk
  - With vulnerabilities
  - With detected threats
- Keep it simple and not cluttered.
- The best default suggestion is:
  - A searchable network combobox with grouped duplicate SSIDs and small metadata badges.
  - Optional filter chips only if the existing data supports them cleanly.

6. Interactive metric cards and charts
- Make dashboard cards and metrics interactive.
- When the user clicks a metric card, chart card, or table row, show a detail view using actual corresponding data.
- Do not use fake placeholder data.
- If detailed data is unavailable, show a clear empty state such as:
  - "No detailed records available for this metric."
- The interaction should feel useful, not decorative.

Suggested behavior:
- Clicking "Open Networks" opens a modal/drawer/table showing open networks.
- Clicking "Encrypted Networks" opens encrypted networks with encryption type details.
- Clicking "Total Vulnerabilities/Threats" opens grouped findings by severity and type.
- Clicking "Total Clients" opens client distribution by network if client records are available.
- Clicking "Wi-Fi Security Risk Score" opens the risk breakdown and scoring factors.
- Clicking "Severity by Kind" opens the vulnerabilities/threats grouped by severity.
- Clicking "Top 5 High-Risk Networks" row opens that network’s detailed dashboard view.
- Clicking "Networks by Encryption" opens or expands the encryption distribution details.
- Clicking "Top High-Risk Issues" opens finding details for that issue.

Preferred interaction pattern:
- Use a modal, drawer, or expandable card panel.
- Choose the pattern already used in the project if one exists.
- For desktop dashboards, a right-side drawer is preferred because it preserves dashboard context.
- For smaller screens, use a full-screen modal or stacked detail panel.

Implementation requirements for interactivity:
1. Use actual data from existing Supabase queries, API responses, or local state.
2. Avoid creating fake or mock values in production UI.
3. Add loading, empty, and error states for detail panels.
4. Use accessible buttons or clickable cards with keyboard support.
5. Add clear hover/focus states so users know cards are interactive.
6. Do not make every visual element clickable if it has no meaningful detail.
7. Keep the UI clean and avoid overloading the page.

7. Code organization requirements
- Find the Dashboard page/component and all related card, chart, selector, and utility files.
- Identify whether the project uses Tailwind, CSS modules, styled-components, shadcn/ui, Recharts, Chart.js, or another charting system.
- Centralize repeated logic:
  - risk thresholds
  - risk labels
  - risk colors
  - severity colors
  - score-to-risk helper
  - network grouping/deduplication helper
- Do not scatter color constants or threshold logic across multiple files.
- Prefer helpers like:

export const RISK_THRESHOLDS = [
  { key: "none", label: "None", min: 0, max: 0 },
  { key: "low", label: "Low", min: 1, max: 39 },
  { key: "medium", label: "Medium", min: 40, max: 69 },
  { key: "high", label: "High", min: 70, max: 89 },
  { key: "critical", label: "Critical", min: 90, max: 100 },
];

export const RISK_COLORS = {
  none: "#22c55e",
  low: "#facc15",
  medium: "#fb923c",
  high: "#ef4444",
  critical: "#b91c1c",
};

export function getRiskLevel(score: number) {
  if (score === 0) return "none";
  if (score <= 39) return "low";
  if (score <= 69) return "medium";
  if (score <= 89) return "high";
  return "critical";
}

8. Data cleanup and Supabase duplicate handling
- Investigate why duplicate SSID names appear in the network list.
- Check whether duplicates represent:
  - repeated scan history records,
  - multiple BSSIDs under the same SSID,
  - duplicated Supabase rows,
  - or repeated records from different scan sessions.
- Do not delete data unless explicitly instructed.
- For UI display, normalize/group the data safely.
- Recommended grouping key:
  - For unique APs: use BSSID if available.
  - For grouped networks: group by SSID, but preserve BSSID-level details.
  - For scan-specific records: include scan ID or scan timestamp in the grouping logic.
- If the same SSID appears across multiple scans, the network filter should prefer the latest scan by default unless the Date filter says otherwise.

9. Responsiveness and visual polish
- The dashboard should look clean on wide desktop screens, tablet screens, and mobile screens.
- The expanded detail views should not overflow the viewport.
- The network combobox dropdown should have a max height, smooth scrolling, good contrast, and readable option states.
- Avoid native browser select styling if it looks outdated.
- The UI should remain consistent with the current dark theme.

Acceptance criteria:
- The Summary page no longer has large unused whitespace beside "Networks by Encryption."
- "Networks by Encryption" uses the available width cleanly without introducing unrelated filler cards.
- Risk and severity colors are consistent across all charts, legends, badges, and tables.
- A High Risk score uses the High Risk color, not the Medium Risk color.
- The score legend and charts use the same threshold and color source of truth.
- The "Status as of previous scan" red outline is conditional and data-driven.
- The network selector is replaced or upgraded into a modern searchable combobox/filter.
- Duplicate SSIDs are handled cleanly without losing BSSID-level meaning.
- Dashboard cards and meaningful chart/table elements are interactive.
- Clicking a metric opens a useful detail view based on actual data.
- Empty detail states are handled gracefully.
- No fake production data is added.
- No unrelated backend or UI behavior is changed.
- Code remains maintainable, readable, and aligned with existing project conventions.

Before editing, briefly report:
1. Which files/components control the Dashboard layout.
2. Where the current color mappings are defined or hardcoded.
3. What caused the chart color inconsistency.
4. What caused duplicate network names in the selector.
5. Which UI component will be used for the modern network combobox/filter.
6. Which interaction pattern will be used for clickable metric details: modal, drawer, or expandable panel.
7. Where the previous scan red outline logic is currently applied.

After editing, report:
1. Changed files.
2. New centralized risk/severity color and threshold logic.
3. Dashboard layout changes.
4. Network selector/filter changes.
5. Duplicate SSID grouping logic.
6. Interactive card/modal/drawer behavior.
7. Exact condition used for the previous scan warning outline.
8. Any assumptions made because of missing data.
```

---

# Recommended Network Selector Design

The strongest recommendation is to use a **searchable combobox with grouped SSIDs**.

Instead of showing repeated SSID names like this:

```text
MPC_Guest
MPC_Guest
MPC_Guest
MPC_Guest
```

Show a grouped and meaningful entry:

```text
MPC_Guest · 4 APs · WPA2 · Medium Risk
```

Then, when selected or expanded, show the individual BSSID/AP records.

This is better than simply removing duplicates because repeated SSIDs may represent separate access points, not necessarily database errors.

---

# Recommended Risk Color Standard

Use one centralized source of truth for all risk colors.

```ts
export const RISK_COLORS = {
  none: "#22c55e",      // Green
  low: "#facc15",       // Yellow
  medium: "#fb923c",    // Orange
  high: "#ef4444",      // Red
  critical: "#b91c1c",  // Dark Red
};
```

Recommended thresholds:

```ts
export const RISK_THRESHOLDS = [
  { key: "none", label: "None", min: 0, max: 0 },
  { key: "low", label: "Low", min: 1, max: 39 },
  { key: "medium", label: "Medium", min: 40, max: 69 },
  { key: "high", label: "High", min: 70, max: 89 },
  { key: "critical", label: "Critical", min: 90, max: 100 },
];
```

Risk helper:

```ts
export function getRiskLevel(score: number) {
  if (score === 0) return "none";
  if (score <= 39) return "low";
  if (score <= 69) return "medium";
  if (score <= 89) return "high";
  return "critical";
}
```

---

# Recommended Summary Page Layout

## Top Metric Row

- Last Scan
- Open Networks
- Encrypted Networks
- Total Vulnerabilities/Threats
- Total Clients

## Main Dashboard Row

- Wi-Fi Security Risk Score
- Severity by Kind
- Top 5 High-Risk Networks

## Bottom Dashboard Row

- Networks by Encryption as a full-width card

Inside the full-width **Networks by Encryption** card:

- Left side: donut chart
- Right side: legend, counts, percentages, and short interpretation based only on encryption data

This keeps the dashboard cohesive and avoids adding unrelated filler cards.

---

# Recommended Interactive Card Behavior

Use a **right-side drawer** for desktop and a **full-screen modal or stacked panel** for smaller screens.

Suggested interactions:

| Clicked Element | Expected Detail View |
|---|---|
| Open Networks | List of open networks |
| Encrypted Networks | List of encrypted networks and encryption types |
| Total Vulnerabilities/Threats | Findings grouped by type and severity |
| Total Clients | Client distribution by network, if available |
| Wi-Fi Security Risk Score | Risk breakdown and scoring factors |
| Severity by Kind | Vulnerabilities/threats grouped by severity |
| Top 5 High-Risk Networks row | Selected network detail dashboard |
| Networks by Encryption | Encryption distribution details |
| Top High-Risk Issues | Finding details for that issue |

Do not use fake data. If no detailed records are available, show a clear empty state:

```text
No detailed records available for this metric.
```

---

# Previous Scan Status Logic

The red outline and red dot should only appear when the status is actually warning-worthy.

Recommended logic:

- No previous scan: neutral/default styling
- Previous scan older than stale threshold: warning
- Current risk score increased compared with previous scan: warning
- Security posture became weaker: warning
- New High or Critical vulnerabilities/threats appeared: warning
- Otherwise: normal/default styling

Suggested variable names:

```ts
const isPreviousScanWarning = getPreviousScanStatus(currentScan, previousScan) !== "normal";
```

Suggested status function:

```ts
function getPreviousScanStatus(currentScan, previousScan) {
  if (!previousScan) return "normal";

  const isStale = checkIfPreviousScanIsStale(previousScan);
  const riskIncreased = currentScan.riskScore > previousScan.riskScore;
  const hasNewHighOrCriticalFindings = checkForNewHighOrCriticalFindings(currentScan, previousScan);
  const postureWeakened = checkIfSecurityPostureWeakened(currentScan, previousScan);

  if (isStale || riskIncreased || hasNewHighOrCriticalFindings || postureWeakened) {
    return "warning";
  }

  return "normal";
}
```

---

# Final Acceptance Checklist

- [ ] Summary page no longer has large unused whitespace beside **Networks by Encryption**.
- [ ] **Networks by Encryption** uses available width cleanly.
- [ ] No unrelated filler card is added.
- [ ] Risk colors are centralized.
- [ ] High Risk uses red, not orange.
- [ ] Medium Risk uses orange.
- [ ] Critical Risk uses dark red.
- [ ] Score legend uses the same risk thresholds and colors as the charts.
- [ ] Previous scan red outline is conditional, not hardcoded.
- [ ] Network selector is upgraded to a searchable combobox/filter.
- [ ] Duplicate SSIDs are grouped or clarified using BSSID/AP metadata.
- [ ] Metric cards and useful chart/table elements are interactive.
- [ ] Interactive detail views use actual data only.
- [ ] Empty states are handled clearly.
- [ ] No unrelated backend/UI behavior is changed.
- [ ] Code remains readable, maintainable, and consistent with existing project conventions.
