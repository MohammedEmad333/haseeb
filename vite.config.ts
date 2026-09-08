import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Relative base so the same bundle can be served from a Tauri/Capacitor
// file:// context as well as from a web server.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // sql.js ships a browser build that we load with a local wasm file from
  // /public — never from a CDN, since the app must work fully offline.
  optimizeDeps: { exclude: ['sql.js'] },
  build: { target: 'es2022', sourcemap: true },
});
