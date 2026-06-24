// config/supabaseClient.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Resilient fetch ──────────────────────────────────────────────
// Node's global fetch (undici) can throw `TypeError: fetch failed`
// (UND_ERR_CONNECT_TIMEOUT, ECONNRESET, etc.) when the connection pool
// goes stale — e.g. after the host sleeps or switches networks. These are
// connection-PHASE failures: the request never reached Supabase, so a fresh
// retry is safe and idempotent regardless of HTTP method. Without this, a
// single transient blip surfaces to the client as a 500.
const RETRIABLE_CONNECT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

const MAX_FETCH_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True only for transport-level errors that occur before the request is delivered. */
function isRetriableConnectError(err) {
  const code = err?.cause?.code || err?.code;
  if (code && RETRIABLE_CONNECT_CODES.has(code)) return true;
  // Generic undici transport failure with no HTTP response received.
  return err?.name === "TypeError" && /fetch failed/i.test(err?.message || "");
}

async function resilientFetch(input, init) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      // Respect caller-initiated aborts; only retry transient connect failures.
      if (init?.signal?.aborted || !isRetriableConnectError(err)) throw err;
      if (attempt < MAX_FETCH_ATTEMPTS) {
        const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
        console.warn(
          `[supabase] fetch attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed ` +
            `(${err?.cause?.code || err?.message}); retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: resilientFetch },
});

// Instrument query builders returned by `from()` to log suspicious null UUIDs.
// This is a light-weight debugging aid to trace 'invalid input syntax for type uuid: "null"' errors.
const originalFrom = supabaseClient.from.bind(supabaseClient);

supabaseClient.from = function (table) {
	const builder = originalFrom(table);

	// Helper to wrap methods that can compare values (eq, in)
	const wrapMethod = (obj, name) => {
		if (typeof obj[name] !== 'function') return;
		const orig = obj[name].bind(obj);
		obj[name] = function (...args) {
			try {
				// For eq(key, value) and in(key, values)
				if (name === 'eq') {
					const key = args[0];
					const val = args[1];
					if (val === null || val === 'null') {
						console.error('\n[Supabase Debug] .eq called with null value', { table, key, val });
						console.error(new Error().stack);
					}
				}
				if (name === 'in') {
					const key = args[0];
					const vals = args[1];
					if (Array.isArray(vals) && vals.includes(null)) {
						console.error('\n[Supabase Debug] .in called with array containing null', { table, key, vals });
						console.error(new Error().stack);
					}
				}
			} catch (e) {
				console.error('Error in supabase debug wrapper', e);
			}
			return orig(...args);
		};
	};

	// Wrap common comparison methods
	['eq', 'in'].forEach((m) => wrapMethod(builder, m));

	return builder;
};

module.exports = { supabaseClient };
