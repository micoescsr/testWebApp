# Frontend Security Headers — ZAP Remediation (2026-06-13)

## Source

ZAP scan (`ZAP-Security-Report.md`) against `http://localhost:5173/` (Vite dev server) found 3 missing-header alerts:

| Alert | Risk | Plugin ID | Instances |
|---|---|---|---|
| Content Security Policy (CSP) Header Not Set | Medium | 10038 | 3 |
| Missing Anti-clickjacking Header | Medium | 10020 | 3 |
| X-Content-Type-Options Header Missing | Low | 10021 | Systemic |

## Root cause

The backend (`backend/server.js`) already sets `helmet` + CSP (Phase 1-C, `SECURITY_HARDENING_PLAN.md`), which covers `X-Content-Type-Options: nosniff` and frame protection by default. The ZAP scan hit port **5173** directly — the Vite dev server — which had no header config at all, so every response (`/`, `/robots.txt`, `/sitemap.xml`, `/src/main.jsx`, `/vite.svg`) came back bare. No backend changes were needed.

## Fix

Headers added across all three ways the frontend is served:

### 1. `vite.config.js` — `server.headers` (dev, port 5173)

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://localhost:* wss://localhost:* https://*.supabase.co; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
```

`'unsafe-eval'` + `'unsafe-inline'` (script-src) and `ws://localhost:*` (connect-src) are required for Vite HMR / React Fast Refresh and are **dev-only**.

### 2. `vite.config.js` — `preview.headers` (`vite preview`, built bundle)

Same as dev but without eval (no HMR in a built bundle):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
```

### 3. `public/serve.json` (new) — `npm start` → `serve -s dist` (Railway prod)

Same header set as `preview.headers`. `serve` (already a dependency) auto-reads `serve.json` from the directory it serves; Vite copies `public/*` into `dist/` on build, so this lands at `dist/serve.json` with no `start` script change.

> **Railway note:** Railway deployment is currently paused and this ZAP scan is local-only. The `https://*.up.railway.app` wildcard in `connect-src` is a best guess for `VITE_API_BASE_URL` — verify against the real backend domain once Railway resumes and adjust if it differs.

`frame-ancestors 'none'` (CSP) + `X-Frame-Options: DENY` are both set per ZAP's "alternatively" guidance for the anti-clickjacking alert (defense in depth).

## Re-verification

```bash
npm run dev
curl -sI http://localhost:5173/
curl -sI http://localhost:5173/robots.txt
```

Confirm `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` are present on both. Then exercise the app in a browser (login, API calls, Supabase auth flows) and check the console for CSP violations.

For the prod path:

```bash
npm run build && npm run preview
curl -sI http://localhost:4173/
```

Confirm `dist/serve.json` exists after `npm run build`.

Finally, re-run the ZAP scan against `:5173` (or `:4173`) and confirm alerts 10038, 10020, 10021 no longer appear.

## Rescan (2026-06-13, port 5174)

Re-scan confirmed alerts **10038, 10020, 10021 are gone**. It surfaced 4 new Medium CSP-quality alerts (Plugin 10055), all on the CSP we just introduced — these couldn't fire while no CSP existed at all:

| Alert | Status |
|---|---|
| CSP: Failure to Define Directive with No Fallback (`form-action`/`base-uri`) | **Fixed** — added `base-uri 'self'; form-action 'self'; object-src 'none'` to `server.headers`, `preview.headers`, and `public/serve.json`. Zero behavior change (app doesn't use `<base>`, cross-origin form posts, or plugin objects). |
| CSP: script-src unsafe-eval | **Accepted risk, dev-only** — required for Vite HMR / React Fast Refresh. Only present in `server.headers` (dev, localhost). `preview.headers` / `serve.json` (`script-src 'self'`) do not have this. |
| CSP: script-src unsafe-inline | **Accepted risk, dev-only** — same reason as above, dev-only. |
| CSP: style-src unsafe-inline | **Accepted risk, dev + prod** — required for inline `style={{}}` attributes used throughout the React app (incl. recharts). Removing requires a nonce/hash-based CSP rewrite of all inline styles — out of scope for this remediation. |

Net result: 3/7 alerts fully resolved by header config alone; 1/7 resolved via added directives; 3/7 are documented accepted risks inherent to the dev tooling / inline-style usage, not exploitable beyond what CSP already restricts (`default-src 'self'`, `connect-src` allowlist, `frame-ancestors 'none'`).

## Update (2026-06-25): retest prod build + style-src split

The earlier "accepted risk" alerts were re-examined. Two corrections:

1. **`script-src` alerts are dev-only.** ZAP had scanned port 5173 (Vite dev). The production
   policies (`preview.headers`, `serve.json`, Helmet) already use `script-src 'self'` — no
   `unsafe-eval`/`unsafe-inline`. **Retest against the prod build (`npm run preview`, :4173)**
   and both `script-src` alerts disappear with no code change.

2. **`style-src unsafe-inline` narrowed via directive split.** In the three production policies
   only, `style-src 'self' 'unsafe-inline'` became:

   ```
   style-src 'self'; style-src-elem 'self'; style-src-attr 'unsafe-inline'
   ```

   `unsafe-inline` is now confined to **style attributes** (React `style={{}}` + recharts SVG
   `style=`), which cannot be nonced/hashed. Element-level styles (`<style>`, `<link>`) get no
   inline allowance. Verified safe: the app injects no runtime `<style>` (CSS = same-origin
   `<link>`; recharts uses the CSP-exempt CSSOM `.style` API). Headless load of :4173 → React
   mounted, 0 CSP violations.

   Dev policy (`server.headers`) unchanged — Vite HMR injects `<style>` blocks and needs
   `style-src 'unsafe-inline'`; dev is not the prod scan target.

**Remaining uncertainty:** whether ZAP's plugin 10055 still raises a `style-src-attr
unsafe-inline` alert is ZAP-version-dependent. If it does, the broad `style-src unsafe-inline`
Medium is still cleared, but full 0/0/0 requires the inline-style refactor (Option 2): migrate
~102 prod `style={{}}` usages across 13 files to CSS classes/modules and wrap recharts so it
emits no `style=` attributes — large surface, recharts is the hard blocker.
