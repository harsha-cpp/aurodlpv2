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
  surface2: "#e9ecea",
  ink: "#121a1f",
  ink2: "#3b4850",
  ink3: "#69777f",
  rule: "#d4dad7",
  ruleStrong: "#b7c0bc",
  accent: "#0e5e6d",
  accentInk: "#ffffff",
  stop: "#b03a22",
  shadow: "0 16px 40px -12px rgba(18,26,31,0.3), 0 1px 2px rgba(18,26,31,0.08)",
};

const DARK: Palette = {
  surface: "#151b1e",
  surface2: "#1c2427",
  ink: "#e8edeb",
  ink2: "#b6c1bd",
  ink3: "#86948f",
  rule: "#2b353a",
  ruleStrong: "#3d4a50",
  accent: "#4fb3c1",
  accentInk: "#0a1a1d",
  stop: "#e6785f",
  shadow: "0 16px 40px -12px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.5)",
};

export function palette(): Palette {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

export const FONT_UI =
  "'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif";
export const FONT_SERIF = "'Iowan Old Style','Palatino Linotype',Georgia,serif";
export const FONT_MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
