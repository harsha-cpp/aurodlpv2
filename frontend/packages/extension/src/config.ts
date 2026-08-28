// Build-time configuration shared by the content script, the service worker
// and the modal.
import { resolveBackendTarget } from './backend-url';

export const BACKEND_URL = resolveBackendTarget(
  import.meta.env.VITE_BACKEND_URL as string | undefined,
  import.meta.env.DEV,
).url;

// Every network hop the send path waits on has a deadline. Before this the
// attachment upload had no timeout at all, so a hung connection left the Send
// button dead forever; the user's only signal was that nothing happened.
export const ATTACHMENT_UPLOAD_TIMEOUT_MS = 15_000;
export const ATTACHMENT_POLL_INTERVAL_MS = 1_000;
export const ATTACHMENT_POLL_REQUEST_TIMEOUT_MS = 5_000;
export const ATTACHMENT_POLL_TIMEOUT_MS = 10_000;
export const ATTACHMENT_FETCH_TIMEOUT_MS = 8_000;
export const FINALIZE_TIMEOUT_MS = 10_000;

// Hard ceiling on the whole send-time scan. When it expires we stop waiting on
// the backend and decide locally rather than holding the draft hostage.
export const SCAN_BUDGET_MS = 20_000;

// A cleared draft may be re-checked seconds later on the schedule-send path
// (menu item, then the dialog). Re-running the scan for byte-identical content
// would double the wait, so an allow verdict is reused while the content
// fingerprint still matches.
export const VERDICT_CACHE_TTL_MS = 60_000;

export const QUARANTINE_POLL_TIMEOUT_MS = 8_000;
