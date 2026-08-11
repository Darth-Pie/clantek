import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  build: {
    // wrangler.jsonc serves this directory as the Worker's static assets.
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      // `npm run dev` runs Vite and `wrangler dev` side by side; the API lives
      // on the Worker at 8787 and the React app calls it through this proxy.
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      // Uploaded media is served by the Worker out of R2. Without this, Vite's
      // SPA fallback answers /media/* with index.html, so every uploaded image
      // silently fails to decode in dev while working fine in production (where
      // run_worker_first sends these straight to the Worker).
      '/media': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
