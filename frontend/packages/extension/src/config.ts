const API_BASE_KEY = "aurodlp_api_base_url";
const BUILD_API_BASE =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  "http://localhost:8000";

let cachedApiBase: Promise<string> | null = null;

export function normalizeApiBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function configuredApiBaseUrl(): Promise<string> {
  const managed = (await chrome.storage.managed
    .get(API_BASE_KEY)
    .catch(() => ({}))) as Record<string, unknown>;
  const local = (await chrome.storage.local.get(API_BASE_KEY)) as Record<
    string,
    unknown
  >;
  const candidates = [
    managed[API_BASE_KEY],
    local[API_BASE_KEY],
    BUILD_API_BASE,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizeApiBaseUrl(candidate);
    if (normalized) return normalized;
  }
  throw new Error("valid AURO API URL is not configured");
}

export function getApiBaseUrl(): Promise<string> {
  cachedApiBase ??= configuredApiBaseUrl();
  return cachedApiBase;
}

export async function apiEndpoint(path: string): Promise<string> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${await getApiBaseUrl()}${normalizedPath}`;
}

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === "managed" || area === "local") && changes[API_BASE_KEY]) {
      cachedApiBase = null;
    }
  });
}
