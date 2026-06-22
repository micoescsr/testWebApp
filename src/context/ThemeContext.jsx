// context/ThemeContext.jsx
// App-wide visual theme (dark default / light opt-in) for the SOC console.
//
// The theme is a device preference, not session state: it persists in
// localStorage (NOT sessionStorage), so it survives logout — clearSessionState()
// only wipes wf:* sessionStorage keys. This is UI-only and never touches the
// in-memory JWT (per CLAUDE.md security boundary).
//
// Default is DARK regardless of the OS prefers-color-scheme setting — this is an
// intentional SOC-identity choice. index.html sets data-theme="dark" on <html>
// so first paint is already dark (no flash before this provider mounts).
import { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "wf:theme";
const VALID_THEMES = ["dark", "light"];
const DEFAULT_THEME = "dark";

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  toggleTheme: () => {},
  setTheme: () => {},
});

// Read a previously stored preference; fall back to dark. Never reads the OS
// prefers-color-scheme — dark is the deliberate default.
const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (VALID_THEMES.includes(stored)) return stored;
  } catch {
    // localStorage unavailable (private mode / blocked) — use default.
  }
  return DEFAULT_THEME;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(readStoredTheme);

  // Apply the theme to <html> and persist it whenever it changes.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Persisting is best-effort; the attribute is what actually themes the UI.
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (VALID_THEMES.includes(next)) setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
