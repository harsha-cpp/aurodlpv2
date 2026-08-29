export const UNATTRIBUTED = "Unattributed";

export function senderLabel(email: string | null | undefined): string {
  const trimmed = email?.trim();
  return trimmed ? trimmed : UNATTRIBUTED;
}

export function isUnattributed(email: string | null | undefined): boolean {
  return !email?.trim();
}

export function senderKey(
  email: string | null | undefined,
  index: number,
): string {
  return email?.trim() ? `email:${email}` : `unattributed:${index}`;
}

export function formatTime(ts: string | null | undefined): string {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(ts: string | null | undefined): string {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleDateString();
}

export function durationSince(
  from: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!from) return "-";
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return "-";
  const ms = Math.max(0, now - start);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function shortHash(
  hash: string | null | undefined,
  head = 8,
  tail = 6,
): string {
  if (!hash) return "-";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const cell = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
