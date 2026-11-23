/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

import fs from 'node:fs';

/** MSW's service worker lives in public/ for mock mode; a real-API production build must not ship it */
const dropMockWorker = (): Plugin => {
  let out = ''; let keep = false;
  return {
    name: 'drop-mock-worker', apply: 'build',
    configResolved(c) { out = path.resolve(c.root, c.build.outDir); keep = c.mode === 'mock' || process.env.VITE_USE_MOCKS === 'true'; },
    closeBundle() { if (!keep) fs.rmSync(path.join(out, 'mockServiceWorker.js'), { force: true }); },
  };
};

export default defineConfig({
  plugins: [react(), dropMockWorker()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@smartwallet/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') } },
  test: { setupFiles: ['./src/test/setup.ts'], exclude: ['node_modules/**', 'e2e/**', '.cache/**'], css: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', 'src/ui/**/index.ts'],
      reporter: ['text-summary', 'text', 'json-summary'],
      reportsDirectory: './.cache/coverage',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // stable vendor chunks: cached across deploys, and recharts (the heavy one) only loads with a screen that draws a chart
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](clsx|tailwind-merge)[\/]/.test(id)) return 'react'; // used by cn() everywhere: must not ride along in the lazy charts chunk
          if (/recharts|d3-|victory-vendor/.test(id)) return 'charts';
          if (/react-dom|react-router|@remix-run|scheduler|[\/]react[\/]/.test(id)) return 'react';
          if (/@tanstack/.test(id)) return 'query';
          if (/[\/]zod[\/]/.test(id)) return 'zod';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0', port: 5173, watch: { usePolling: true },
    // VITE_API_URL=/api/v1 + this proxy = same-origin calls to the local API (no CORS, the httpOnly refresh cookie just works on any dev port)
    proxy: { '/api': { target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: false } },
  }, // polling: reliable hot reload in Docker on Windows
});
