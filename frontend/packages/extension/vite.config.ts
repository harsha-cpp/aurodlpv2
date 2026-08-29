/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { buildManifest } from './manifest.config';
import { resolveBackendTarget } from './src/backend-url';

export default defineConfig(({ mode }) => {
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
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
