/* import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: ".vite-cache", // avoid node_modules/.vite lock on Railway
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000", // your Express backend
        changeOrigin: true,
      },
    },
  },
});
