export const DEV_BACKEND_URL = "http://localhost:8000";
export const PROD_BACKEND_URL = "https://api.aurodlpv2.io";

export interface BackendTarget {
  url: string;
  hostPermission: string;
}

export function resolveBackendTarget(
  raw: string | undefined,
  isDev: boolean,
): BackendTarget {
  const candidate = (raw ?? "").trim();
  if (!candidate) {
    return toTarget(new URL(isDev ? DEV_BACKEND_URL : PROD_BACKEND_URL));
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`VITE_BACKEND_URL is not a valid URL: ${candidate}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`VITE_BACKEND_URL must be http(s): ${candidate}`);
  }
  if (parsed.protocol === "http:" && !isLoopback(parsed.hostname)) {
    throw new Error(
      `VITE_BACKEND_URL must use https outside localhost: ${candidate}`,
    );
  }
  return toTarget(parsed);
}

function toTarget(parsed: URL): BackendTarget {
  const basePath = parsed.pathname.replace(/\/+$/, "");
  return {
    url: `${parsed.origin}${basePath}`,
    hostPermission: `${parsed.origin}/*`,
  };
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}
