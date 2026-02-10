// middleware/authMiddleware.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

exports.authJWT = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  
  const { data/* : { user } */, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });
  
  //req.user = user;  // Ready for controllers!
  req.user = data.user;  // authenticated supabase user (pass token string)
  next();
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