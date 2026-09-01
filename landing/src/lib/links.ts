const FALLBACK_APP_URL = "http://localhost:5173";

function normalize(raw: string | undefined): string {
  const value = (raw ?? "").trim() || FALLBACK_APP_URL;
  return value.replace(/\/+$/, "");
}

export const APP_URL = normalize(process.env.NEXT_PUBLIC_APP_URL);

export const links = {
  appUrl: APP_URL,
  signIn: `${APP_URL}/login`,
  createAccount: `${APP_URL}/signup`,
  getStarted: "/get-started",
} as const;

export default links;
