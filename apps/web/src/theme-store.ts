import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'bang:theme';
const listeners = new Set<() => void>();

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    // Blocked storage only loses the per-viewer preference.
    return 'light';
  }
}

let current: Theme = typeof window === 'undefined' ? 'light' : readStoredTheme();

/** Applies the stored preference before the first render to avoid a theme flash. */
export function applyStoredTheme() {
  document.documentElement.dataset['theme'] = current;
}

export function setTheme(theme: Theme) {
  current = theme;
  document.documentElement.dataset['theme'] = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The choice still applies to this page.
  }
  listeners.forEach((listener) => listener());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => 'light',
  );
}
