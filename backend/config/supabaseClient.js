// config/supabaseClient.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
