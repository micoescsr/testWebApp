// __tests__/setup.js
// Global test setup — runs before every test file.

// Provide deterministic env vars so controller/middleware code doesn't crash on import.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.FASTAPI_BASE_URL = "http://localhost:8000";
process.env.PI_BASE_URL = "http://localhost:8000";
