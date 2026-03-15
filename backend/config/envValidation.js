// config/envValidation.js
// ─── Startup environment validation ─────────────────────────────────
// Fail fast if required env vars are missing or if dev/prod wires are crossed.
// This prevents silent misconfiguration and "oops-I-deployed-to-prod" accidents.

/**
 * Validates that all required environment variables are set and that
 * the runtime environment matches expectations (e.g., prod DB isn't
 * pointed at a dev database and vice versa).
 *
 * Call this at the very top of server.js, before any Express setup.
 * If validation fails, the process exits with code 1.
 */
function validateEnv() {
  const errors = [];

  // ── 1) Required vars (always) ──────────────────────────────────────
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required env var: ${key}`);
    }
  }

  // ── 2) Production-only required vars ───────────────────────────────
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  const appEnv = (process.env.APP_ENV || env).toLowerCase();

  if (appEnv === 'production') {
    const prodRequired = [
      'ALLOWED_ORIGINS',         // CORS allowlist (comma-separated)
      'PI_BASE_URL',             // Pi Funnel URL (https://<device>.ts.net)
      'CONTROL_SIGNING_SECRET',  // HMAC signing secret (must match Pi)
      // JWT_SECRET not required — auth uses JWKS (Supabase remote key set)
    ];

    for (const key of prodRequired) {
      if (!process.env[key]) {
        errors.push(`[PROD] Missing required env var: ${key}`);
      }
    }
  }

  // ── 3) Dev/Prod cross-wire detection ───────────────────────────────
  // Catches the scariest accident: running prod code against a dev DB
  // or dev code against a prod DB.
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_URL || '';

  if (appEnv === 'production') {
    // Prod should NOT point at a dev/staging database
    if (/[_\-](dev|staging|test|local)/i.test(dbUrl)) {
      errors.push(
        `[SAFETY] APP_ENV=production but DATABASE_URL/SUPABASE_URL looks like a dev/staging database: ${maskUrl(dbUrl)}`
      );
    }

    // Prod should be deploying from main or security branch (Railway sets RAILWAY_GIT_BRANCH)
    const branch = process.env.RAILWAY_GIT_BRANCH;
    const allowedBranches = ['main', 'security', 'mar15-async'];
    if (branch && !allowedBranches.includes(branch)) {
      errors.push(
        `[SAFETY] APP_ENV=production but deploying from branch "${branch}" (expected one of: ${allowedBranches.join(', ')})`
      );
    }
  } else {
    // Dev/staging should NOT point at a prod database
    if (dbUrl && /[_\-]prod/i.test(dbUrl) && !/[_\-]dev/i.test(dbUrl)) {
      errors.push(
        `[SAFETY] APP_ENV=${appEnv} but DATABASE_URL/SUPABASE_URL looks like a production database: ${maskUrl(dbUrl)}`
      );
    }
  }

  // ── 4) Bail if any errors ──────────────────────────────────────────
  if (errors.length > 0) {
    console.error('\n╔══════════════════════════════════════════════════════╗');
    console.error('║  STARTUP BLOCKED — Environment validation failed    ║');
    console.error('╚══════════════════════════════════════════════════════╝\n');
    for (const e of errors) {
      console.error(`  ✖  ${e}`);
    }
    console.error('\nFix the above and restart.\n');
    process.exit(1);
  }

  // ── 5) Log environment summary (non-sensitive) ─────────────────────
  console.log(`[env] APP_ENV=${appEnv}, NODE_ENV=${env}`);
  console.log(`[env] SUPABASE_URL=${maskUrl(process.env.SUPABASE_URL)}`);
  if (process.env.RAILWAY_GIT_BRANCH) {
    console.log(`[env] RAILWAY_GIT_BRANCH=${process.env.RAILWAY_GIT_BRANCH}`);
  }
}

/**
 * Mask a URL for safe logging — shows scheme + host but hides path/credentials.
 */
function maskUrl(url) {
  if (!url) return '(not set)';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/***`;
  } catch {
    // Not a valid URL — show first 30 chars
    return url.slice(0, 30) + '…';
  }
}

module.exports = { validateEnv };
