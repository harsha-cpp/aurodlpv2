export class ApiError extends Error {
  status: number;
  detail: string | object;
  constructor(status: number, detail: string | object) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

const API_BASE = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:8000';

// In-memory access token (lost on page reload — recovered via refresh cookie).
let accessToken: string | null = null;

// Singleton refresh promise — prevents concurrent refresh calls from racing.
// Also caches a successful refresh result briefly so simultaneous bootstrap +
// initial API calls share the same response (and the same rotated cookie).
let refreshPromise: Promise<RefreshResult> | null = null;

// Callback fired when refresh definitively fails (cookie expired/missing).
// AuthProvider uses this to flip state to 'unauthenticated'.
let onAuthLost: (() => void) | null = null;

interface RefreshResult {
  accessToken: string | null;
  data: unknown;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setOnAuthLost(cb: () => void): void {
  onAuthLost = cb;
}

/**
 * Singleton refresh — returns the same promise for concurrent callers.
 * Returns the raw response data so AuthProvider bootstrap can read member+org
 * without making a second /me call.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        accessToken = null;
        onAuthLost?.();
        return { accessToken: null, data: null };
      }
      const data = (await res.json()) as { access_token: string };
      accessToken = data.access_token;
      return { accessToken: data.access_token, data };
    } catch {
      accessToken = null;
      onAuthLost?.();
      return { accessToken: null, data: null };
    } finally {
      setTimeout(() => {
        refreshPromise = null;
      }, 2000);
    }
  })();
  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  skipAuth?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuth = false } = opts;
  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!skipAuth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res = await fetch(url, init);

  if (res.status === 401 && !skipAuth) {
    const { accessToken: newToken } = await refreshSession();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...init, headers });
    }
  }

  if (!res.ok) {
    let detail: string | object = res.statusText;
    try {
      const data = (await res.json()) as { detail?: string | object };
      if (data.detail !== undefined) detail = data.detail;
    } catch {
      /* noop */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
