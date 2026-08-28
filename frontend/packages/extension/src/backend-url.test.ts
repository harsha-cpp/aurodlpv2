import { describe, expect, it } from 'vitest';
import { DEV_BACKEND_URL, PROD_BACKEND_URL, resolveBackendTarget } from './backend-url';

describe('backend target resolution', () => {
  it('defaults to localhost in development and to the production host otherwise', () => {
    expect(resolveBackendTarget(undefined, true).url).toBe(DEV_BACKEND_URL);
    expect(resolveBackendTarget('', false).url).toBe(PROD_BACKEND_URL);
  });

  it('derives the manifest host permission from the same value as the runtime URL', () => {
    const target = resolveBackendTarget('https://api.hospital.example', false);
    expect(target.url).toBe('https://api.hospital.example');
    expect(target.hostPermission).toBe('https://api.hospital.example/*');
  });

  it('trims a trailing slash but keeps a base path', () => {
    expect(resolveBackendTarget('https://api.hospital.example/', false).url).toBe(
      'https://api.hospital.example',
    );
    const based = resolveBackendTarget('https://gw.hospital.example/auro/', false);
    expect(based.url).toBe('https://gw.hospital.example/auro');
    // Host permissions are origin-wide; a path in the pattern would not match.
    expect(based.hostPermission).toBe('https://gw.hospital.example/*');
  });

  it('allows plain http only for a loopback development backend', () => {
    expect(resolveBackendTarget('http://localhost:8000', true).url).toBe('http://localhost:8000');
    expect(resolveBackendTarget('http://127.0.0.1:9000', false).url).toBe('http://127.0.0.1:9000');
    expect(() => resolveBackendTarget('http://api.hospital.example', false)).toThrow(/https/);
  });

  it('fails the build on a malformed value instead of silently using the default', () => {
    expect(() => resolveBackendTarget('api.hospital.example', false)).toThrow(/not a valid URL/);
    expect(() => resolveBackendTarget('ftp://api.hospital.example', false)).toThrow(/http/);
  });
});
