import { resolveBackendTarget } from "./backend-url";

export const BACKEND_URL = resolveBackendTarget(
  import.meta.env.VITE_BACKEND_URL as string | undefined,
  import.meta.env.DEV,
).url;

export const ATTACHMENT_UPLOAD_TIMEOUT_MS = 15_000;
export const ATTACHMENT_POLL_INTERVAL_MS = 1_000;
export const ATTACHMENT_POLL_REQUEST_TIMEOUT_MS = 5_000;
export const ATTACHMENT_POLL_TIMEOUT_MS = 10_000;
export const ATTACHMENT_FETCH_TIMEOUT_MS = 8_000;
export const FINALIZE_TIMEOUT_MS = 10_000;

export const SCAN_BUDGET_MS = 20_000;

export const VERDICT_CACHE_TTL_MS = 60_000;

export const QUARANTINE_POLL_TIMEOUT_MS = 8_000;
