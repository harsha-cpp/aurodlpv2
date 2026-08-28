/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { buildManifest } from './manifest.config';
import { resolveBackendTarget } from './src/backend-url';

export default defineConfig(({ mode }) => {
  // Resolved exactly once and handed to both the manifest host permission and
  // the runtime constant. Deriving them separately is how a build ends up with
  // a production URL and a localhost permission (or the reverse): import.meta.
  // env.DEV follows NODE_ENV while the manifest would follow mode.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backend = resolveBackendTarget(env['VITE_BACKEND_URL'], mode !== 'production');

  return {
    plugins: [react(), crx({ manifest: buildManifest(backend) })],
    define: {
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backend.url),
    },
    build: {
      target: 'chrome120',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
          },
        },
      },
    },
    server: { port: 5174, strictPort: true, hmr: { port: 5174 } },
    // The send-path predicates, the policy decision and the identity scraping
    // are unit tested against happy-dom rather than only through Playwright.
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
