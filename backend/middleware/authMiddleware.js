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

/* //used only by react
//verify jwt, protect routs
//attach user into to req.user
//const jwt = require("jsonwebtoken");
//const { findByAuthUserID } = require("../repositories/userRepository");


// middleware/authMiddleware.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.authJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = user;  // { id, email, ... }
  next();
};

/* 
  const jwt = require('jsonwebtoken');

  const authJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;        // "Bearer xxx"
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(
      token,
      process.env.SUPABASE_JWT_SECRET // from Supabase API settings [web:73][web:85]
    );
    req.user = payload;              // contains sub, email, etc.
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
 


// middleware/auth.js (add this export)
const verifyAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key']; // Pi sends this
  
  if (!apiKey || apiKey !== process.env.PI_API_KEY) {
    return res.status(401).json({ 
      error: 'Invalid or missing API key' 
    });
  }
  
  // Optional: Add to req for logging
  req.piKeyVerified = true;
  next();
};

module.exports = { authJWT, verifyAPIKey }; // Export both
 */
