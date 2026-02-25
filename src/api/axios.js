// src/api/axios.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // send cookies (sb_refresh) on every request
});

// ── In-memory access token ──────────────────────────────
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// ── Request interceptor: attach Bearer ──────────────────
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ── Response interceptor: 401 → single refresh → retry ─
let isRefreshing = false;
let refreshQueue = []; // queued callers waiting for the single refresh

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const status = err.response?.status;

    // Robust URL check — match both relative ("auth/refresh") and absolute
    // paths. Use "auth/refresh" without leading slash since api.post("auth/refresh")
    // stores the URL as-is (no leading slash).
    const isRefreshCall = original.url?.includes("auth/refresh");

    // Only intercept 401s; skip if already retried or if this IS the refresh call
    if (status !== 401 || original._retry || isRefreshCall) {
      return Promise.reject(err);
    }

    original._retry = true;

    // Build a clean config for the retry.
    // Reusing err.config directly in axios 1.x can carry stale internal
    // properties (AxiosHeaders instance, transformResponse, adapter, etc.)
    // that corrupt the retried response. Only copy the essentials —
    // the request interceptor will re-attach the Bearer token.
    const cleanRetry = () => api({
      method:  original.method,
      url:     original.url,
      data:    original.data,
      params:  original.params,
    });

    if (isRefreshing) {
      // Another request is already refreshing — queue this one
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then(() => cleanRetry());
    }

    isRefreshing = true;

    try {
      const r = await api.post("auth/refresh"); // cookie sent via withCredentials
      const newToken = r.data.access_token;
      setAccessToken(newToken);

      // Resolve all queued requests
      refreshQueue.forEach(({ resolve }) => resolve(newToken));
      refreshQueue = [];

      return cleanRetry();
    } catch (refreshErr) {
      // Refresh failed — force logout
      refreshQueue.forEach(({ reject }) => reject(refreshErr));
      refreshQueue = [];
      setAccessToken(null);
      // Only redirect if not already on a public page
      const publicPaths = ["/login", "/forgot-password", "/reset-password"];
      if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = "/login";
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
