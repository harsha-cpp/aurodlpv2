import { defineManifest } from '@crxjs/vite-plugin';
import type { BackendTarget } from './src/backend-url';
import pkg from './package.json' with { type: 'json' };

export function buildManifest(backend: BackendTarget) {
  return defineManifest({
    manifest_version: 3,
    name: 'Auro Healthcare DLP',
    version: pkg.version,
    description: 'Checks outgoing Gmail for patient data before it leaves the hospital.',
    minimum_chrome_version: '120',
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      default_popup: 'src/popup/index.html',
      default_icon: 'icons/icon-32.png',
    },
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['https://mail.google.com/*'],
        js: ['src/content/index.ts'],
        run_at: 'document_idle',
        all_frames: false,
      },
      {
        matches: ['http://*/*', 'https://*/*'],
        exclude_matches: ['https://mail.google.com/*'],
        js: ['src/content/input-protection-entry.ts'],
        run_at: 'document_start',
        all_frames: true,
        match_about_blank: true,
      },
    ],
    permissions: ['storage', 'alarms'],
    host_permissions: ['https://mail.google.com/*', backend.hostPermission],
    web_accessible_resources: [
      {
        resources: ['assets/*'],
        matches: ['https://mail.google.com/*'],
      },
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; frame-ancestors 'none';",
    },
  });
}
