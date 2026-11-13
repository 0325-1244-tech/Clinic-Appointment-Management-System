// @ts-check

const KEY = 'careconnect-theme';

/**
 * Light / dark theme. Follows the operating system until the user picks one,
 * and remembers the choice in this browser only.
 */
export class Theme {
  constructor() {
    const saved = Theme.#read();
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }
  }

  get isDark() {
    const set = document.documentElement.dataset.theme;
    return set ? set === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  toggle() {
    const next = this.isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be blocked (private mode); the theme still applies for this visit.
    }
  }

  static #read() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
}
