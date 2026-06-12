/* import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev needs 'unsafe-eval'/'unsafe-inline' + ws connect for Vite HMR / React Fast Refresh.
const devCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* wss://localhost:* https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Built bundle has no HMR, so no eval needed.
const previewCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = (csp) => ({
  "Content-Security-Policy": csp,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
});

export default defineConfig({
  plugins: [react()],
  cacheDir: ".vite-cache", // avoid node_modules/.vite lock on Railway
  preview: {
    host: true,
    allowedHosts: "all", // Railway uses dynamic subdomains
    headers: securityHeaders(previewCsp),
  },
  server: {
    headers: securityHeaders(devCsp),
    proxy: {
      "/api": {
        target: "http://localhost:3000", // your Express backend
        changeOrigin: true,
      },
    },
  },
});
