// middleware/authMiddleware.js
const { jwtVerify } = require('jose'); // npm install jose

// Optional: cache the secret as a Uint8Array
const encoder = new TextEncoder();
const JWT_SECRET = encoder.encode(process.env.SUPABASE_JWT_SECRET); 
// In Supabase dashboard: Settings -> API -> "JWT secret" [NOT the anon/service key]

exports.authJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }

    // Verify the JWT locally with jose (no network request)
    const { payload } = await jwtVerify(token, JWT_SECRET);
    // payload will contain fields like sub, role, email, etc. for Supabase JWTs [web:55]

    // Attach user info to request for later controllers
    req.user = payload;
    next();
  } catch (err) {
    console.error('JWT verification error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};


/*
Dumbed down explanation
Before: your middleware called supabase.auth.getUser(token) → this makes an HTTP request to Supabase, 
which was failing with ECONNRESET.

Now: middleware uses jose.jwtVerify() to check the token locally using your Supabase JWT secret.

If the token is valid, we put the decoded user info into req.user, then call next() so your route handler runs.

If the token is missing, broken, or expired, we return 401 and stop there.

You just need to:

npm install jose

Add SUPABASE_JWT_SECRET to your .env (copy from Supabase dashboard → Settings → API → JWT Secret).
SUPABASE_JWT_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYmtwaWJmYmVzYWN4bWJiZm9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQ0NjIzMywiZXhwIjoyMDgzMDIyMjMzfQ.Kjj7brRD_F3aKa7BAGTIfnZpuSPtiiQHUXhpWr6g-zk
TO CONTINUE THIS FUCKING JWT SECRET KEY
​

Make sure all protected routes use authJWT as middleware.
*/