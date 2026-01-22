/* const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',  // Vite dev origin
}));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
}); */

// server.js - Instead of using the Supabase client right away, 
// you can even call your existing REST endpoint from Express to move faster:

/* require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // if on Node <18, otherwise use global fetch

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
}));

const SUPABASE_URL = 'https://rrbkpibfbesacxmbbfoj.supabase.co';
const SUPABASE_API_KEY = 'sb_publishable_KAIOg4NQffNgH-BxXsFLtA_FCouBylF';

app.get('/user_account', async (req, res) => {
  try {
     try {
    const { data, error } = await supabase
      .from('user_account')
      .select('*')
      .limit(10);

    if (error) {
      console.error('Supabase error:', error);  // <-- important
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('Server error:', err);        // <-- important
    res.status(500).json({ error: 'Server error' });
  }

/*

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/user_account?select=*`,
      {
        headers: {
          apikey: SUPABASE_API_KEY,
          Authorization: `Bearer ${SUPABASE_API_KEY}`,
        },
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Supabase error:', text);
      return res.status(500).json({ error: 'Supabase error' });
    }

    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(3000, () =>
  console.log('API running on http://localhost:3000')*/

/*
console.log("CWD:", process.cwd());
console.log("ENV FILE URL:", process.env.SUPABASE_URL);*/

/* WHEN INTEGRATING IT TO FRONTEND

const allowedOrigins = [
'http://localhost:5173', // Vite dev
'https://your-dashboard-domain', // production React SPA
];

const corsOptions = {
origin: allowedOrigins,
};

app.use(cors(corsOptions)); // applies to all /api routes

*/

// ---------------------------------------------------------------

/* const path = require("path");

require("dotenv").config({
  path: require("path").resolve(__dirname, ".env"),
});


const express = require('express');
const cors = require("cors");

const allowedOrigins = [
  "http://localhost:5173", // Vite dev server
];

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // allow server-to-server, Postman, curl
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
  })
);

const { createClient } = require('@supabase/supabase-js');

app.use(express.json()); // <-- important for POST/PUT later
app.use(cors({
  origin: 'http://localhost:5173',
}));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

app.get('/ping', (req, res) => {
  res.json({ ok: true });
});

app.get('/user_account', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_account')
      .select('*')
      .limit(10);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
 */


// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
//const { supabaseClient } = require("./config/supabaseClient");
const webAppRoutes = require("./routes/webAppRoutes");
const rasPiRoutes = require("./routes/rasPiRoutes");
const captivePortalRoutes = require("./routes/captivePortalRoutes");

const app = express();

const allowedOrigins = ["http://localhost:5173"]; // Vite dev server

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// basic health route (can stay here or move to its own router)
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/", webAppRoutes); 
//app.use("/api/rasPi", rasPiRoutes);
//app.use("/api/captivePortal", captivePortalRoutes);

app.use("/api/", webAppRoutes); 
app.use("/api/rasPi", rasPiRoutes);
//app.use("/api/captivePortal", captivePortalRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
