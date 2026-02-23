// __tests__/helpers/mockSupabase.js
// Chainable mock for @supabase/supabase-js client.
// Supports fluent API: supabaseClient.from("table").select("*").eq("id", 1).single()

function createMockSupabase(overrides = {}) {
  const defaultResponse = { data: null, error: null };

  // Each chain method returns `this` for fluency; terminal methods return a Promise.
  const chainable = () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(overrides.singleResult ?? defaultResponse),
      maybeSingle: jest.fn().mockResolvedValue(overrides.maybeSingleResult ?? defaultResponse),
      // When awaited directly (no terminal), resolve to defaultResponse
      then: jest.fn((resolve) => resolve(overrides.defaultResult ?? defaultResponse)),
    };
    return chain;
  };

  const client = {
    from: jest.fn(() => chainable()),
    auth: {
      admin: {
        createUser: jest.fn().mockResolvedValue({ data: { user: { id: "mock-user-id" } }, error: null }),
        generateLink: jest.fn().mockResolvedValue({ data: { session: { access_token: "mock-token" } }, error: null }),
      },
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user: { id: "mock-user-id" } }, error: null }),
    },
  };

  return client;
}

module.exports = { createMockSupabase };
