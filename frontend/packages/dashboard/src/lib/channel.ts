export type Channel = "email" | "web";

export const GMAIL_LABEL = "Gmail";

export const UNKNOWN_SITE_LABEL = "Unknown site";

export interface WhereCell {
  text: string;
  mono: boolean;
}

export function siteLabel(host: string | null | undefined): string {
  const raw = (host ?? "").trim().toLowerCase();
  if (!raw) return UNKNOWN_SITE_LABEL;
  const afterScheme = raw.includes("://")
    ? raw.slice(raw.indexOf("://") + 3)
    : raw;
  const hostOnly = afterScheme.split("/")[0] ?? "";
  const bare = hostOnly.startsWith("www.") ? hostOnly.slice(4) : hostOnly;
  return bare || UNKNOWN_SITE_LABEL;
}

export function describeWhere(
  channel: string | null | undefined,
  siteHost: string | null | undefined,
): WhereCell {
  const value = (channel ?? "").trim().toLowerCase();

  if (value === "web") {
    const label = siteLabel(siteHost);
    return { text: label, mono: label !== UNKNOWN_SITE_LABEL };
  }

  if (value === "" || value === "email")
    return { text: GMAIL_LABEL, mono: false };

  return { text: value.charAt(0).toUpperCase() + value.slice(1), mono: false };
}

export interface ChannelCounts {
  email: number;
  web: number;
}

function whole(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.round(n)
    : 0;
}

export function channelCounts(
  by: Partial<Record<Channel, number>> | null | undefined,
): ChannelCounts {
  return { email: whole(by?.email), web: whole(by?.web) };
}

export function channelSplitLabel(
  by: Partial<Record<Channel, number>> | null | undefined,
): string | null {
  if (!by) return null;
  const { email, web } = channelCounts(by);
  if (email === 0 && web === 0) return null;
  return `${email.toLocaleString()} email - ${web.toLocaleString()} web`;
}
