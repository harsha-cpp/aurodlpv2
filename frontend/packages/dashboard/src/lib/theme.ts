import { useCallback, useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "blade.theme";

const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

function isPreference(value: unknown): value is ThemePreference {
  return PREFERENCES.includes(value as ThemePreference);
}

export const DEFAULT_PREFERENCE: ThemePreference = "dark";

export function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

export function applyPreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function writePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    void 0;
  }
  applyPreference(pref);
  notify();
}

let mediaBound = false;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!mediaBound) {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", notify);
    mediaBound = true;
  }
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): string {
  const pref = readPreference();
  return `${pref}:${resolveTheme(pref)}`;
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
} {
  const key = useSyncExternalStore(
    subscribe,
    snapshot,
    () => `${DEFAULT_PREFERENCE}:${DEFAULT_PREFERENCE}`,
  );
  const [preference, resolved] = key.split(":") as [
    ThemePreference,
    ResolvedTheme,
  ];
  const setPreference = useCallback(
    (pref: ThemePreference) => writePreference(pref),
    [],
  );
  return { preference, resolved, setPreference };
}

export function cssColor(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || "#000000";
}
