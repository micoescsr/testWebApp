// api/axios.js
import axios from "axios";
import { supabase } from "../lib/supabaseClient";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  console.log('Session exists?', !!session);

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
    console.log("Auth header set:", config.headers.Authorization);
  } else {
    console.log("No session, no Authorization header");
  }

  return config;
});

/* api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
}); */

export default api;


/* import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api", // Express backend
  withCredentials: true,               // needed for auth later
  headers: {
    "Content-Type": "application/json",
  },
});

export default api; */
