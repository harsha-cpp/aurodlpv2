import { ApiError } from './api';

interface ValidationDetail {
  loc?: unknown;
  msg?: unknown;
}

const STATUS_FALLBACKS: Record<number, string> = {
  400: 'The server rejected that request.',
  401: 'Your session has expired. Sign in again.',
  403: 'Your role does not allow that.',
  404: 'Not found — it may have been removed already.',
  409: 'That conflicts with something that already exists.',
  413: 'That payload is too large.',
  422: 'Some of those values are not valid.',
  429: 'Too many attempts. Wait a moment and try again.',
  500: 'The server hit an error. Try again shortly.',
  502: 'The server is unreachable right now.',
  503: 'The server is unreachable right now.',
};

function fieldName(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  // FastAPI locations look like ["body", "password"]; the field is the tail.
  const tail = loc[loc.length - 1];
  return typeof tail === 'string' && tail !== 'body' ? tail.replace(/_/g, ' ') : null;
}

/**
 * FastAPI hands back three shapes: a plain string, a structured dict (our
 * org-selection conflict), or a 422 validation array. Rendering any of them
 * with String() produces "[object Object]", which is how a user ends up
 * retyping a valid password five times.
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) {
    const detail = err.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;

    if (Array.isArray(detail)) {
      const parts = (detail as ValidationDetail[])
        .map((item) => {
          const msg = typeof item.msg === 'string' ? item.msg : null;
          if (!msg) return null;
          const field = fieldName(item.loc);
          return field ? `${field}: ${msg}` : msg;
        })
        .filter((s): s is string => Boolean(s));
      if (parts.length > 0) return parts.join('. ');
    }

    if (detail && typeof detail === 'object') {
      const record = detail as Record<string, unknown>;
      for (const key of ['message', 'detail', 'code']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value;
      }
    }

    return STATUS_FALLBACKS[err.status] ?? `Request failed (${err.status}).`;
  }

  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
