import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemePreference = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'dailycheck:appearance';
const ThemeContext = createContext<{
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemePreference) => void;
} | null>(null);

function readTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch { /* Appearance still works when storage is unavailable. */ }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setPreference] = useState<ThemePreference>(readTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    changed();
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  function setTheme(next: ThemePreference) {
    setPreference(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the current session usable. */ }
  }
  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('Theme controls require ThemeProvider.');
  return context;
}

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const label = `Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`;
  return <button type="button" className={`icon-button ${floating ? 'floating-theme' : ''}`} aria-label={label} title={label}
    onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
    {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
  </button>;
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return <div className="theme-options" role="group" aria-label="Appearance">
    {([{ value: 'light', label: 'Light', Icon: Sun }, { value: 'dark', label: 'Dark', Icon: Moon },
      { value: 'system', label: 'System', Icon: Monitor }] as const).map(({ value, label, Icon }) =>
      <button key={value} type="button" className={theme === value ? 'active' : ''} aria-pressed={theme === value}
        onClick={() => setTheme(value)}><Icon size={18} />{label}</button>)}
  </div>;
}
