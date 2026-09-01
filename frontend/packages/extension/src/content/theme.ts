export interface Palette {
  surface: string;
  surface2: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  ruleStrong: string;
  accent: string;
  accentInk: string;
  stop: string;
  shadow: string;
}

const LIGHT: Palette = {
  surface: "#ffffff",
  surface2: "#eceef2",
  ink: "#0d1319",
  ink2: "#39424d",
  ink3: "#667080",
  rule: "#dcdfe6",
  ruleStrong: "#bcc2cc",
  accent: "#16456e",
  accentInk: "#ffffff",
  stop: "#b3261e",
  shadow: "0 16px 40px -12px rgba(13,19,25,0.3), 0 1px 2px rgba(13,19,25,0.08)",
};

const DARK: Palette = {
  surface: "#12181e",
  surface2: "#1a222a",
  ink: "#e7ecf2",
  ink2: "#b3bdc8",
  ink3: "#8290a0",
  rule: "#28323c",
  ruleStrong: "#3a4653",
  accent: "#6aa9e0",
  accentInk: "#08121c",
  stop: "#e0705f",
  shadow: "0 16px 40px -12px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.5)",
};

export function palette(): Palette {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

export const FONT_UI =
  "'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif";
export const FONT_MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
