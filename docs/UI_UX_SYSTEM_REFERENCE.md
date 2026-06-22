# UI/UX System Reference

> **Styling:** Vanilla CSS (co-located per component)  
> **Charts:** Recharts 3.6.0 (React) + Plotly.js (PDF reports)  
> **Icons:** Emoji-based (no icon library)  
> **Typography:** System font stack  
> **Last Updated:** 2026-06-22

> MFA mechanics are documented in [`AUTHENTICATION_AND_AUTHORIZATION.md` §11](./AUTHENTICATION_AND_AUTHORIZATION.md#11-multi-factor-authentication-totp).
> This file covers only the current implemented UI patterns for MFA screens.

---

## 1. Design System Overview

### Color Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Primary | Blue | `#2563eb` | Active states, primary buttons, chart accent |
| Primary Variant | Light Blue | `#818cf8` | Chart secondary color |
| Success | Green | `#22c55e`, `#4caf50` | AP enabled, threat cleared, detection running |
| Warning | Orange | `#f97316`, `#ff9800` | High severity, warning states |
| Danger | Red | `#f44336`, `#d32f2f` | Critical severity, errors, AP disabled |
| Background | Dark | `#1a1a2e`, `#16213e` | Sidebar, login page |
| Surface | White/Light | `#ffffff`, `#f5f7fa` | Cards, panels, main content |
| Text Primary | Dark | `#2c3e50`, `#333` | Body text |
| Text Secondary | Gray | `#666`, `#888` | Labels, secondary info |

### Severity Colors

| Severity | Color | CSS Class |
|----------|-------|-----------|
| Critical | Red `#d32f2f` | `.severity-critical` |
| High | Orange `#f57c00` | `.severity-high` |
| Medium | Yellow `#fbc02d` | `.severity-medium` |
| Low | Green `#4caf50` | `.severity-low` |
| None | Green `#4caf50` | `.badge-none` |

### Chart Colors (from `dashboardData.js`)

```javascript
export const COLORS = ["#2563eb", "#f97316", "#22c55e", "#818cf8"];
// 0 = Vulnerabilities (blue), 1 = Threats (orange)
```

---

## 2. Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
  'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

> **Note:** The app uses the system font stack. No custom fonts (e.g., Google Fonts) are loaded.

### Type Scale

| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| Page title (`h1`) | ~1.5-2rem | 600-700 | Page headers |
| Section title (`h2`) | ~1.2-1.5rem | 600 | Section headers |
| Body text | 14-16px | 400 | General content |
| Small text | 12-13px | 400 | Timestamps, metadata |
| Button text | 14-16px | 500-600 | Action buttons |
| Badge text | 12-13px | 600 | Severity badges, status pills |

---

## 3. Layout System

### Global Layout

```css
/* App.css */
.app {
  display: flex;
  min-height: 100vh;
  background: #f5f7fa;
}

.main-content {
  flex: 1;
  padding: 20px;
  padding-top: 80px; /* Space for floating UserMenu */
  overflow-y: auto;
}
```

### Responsive Breakpoints

| Breakpoint | Target |
|------------|--------|
| `≤ 768px` | Mobile layout — sidebar becomes hamburger drawer |
| `≤ 600px` | Compact tables, stacked form groups |

### Sidebar Dimensions

| State | Width |
|-------|-------|
| Desktop | 186px (fixed) |
| Mobile | Full-screen overlay |

---

## 4. Component Styling Patterns

### Card Pattern

```css
.card {
  background: white;
  border-radius: 12px;
  padding: 20-30px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  margin-bottom: 20px;
}
```

### Form Pattern

```css
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #333;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}
```

### Table Pattern

```css
table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #f5f7fa; /* or brand gradient for reports */
}

th, td {
  padding: 10-12px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

tbody tr:hover {
  background: #f7fafc;
}
```

### Severity Badge Pattern

```css
.severity-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85em;
  font-weight: 600;
}
```

---

## 5. Interactive Elements

### Buttons

| Type | Style | Usage |
|------|-------|-------|
| Primary | Blue background, white text | Login, submit, save |
| Secondary | Outlined or gray | Cancel, back |
| Danger | Red background | Deactivate, stop detection |
| Disabled | Reduced opacity | Loading states |

### Detection Status Indicators

| Status | Visual |
|--------|--------|
| IDLE | No indicator |
| SCANNING | Blue pulsing dot |
| DETECTING | Green dot + threat count badge |
| FAILED | Red dot |

### Toast / Notification Pattern

The app uses inline error/success messages rather than toast notifications:

```css
.error-text { color: #d32f2f; }
.success-text { color: #4caf50; }
```

---

## 6. Modal System

### Base Modal

```css
/* BaseModal.css */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
```

### Modal Variants

| Modal | Width | Content |
|-------|-------|---------|
| Login Card | ~400px | Centered card on dark background |
| Profile Reset | ~500px | Password change form |
| Finding Detail | ~700px | Rich vulnerability/threat detail |
| Scan Confirm | ~400px | Confirmation dialog |
| Logout Confirm | ~400px | Warning if detection running |
| Raw Evidence | ~600px | JSON/payload viewer |

---

## 7. Data Visualization

### Recharts (In-App)

| Chart Type | Usage | Location |
|------------|-------|----------|
| Bar Chart | Severity distribution | `SummarySection`, `NetworkSection` |
| Pie/Donut Chart | Threat distribution | `SummarySection`, `NetworkSection` |
| Radial Bar | Risk score gauge | `SummarySection`, `NetworkSection` |
| Legend | Score interpretation | `LegendForScore` |

### Plotly.js (PDF Reports)

| Chart Type | Usage | Location |
|------------|-------|----------|
| Bar Chart | Clients per SSID, risk by SSID, findings by severity | `reportTemplates.js` |
| Line Chart | Risk trend over time | `reportTemplates.js` |
| Grouped Bar | Vulnerabilities vs threats | `reportTemplates.js` |

### Hover Context Pattern

The dashboard implements linked chart highlighting:

```javascript
// When hovering over a chart element:
setHoverContext({ type: "severity", value: "Critical" });

// Other charts respond:
if (hoverContext?.type === "severity") {
  // Highlight matching data
}

// On mouse leave:
clearHoverContext();
```

---

## 8. Page-Specific Layouts

### Login Page

```
┌────────────────────────────────┐
│ Full viewport dark background  │
│                                │
│    ┌──────────────────┐        │
│    │ 🌐 Logo SVG      │        │
│    │                  │        │
│    │ Login to your    │        │
│    │ account          │        │
│    │                  │        │
│    │ [Email input]    │        │
│    │ [Password input] │        │
│    │ Forgot password? │        │
│    │ [Login now]      │        │
│    └──────────────────┘        │
│                                │
└────────────────────────────────┘
```

### Dashboard Page

```
┌───────────────────────────────────┐
│ DashboardHeader                   │
│ [Summary ▼] [Network ▼] [Scan ▼] │
├───────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐          │
│ │Risk     │ │Severity │          │
│ │Score    │ │Chart    │          │
│ │Gauge    │ │         │          │
│ └─────────┘ └─────────┘          │
│ ┌───────────────────────┐        │
│ │Threats / Vulns charts │        │
│ └───────────────────────┘        │
└───────────────────────────────────┘
```

### SAM Page

```
┌─────────────┬──────────────────────┐
│ SAM Sidebar │ VulnerabilitiesTable │
│             │                      │
│ Networks    │ [Filter] [Sort]      │
│ ▸ Net 1    │ ┌──────────────────┐ │
│   Net 2    │ │ ID | Name | Sev  │ │
│   Net 3    │ │ ...              │ │
│             │ └──────────────────┘ │
│ [Scan]      │                      │
│ [Detect]    │ ThreatsTable         │
│             │ ┌──────────────────┐ │
│ Detection   │ │ Threat data      │ │
│ Status      │ └──────────────────┘ │
└─────────────┴──────────────────────┘
```

---

## 8a. MFA UI Patterns

### MFA Setup Page (`/mfa-setup`, `MFASetup.jsx` + `TotpQrDisplay.jsx`)

```
┌────────────────────────────────┐
│ Fullscreen card (no sidebar)   │
│  Set up Two-Factor Auth        │
│                                │
│  ┌──────────────┐              │
│  │  [QR Code]   │              │
│  └──────────────┘              │
│  Can't scan? Reveal secret ▾   │
│  [manual-entry secret + Copy]  │
│                                │
│  [6-digit code input]          │
│  [Verify]                      │
│  (Start over / Retry on error) │
└────────────────────────────────┘
```

- Reuses the fullscreen auth-card visual style (same as Login/ForgotPassword/ResetPassword)
- `mode="forced"`: standalone route, no sidebar, non-dismissible
- `mode="self-service"`: embedded in a Profile-page modal (`onClose` prop), replaces the existing factor on re-enroll

### MFA Challenge (login-time, `MFAChallenge.jsx`)

Rendered in-place on the Login page (not a separate route) when `getAuthenticatorAssuranceLevel()` indicates the account needs `aal2`:

```
┌────────────────────────────────┐
│ Enter your authenticator code  │
│  [6-digit code input]          │
│  (auto-submits at 6 digits)    │
│  Error → auto-retry on expired │
│          challenge              │
└────────────────────────────────┘
```

### Profile Page — Two-Factor Authentication Card

A dedicated card on `/profile` (`Profile.jsx`) showing an "Enabled" badge with a "Re-enroll (new device)" action (opens `MFASetup mode="self-service"` modal), or a setup prompt if somehow not enrolled. No disable option exists anywhere in the UI.

### Accounts Table — Reset MFA Action

Per-row "Reset MFA" action (superadmin only) on `/accounts-audit`, alongside "Edit Details." Opens a confirmation modal before calling the admin-unenroll endpoint.

> Full mechanics: [`AUTHENTICATION_AND_AUTHORIZATION.md` §11](./AUTHENTICATION_AND_AUTHORIZATION.md#11-multi-factor-authentication-totp).

---

## 9. Accessibility

| Feature | Status | Notes |
|---------|:------:|-------|
| Semantic HTML | ✓ | Forms use `<label>`, tables use `<thead>/<tbody>` |
| `aria-label` | Partial | Password toggle buttons have `aria-label` |
| `aria-expanded` | ✓ | UserMenu dropdown |
| Keyboard navigation | ⚠️ | Standard browser behavior; no custom focus management |
| Color contrast | ⚠️ | Not formally tested (severity badges may have issues) |
| Screen reader | ⚠️ | Not explicitly tested |
| Focus trapping (modals) | ⚠️ | Not implemented in BaseModal |
| Skip links | ✗ | Not implemented |

---

## 10. PDF Report Design

The PDF report system (`reportTemplates.js`) generates self-contained HTML documents with:

- **Cover page**: Gradient background (`#667eea → #764ba2`), metadata grid
- **Section cards**: White background, rounded corners, shadow
- **Risk gauge**: Circular element with color-coded score
- **Summary cards**: Gradient cards in responsive grid
- **Severity badges**: Color-coded inline pills
- **Tables**: Branded header (`#667eea`), hover rows
- **Print optimization**: `@media print` rules, `page-break-inside: avoid`

---

## ⚠️ Needs Verification

- **Accessibility audit**: No WCAG compliance testing has been performed
- **Dark mode**: No dark mode support exists in the main app (only login/sidebar use dark backgrounds)
- **Loading skeletons**: The app uses plain "Loading..." text — no skeleton screens
- **Animation library**: No animation library is used; transitions are CSS-only
- **Recharts responsiveness**: Verify that charts resize properly on mobile viewports
