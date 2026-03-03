# src/layouts — Layout Components

## Sidebar.jsx

### Threat Detection Indicator (added)

The sidebar now reads global threat-detection state from `ThreatDetectionContext` (read-only — it does **not** start any polling).

A visual indicator is rendered next to the **Security Assessment Management** nav item:

| Detection Status   | Visual                     | Tooltip                                 |
| ------------------ | -------------------------- | --------------------------------------- |
| `DETECTING`        | Green dot + optional badge | `Monitoring: <SSID> • Updated <Xs ago>` |
| `SCANNING`         | Pulsing blue dot           | `Starting threat detection…`            |
| `FAILED`           | Red dot                    | `Detection failed • <reason>`           |
| `IDLE` / `STOPPED` | Hidden (no indicator)      | —                                       |

**Badge:** Shown only when `displayThreats.length > 0`. Displays the count of detected threat types.

**Tooltip:** Uses the native `title` attribute (no new dependencies).

### New CSS classes (Sidebar.css)

| Class                      | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `.nav-indicator`           | Flex container for dot + badge, pushed to right via `margin-left: auto` |
| `.nav-dot`                 | 8×8 px circle base                                                      |
| `.nav-dot.running`         | Green (`#10b981`)                                                       |
| `.nav-dot.pulsing`         | Blue (`#3b82f6`) with pulse animation                                   |
| `.nav-dot.failed`          | Red (`#ef4444`)                                                         |
| `.nav-badge`               | Red pill-shaped badge with white text                                   |
| `@keyframes sidebar-pulse` | Opacity pulse animation (1.2 s cycle)                                   |

Both desktop sidebar and mobile drawer nav items include the indicator.
