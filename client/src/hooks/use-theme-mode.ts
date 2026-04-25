// 48:4
import { useCallback, useEffect, useState } from "react";

export const MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof MODES)[number];

const KEY = "a0p_mode";

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY) as ThemeMode | null;
    return v && MODES.includes(v) ? v : "dark";
  } catch {
    return "dark";
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
}

function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  const useDark = mode === "dark" || (mode === "system" && systemPrefersDark());
  root.classList.toggle("dark", useDark);
}

// Bootstrap on import so the first paint matches the persisted choice.
// Mirrors what main.tsx used to hardcode (.add("dark")) but respects the
// stored preference and system fallback. Safe to call multiple times.
export function bootstrapTheme(): void {
  applyMode(readMode());
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(readMode);

  useEffect(() => {
    applyMode(mode);
    if (mode !== "system") return;
    // Re-apply when the OS preference changes mid-session.
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    try { localStorage.setItem(KEY, m); } catch {}
    setModeState(m);
  }, []);

  return { mode, setMode };
}

export const MODE_LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
// 48:4
