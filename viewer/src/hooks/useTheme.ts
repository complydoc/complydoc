import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "./useMediaQuery";

export type Theme = "system" | "light" | "dark";

const KEY = "complydoc-theme";
const THEMES: readonly Theme[] = ["system", "light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.includes(value as Theme) ? (value as Theme) : "system";
  } catch {
    return "system";
  }
}

/**
 * The colour theme, remembered in this browser.
 *
 * "system" follows the operating system, and keeps following it if it
 * changes; the other two pin it. The `dark` class on the root is what the
 * shadcn theme reads. `toggle` switches to whichever is not showing.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored);
  const systemDark = useMediaQuery(DARK_QUERY);
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Storage can be blocked; the theme still applies for this visit.
    }
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const toggle = useCallback(() => setTheme(dark ? "light" : "dark"), [dark]);

  return { theme, setTheme, dark, toggle };
}
