# Railway Deployment Guide — Dev/Prod Isolation

> **Goal:** Make it physically impossible for a dev deploy to touch prod data (or vice versa).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Railway Project Setup](#railway-project-setup)
3. [Database Separation](#database-separation)
4. [Branch-Based Deployments](#branch-based-deployments)
5. [Environment Variables](#environment-variables)
6. [Startup Safety Checks](#startup-safety-checks)
7. [Migration Safety](#migration-safety)
8. [Frontend Build Configuration](#frontend-build-configuration)
9. [Domain Setup](#domain-setup)
10. [Pre-Deploy Checklist](#pre-deploy-checklist)
11. [Rollback Procedure](#rollback-procedure)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│                                                              │
│   main branch ──────────►  yourapp-prod (Railway Project)    │
│                             ├─ Web Service (Express)         │
│                             ├─ Postgres DB (prod)            │
│                             └─ Env vars: APP_ENV=production  │
│                                                              │
│   develop branch ───────►  yourapp-dev  (Railway Project)    │
│                             ├─ Web Service (Express)         │
│                             ├─ Postgres DB (dev)             │
│                             └─ Env vars: APP_ENV=development │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Every boundary is physically separate — different projects, different databases, different env vars, different domains.

---

## Railway Project Setup

### Step 1: Create two Railway projects

1. Go to [railway.app](https://railway.app) → **New Project**
2. Create project: `yourapp-prod`
3. Create project: `yourapp-dev`

### Step 2: Add services to each project

In **each** project:
1. Click **New** → **GitHub Repo** → select your repo
2. Click **New** → **Database** → **Add PostgreSQL**

### Step 3: Name services clearly

Rename services in Railway dashboard:
- Prod: `PROD - backend`, `PROD - database`
- Dev: `DEV - backend`, `DEV - database`

This prevents "which one am I looking at?" confusion.

---

## Database Separation

### Why two databases?

If dev and prod share a DB, a bad migration or seed script in dev **destroys production data**. Separate DBs make this physically impossible.

### Setup

Each Railway project gets its own Postgres service. Railway auto-generates `DATABASE_URL` per project — they're already isolated.

If using **Supabase** instead of Railway Postgres:
1. Create two Supabase projects: `yourapp-dev`, `yourapp-prod`
2. Use each project's URL/key in the corresponding Railway project env vars
3. **Never** share a Supabase project across environments

### Verification

After setup, confirm isolation:
```bash
# In dev Railway service shell:
echo $SUPABASE_URL
# Should show: https://YOUR_DEV_PROJECT.supabase.co

# In prod Railway service shell:
echo $SUPABASE_URL
# Should show: https://YOUR_PROD_PROJECT.supabase.co
```

---

## Branch-Based Deployments

This is the **single most practical safety rail**.

### Configure in Railway

**Prod project (`yourapp-prod`):**
1. Service → Settings → **Source**
2. Set **Branch**: `main`
3. Enable **Auto Deploy**: Yes (or manual trigger if you want approval friction)

**Dev project (`yourapp-dev`):**
1. Service → Settings → **Source**
2. Set **Branch**: `develop`
3. Enable **Auto Deploy**: Yes

### Git workflow

```bash
# Feature work → develop branch
git checkout develop
git merge feature/my-feature
git push origin develop          # → auto-deploys to dev Railway

# Promote to prod (after testing in dev)
git checkout main
git merge develop
git push origin main             # → auto-deploys to prod Railway
```

### Protection rules (GitHub)

Add branch protection on `main`:
- Require pull request reviews
- Require status checks to pass
- No force pushes

---

## Environment Variables

### Setting variables in Railway

1. Railway Dashboard → Project → Service → **Variables**
2. Add each variable individually, OR use **Raw Editor** to paste a block

### Variable reference

| Variable | Dev Value | Prod Value |
|----------|-----------|------------|
| `APP_ENV` | `development` | `production` |
| `NODE_ENV` | `development` | `production` |
| `SUPABASE_URL` | `https://dev-project.supabase.co` | `https://prod-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | dev key | prod key (rotated) |
| `JWT_SECRET` | dev secret | prod secret |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | `https://web-dev-1-production.up.railway.app` |
| `CROSS_ORIGIN_COOKIES` | (not set / `false`) | `true` (required for cross-origin `SameSite=None; Secure` cookies) |
| `FASTAPI_BASE_URL` | `http://127.0.0.1:8000` | `https://pi.tail12345.ts.net` |
| `CONTROL_SIGNING_SECRET` | (optional) | generated secret (must match Pi) |
| `SCAN_RUNNER_TOKEN` | (optional) | generated secret |

### Generating secrets

```bash
# Generate a 64-char hex secret (run locally, paste into Railway)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend env vars (Vite)

Vite only exposes vars prefixed with `VITE_`. Set in Railway for frontend service:

| Variable | Dev | Prod |
|----------|-----|------|
| `VITE_API_BASE_URL` | (not needed — Vite proxy) | `https://api-dev-production.up.railway.app/api` |
| `VITE_SUPABASE_URL` | Supabase dev URL | Supabase prod URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase dev anon key | Supabase prod anon key |

---

## Startup Safety Checks

The `config/envValidation.js` module (already added) enforces:

1. **Required vars exist** — server crashes with a clear message if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are missing
2. **Prod-only vars** — `ALLOWED_ORIGINS` and `JWT_SECRET` must be set when `APP_ENV=production`
3. **Cross-wire detection** — catches the scariest accidents:
   - `APP_ENV=production` + DB URL contains `dev`/`staging` → **blocked**
   - `APP_ENV=development` + DB URL contains `prod` → **blocked**
   - `APP_ENV=production` + Railway branch isn't `main` → **blocked**

### What it looks like when it catches a mistake

```
╔══════════════════════════════════════════════════════════════╗
║  STARTUP BLOCKED — Environment validation failed            ║
╚══════════════════════════════════════════════════════════════╝

  ✖  [SAFETY] APP_ENV=production but DATABASE_URL looks like a dev database: https://dev-project.supabase.co/***
  ✖  [SAFETY] APP_ENV=production but deploying from branch "develop" (expected "main")

Fix the above and restart.
```

The server **exits immediately** — no half-started state, no silent misconfiguration.

---

## Migration Safety

### Rules

| Environment | Auto-migrate on deploy? | Seed data? | Destructive operations? |
|-------------|------------------------|------------|------------------------|
| **Dev** | Yes (safe) | Yes (test data) | Allowed (it's dev) |
| **Prod** | Yes, **additive only** | **NEVER** | **NEVER** auto |

### What "additive only" means

✅ Safe for auto-run in prod:
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ADD COLUMN`
- `CREATE INDEX`

❌ Never auto-run in prod:
- `DROP TABLE` / `DROP COLUMN`
- `TRUNCATE`
- `DELETE FROM` (bulk)
- `db:reset` / `migrate:fresh`
- Seed scripts

### Recommended approach

Add a guard in your migration runner or npm script:

```js
// Example: refuse destructive commands in prod
if (process.env.APP_ENV === 'production') {
  const sql = migrationContent.toUpperCase();
  const dangerous = ['DROP TABLE', 'DROP COLUMN', 'TRUNCATE', 'DELETE FROM'];
  for (const keyword of dangerous) {
    if (sql.includes(keyword)) {
      throw new Error(`BLOCKED: Migration contains "${keyword}" in production`);
    }
  }
}
```

### Backup before migration

Before any schema change in prod:
1. Railway Dashboard → Database → **Backups** → Create snapshot
2. Or use Supabase Dashboard → **Database** → **Backups**

---

## Frontend Build Configuration

### Railway service commands

| Setting | Value |
|---------|-------|
| **Root Directory** | `/` (repo root) |
| **Build Command** | `npm install --prefer-offline && npm run build` |
| **Start Command** | `npm start` |

The `start` script in `package.json` runs `serve -s dist -l tcp://0.0.0.0:$PORT` (Railway injects `$PORT`).

> **Note:** `npm ci` cannot be used because Railway's build layer locks `node_modules/.vite`. Use `npm install --prefer-offline` instead. The Vite cache is relocated to `.vite-cache/` (via `cacheDir` in `vite.config.js`) to avoid this issue.

### Vite proxy (development only)

Configured in `vite.config.js` — proxies `/api` to `localhost:3000`:
```js
server: {
  proxy: {
    "/api": {
      target: "http://localhost:3000",
      changeOrigin: true,
    },
  },
},
```

### Production build

Set `VITE_API_BASE_URL` as a **Railway environment variable** on the frontend service. Vite bakes it in at build time:

```
VITE_API_BASE_URL=https://api-dev-production.up.railway.app/api
```

The axios client reads this:
```js
baseURL: import.meta.env.VITE_API_BASE_URL || "/api"
```

### Current architecture: separate Railway services

The frontend and backend run as **separate Railway services** (`web-dev-1` and `api-dev`). This means:
- `VITE_API_BASE_URL` must be set on the frontend service
- `ALLOWED_ORIGINS` must include the frontend domain on the backend service
- `CROSS_ORIGIN_COOKIES=true` must be set on the backend for cookie auth to work cross-origin

> **Not using single-service mode.** If you ever combine them into one service, remove `VITE_API_BASE_URL` and serve the frontend static files from Express.

---

## Domain Setup

| Service | Domain | Source |
|---------|--------|--------|
| Frontend (dev) | `web-dev-1-production.up.railway.app` | Railway auto-generated |
| Backend (dev) | `api-dev-production.up.railway.app` | Railway auto-generated |
| Frontend (prod) | TBD | Railway auto-generated or custom |
| Backend (prod) | TBD | Railway auto-generated or custom |

### Custom domain steps

1. Railway → Prod Project → Service → Settings → **Domains**
2. Add custom domain: `yourapp.com`
3. Add DNS records at your registrar (Railway shows the values)
4. Update `ALLOWED_ORIGINS` to include the custom domain

---

## Pre-Deploy Checklist

Run through this before every production deploy:

### First-time setup
- [ ] Two Railway projects created (`yourapp-dev`, `yourapp-prod`)
- [ ] Two separate databases (different Supabase projects or Railway Postgres)
- [ ] Branch-based deploy configured (`main` → prod, `develop` → dev)
- [ ] All env vars set in Railway (see variable reference above)
- [ ] Supabase service role key rotated (Phase 0-A)
- [ ] Git history scrubbed of `.env` files (Phase 0-C/D)
- [ ] `ALLOWED_ORIGINS` includes production frontend domain
- [ ] GitHub branch protection on `main`

### Every deploy
- [ ] Changes tested in dev environment first
- [ ] No destructive migrations in the changeset
- [ ] Database backup taken (if schema changes)
- [ ] PR reviewed and merged to `main` (don't push directly)
- [ ] After deploy: hit `/health` endpoint to verify
- [ ] After deploy: test login flow end-to-end
- [ ] After deploy: check browser console for CSP violations

---

## Rollback Procedure

If a prod deploy breaks something:

### App rollback
1. Railway Dashboard → Prod Service → **Deployments**
2. Find the last working deployment → **Redeploy**
3. Or: `git revert` the bad commit, push to `main`

### Database rollback
1. Railway: restore from backup snapshot
2. Supabase: use point-in-time recovery (if enabled) or restore backup
3. **This is why backups before migration are non-negotiable**

### Emergency: kill the service
1. Railway Dashboard → Service → **Settings** → remove auto-deploy
2. This stops new deploys while you investigate

---

## Quick Reference: What Goes Where

| What | Where to configure | NOT here |
|------|-------------------|----------|
| Secrets/keys | Railway env vars | `.env` files in git |
| CORS origins | `ALLOWED_ORIGINS` env var | Hardcoded in `server.js` |
| FastAPI URL | `FASTAPI_BASE_URL` env var | Hardcoded in `server.js` |
| Frontend API URL | `VITE_API_BASE_URL` env var (build-time) | Hardcoded in `axios.js` |
| DB connection | Separate Supabase projects | Shared DB across envs |
| Deploy trigger | Branch-based (`main`/`develop`) | Manual deploys to wrong env |
