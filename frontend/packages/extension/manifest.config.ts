import { defineManifest } from '@crxjs/vite-plugin';
import type { BackendTarget } from './src/backend-url';
import pkg from './package.json' with { type: 'json' };

// The manifest is generated rather than static so host_permissions comes from
// the same resolved backend target as the runtime BACKEND_URL. Chrome blocks
// requests to origins the manifest does not list, so a hardcoded localhost
// permission in a packaged build silently disables every backend call and
// leaves the extension on its weaker offline fallback.
export function buildManifest(backend: BackendTarget) {
  return defineManifest({
    manifest_version: 3,
    name: 'AURO',
    version: pkg.version,
    description: 'Block accidental PHI/PII leaks from Gmail before send.',
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
