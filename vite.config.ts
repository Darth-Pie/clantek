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
    },
  },
});
