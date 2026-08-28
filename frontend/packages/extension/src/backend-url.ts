// Single source of truth for the backend origin.
//
// The URL used to be the literal 'http://localhost:8000' copied into the
// content script, the service worker and the modal, with manifest.json pinning
// a matching localhost host permission. A packaged build therefore shipped a
// DLP client that could only talk to a developer's laptop: every scan failed
// and fell through to the weaker local fallback, silently. Both the runtime URL
// and the manifest host permission are now derived from VITE_BACKEND_URL
// through this module, so they cannot drift apart.
//
// This file is imported from vite.config.ts / manifest.config.ts as well as
// from extension source, so it must stay free of `import.meta.env` and of any
// browser or node global.

export const DEV_BACKEND_URL = 'http://localhost:8000';
export const PROD_BACKEND_URL = 'https://api.aurodlpv2.io';

export interface BackendTarget {
  /** Origin (plus base path, if configured) with no trailing slash. */
  url: string;
  /** Match pattern for manifest host_permissions. */
  hostPermission: string;
}

/**
 * Resolve the backend target from a build-time env value.
 *
 * Throws on a malformed value instead of falling back: a typo in CI would
 * otherwise ship an extension pointed at the wrong host with no signal.
 */
export function resolveBackendTarget(raw: string | undefined, isDev: boolean): BackendTarget {
  const candidate = (raw ?? '').trim();
  if (!candidate) {
    return toTarget(new URL(isDev ? DEV_BACKEND_URL : PROD_BACKEND_URL));
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`VITE_BACKEND_URL is not a valid URL: ${candidate}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`VITE_BACKEND_URL must be http(s): ${candidate}`);
  }
  // Plain http is only ever a local development convenience; PHI must not
  // leave the browser in the clear on a real deployment.
  if (parsed.protocol === 'http:' && !isLoopback(parsed.hostname)) {
    throw new Error(`VITE_BACKEND_URL must use https outside localhost: ${candidate}`);
  }
  return toTarget(parsed);
}

function toTarget(parsed: URL): BackendTarget {
  const basePath = parsed.pathname.replace(/\/+$/, '');
  return {
    url: `${parsed.origin}${basePath}`,
    hostPermission: `${parsed.origin}/*`,
  };
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
