const EXTENSION_TOKEN_KEY = "aurodlp_extension_token";

export async function extensionAuthorization(): Promise<string> {
  const stored = await chrome.storage.local.get(EXTENSION_TOKEN_KEY);
  const token = (stored[EXTENSION_TOKEN_KEY] as string | undefined)?.trim();
  if (!token) throw new Error("extension enrollment required");
  return `AuroExtension ${token}`;
}

export async function extensionFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", await extensionAuthorization());
  return fetch(input, { ...init, headers });
}
