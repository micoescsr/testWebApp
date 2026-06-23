# Why-PII? Design System

An Enterprise Cybersecurity Dashboard design system for **Why-PII?**, a Wi-Fi
Security Assessment platform. A Raspberry Pi sensor scans nearby Wi-Fi networks;
the web console visualizes the resulting **threats** (Evil Twin, Deauthentication
Flood, MAC Spoofing) and **vulnerabilities** (open SSIDs, WPS enabled, weak
crypto, PMF disabled), scored and triaged by severity in a SOC-console UI.

The visual language is a **Security Operations Center (SOC) aesthetic**:
dark-first, compact, high information density, token-driven, severity-centric.
It draws inspiration from Microsoft Defender, CrowdStrike Falcon, Splunk, and
Datadog Security while staying clean, responsive, and WCAG-compliant.

## Sources

This system was reverse-engineered from the product codebase. Explore these to
build higher-fidelity designs:

- **Codebase** (attached, read-only): `src/` — a Vite + React app. Key files:
  `src/styles/tokens.css` (the original token source of truth), `src/layouts/Sidebar.*`,
  `src/pages/{Dashboard,SAM,Login}/`, `src/components/common/*` (SeverityBadge, Tabs,
  Toast, Modal, Pagination, EmptyState, Spinner), `src/data/*` (mock threats / dashboard
  data). The design system here mirrors those tokens and components 1:1.
- **GitHub**: https://github.com/micoescsr/testWebApp — the same web application.
  Browse it for the full component implementations, routing, and API layer behind
  these recreations.

There is no Figma file and no slide deck for this product.

---

## CONTENT FUNDAMENTALS

**Voice — technical, precise, operator-facing.** Copy is written for a security
analyst at a console, not a consumer. It is terse, factual, and free of marketing
language. Findings are named with their canonical identifier (`WFVT-006`,
`Evil Twin`) and a CVSS-style score.

- **Casing:** Title Case for page/section titles ("Security Assessment Management",
  "Wi-Fi Security Risk Score", "Top High-Risk Networks"). Table column headers are
  **UPPERCASE** ("SEVERITY", "FINDING", "DETECTED TIME", "SCORE"). Severity labels
  are always UPPERCASE ("CRITICAL", "HIGH"). Form field labels are UPPERCASE with
  letter-spacing.
- **Person:** Mostly impersonal / system-voice ("Monitoring in progress. No threats
  detected yet.", "Detection failed. Run a new scan to restart."). Occasionally
  second person in instructions ("Connect to a Wi-Fi network to start detecting
  threats.", "Select a network first").
- **Status language:** lifecycle words are consistent and short — *Monitoring*,
  *Starting…*, *Paused — out of range*, *Failed*, *Online ✓*. Relative time is
  abbreviated ("Updated 12s ago").
- **Numbers & identifiers:** technical values (BSSIDs, channels, CVSS, finding IDs,
  timestamps) are always rendered in the **monospace** stack. SSIDs read like real
  captured names ("Nacho_WiFi", "Kerbs_FreeWiFi", "StarboxFreeWiFi").
- **Emoji:** essentially none in product chrome. The lone exceptions are a check mark
  in "Online ✓" and the success/error glyphs inside toasts (which are really icons).
  Do **not** introduce decorative emoji.
- **Tone of empty/error states:** matter-of-fact and instructive, never cute. They
  tell the operator what happened and what to do next.

Example strings (verbatim from the product):
> "Monitoring: Nacho_WiFi" · "Starting…" · "Paused — out of range"
> "Nothing to analyze. Connect to a Wi-Fi network to start detecting threats."
> "Detection failed: {reason}. Run a new scan to restart."
> "Network saved to DB!" · "Scan failed"

---

## VISUAL FOUNDATIONS

**Theme.** Dark-first. The default `[data-theme="dark"]` is the SOC console; a
`[data-theme="light"]` toggle exists with AA-adjusted severity colors. Switch by
setting `data-theme` on `<html>`.

**Color.**
- *Surfaces* are an **off-black ramp, never pure `#000`**: `surface-0 #0b0e14`
  (app bg) → `surface-1 #131722` (panels/cards) → `surface-2 #1b2130`
  (rows/hover) → `surface-3 #232b3b` (popovers). Borders `#2a3242` / `#3a4458`.
- *Text* ramp: `#e6e9ef` primary → `#aab2c0` secondary → `#7a8494` muted.
- *Accent* is **cyan/teal `#06b6d4`** — deliberately distinct from both the
  severity scale and the info-blue, so interactive affordances never read as a
  severity. `accent-soft` (cyan @14%) backs active nav items.
- *Severity scale* is the product's core signal and the single source of truth:
  **CRITICAL red `#ff4d4f` · HIGH orange `#ff8c1a` · MEDIUM amber `#facc15` ·
  LOW green `#22c55e` · INFO blue `#3b82f6` · NONE grey `#9aa4b2`**. Each level is
  a foreground (text/icon) over a 16%-tinted background fill.
- The **login screen is the one warm-to-cool gradient moment**: a deep navy→blue
  diagonal (`#020617 → #0044cc`) with soft radial glows and a white card — a
  marketing-grade entry that contrasts the utilitarian console behind it. The app
  mark is a blue→indigo (`#2f7df6 → #6366f1`) rounded square. This gradient is
  **only** used on login; do not spread it into the console.

**Type.** System UI sans for chrome (`system-ui, -apple-system, "Segoe UI", Roboto…`),
monospace for all technical values. No custom webfonts — keep it OS-native. Scale is
compact (12 → 36px); body/table text is 14px, table headers 13px, chips/meta 12px.
Weights 400/500/600/700; titles are 600–700.

**Spacing & density.** 4px base unit. Density is deliberately tight — table rows use
a 7px vertical pad (`--row-pad-y`), the SOC signature. Sidebar is a fixed 186px rail.

**Shape / radius.** One radius system: `sm 4px` (chips/small controls), `md 6px`
(inputs/buttons), `lg 10px` (cards/panels/modals), `pill 999px` (tabs, filter chips,
status pills, badges-as-pills). Cards are `surface-1` + 1px hairline border +
`radius-lg` + `shadow-sm` — **flat with a hairline, not heavily rounded or floating**.

**Elevation.** Dark theme uses deep, soft black shadows: `sm` resting cards, `md`
toasts/menus, `lg` modals/drawers. Modals dim the backdrop with `rgba(0,0,0,0.45)`.

**Borders.** Hairline 1px borders everywhere (`--border`) define structure far more
than shadow does — panels, table rows, sidebar rail, inputs. Active nav items add a
3px left accent border.

**Backgrounds.** Flat solid surfaces. **No imagery, no patterns, no texture** in the
console. The only gradient/blur in the system is the login backdrop and a subtle
`backdrop-filter: blur(8px)` translucent topbar. No full-bleed photography.

**Animation.** Restrained and fast. Transitions are ~0.15–0.2s ease on hover/color.
Named motifs: a **pulsing dot** for "Starting…" status (`pill-pulse`, opacity 1↔0.3),
a **spinner** (0.7s linear), a toast **slide-in** (0.15s), the login card **slide-up**
(0.5s). No bounces, no parallax, no infinite decorative loops.

**Hover / press.**
- Buttons: primary darkens to `accent-hover` on hover; secondary steps up a surface
  level; ghost gains a `surface-2` fill; danger fills solid red.
- Table rows / nav items / list items: background lifts to `surface-2` on hover.
- Links: `accent → accent-hover`.
- No scale-down press effect in the console (the login button is the exception — it
  nudges 1px on press).

**Focus.** Always visible, token-driven: `2px solid var(--focus-ring)` (cyan) with a
2px offset. Never removed.

**Transparency / blur.** Used sparingly: modal/drawer backdrops, the translucent
blurred topbar, and the 14–16% tints behind severity/accent fills. Surfaces
themselves are opaque.

**Iconography color.** Nav icons are tinted to `text-secondary` (or `accent` when
active); severity glyphs take their level's `-fg` color. Imagery is otherwise absent,
so color comes entirely from the token palette — cool, technical, high-contrast.

---

## ICONOGRAPHY

The product uses **[Phosphor Icons](https://phosphoricons.com/)** exclusively
(`@phosphor-icons/react` in the codebase). Two weights carry meaning:

- **Duotone** for navigation and brand (`squares-four`, `shield-check`,
  `device-mobile`, `folder-user`, `clock-counter-clockwise`, `user-circle`,
  `sign-out`, `globe-hemisphere-west`).
- **Fill** for signal/severity glyphs inside badges and toasts
  (`warning`, `warning-diamond`, `warning-circle`, `check-circle`, `info`,
  `minus-circle`).
- **Regular** for inline/table affordances (`magnifying-glass`, `x`, `caret-down`,
  `arrow-clockwise`, `radar`).

There are **no PNG/SVG brand image assets and no logo file** — the brand is the
text wordmark **"Why-PII?"** plus the gradient app-mark (a Phosphor globe in a
blue→indigo rounded square). No icon sprite is bundled.

**How to use Phosphor in designs from this system:** load the icon **web font** from
CDN (it keeps the design-system components npm-free and works in plain HTML):

```html
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/duotone/style.css">
<!-- usage -->
<i class="ph-duotone ph-shield-check"></i>
<i class="ph-fill ph-warning"></i>
<i class="ph ph-magnifying-glass"></i>
```

Components like `SeverityBadge`, `Button`, `Input`, `Modal` render Phosphor `<i>`
glyphs, so any page that mounts them must include these stylesheets. Emoji and
Unicode characters are **not** used as icons (the `✓` in "Online ✓" is the only
glyph-as-text exception). Do not hand-roll SVG icons — use Phosphor names.

---

## INDEX — what's in this system

**Root**
- `styles.css` — global entry point (consumers link this). `@import` manifest only.
- `tokens/` — `typography.css`, `spacing.css`, `colors.css`, `severity.css`,
  `elevation.css`, `base.css`. CSS custom properties + element resets.
- `README.md` — this file. `SKILL.md` — Agent Skills front-matter for download.

**Components** (`components/<group>/`, namespace `window.WhyPIIDesignSystem_2ab267`)
- `forms/` — **Button** (primary/secondary/ghost/danger), **Input** (search +
  clearable), **Select**.
- `feedback/` — **SeverityBadge** (the signature component), **StatusPill**
  (monitoring/starting/paused/failed), **Toast**, **Spinner**, **EmptyState**.
- `navigation/` — **Tabs**, **FilterChip**, **Pagination**.
- `surfaces/` — **Panel**, **StatCard**.
- `overlay/` — **Modal**.

Each component has a `.jsx`, a `.d.ts` props contract, a `.prompt.md` usage note,
and a directory `@dsCard` HTML showing its states.

**Foundation cards** (`guidelines/*.card.html`) — the Design System tab specimens:
surfaces, text, accent/status, severity scale, type scale, mono, weights, spacing,
radius, elevation, brand wordmark/app-mark, and Phosphor iconography.

**UI kits** (`ui_kits/`)
- `web_console/` — interactive recreation of the Why-PII? SOC console: **Login →
  Dashboard → Security Assessment (SAM)** with a live theme toggle. See its
  `README.md`. This is also registered as a Starting Point.

**Notes / caveats**
- Charts in the dashboard kit are lightweight inline SVG recreations (the product
  uses Recharts). They match the visual layout, not the library's exact rendering.
- Device Management, Accounts & Audit, Scan History, and Profile exist in the product
  but are intentionally left as placeholders in the kit (not recreated).
