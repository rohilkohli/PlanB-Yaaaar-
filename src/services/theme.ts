/**
 * Theme: System (default, follows the phone) / Light / Dark. A choice is stored on this phone only and applied through
 * `data-theme` on <html>; CSS does the rest (see globals.css). public/theme-init.js applies it before first paint.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'planb_theme';
const EVENT = 'planb:theme';

export function getThemeChoice(): ThemeChoice {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

/** The theme actually in effect right now. */
export function resolvedTheme(): Theme {
  const c = getThemeChoice();
  return c === 'system' ? (systemDark() ? 'dark' : 'light') : c;
}

const BAR = { light: '#F8FBF1', dark: '#11140E' };

/** Sync <html data-theme> and the browser bar colours with the current choice. */
export function applyTheme(): void {
  const c = getThemeChoice();
  const root = document.documentElement;
  if (c === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', c);
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach(m => {
    const forDark = /dark/.test(m.dataset.planbMedia ?? m.getAttribute('media') ?? '');
    m.dataset.planbMedia ??= m.getAttribute('media') ?? '';
    if (c === 'system') m.setAttribute('media', m.dataset.planbMedia);
    else m.setAttribute('media', (c === 'dark') === forDark ? 'all' : 'not all'); // only the chosen colour applies
    m.content = forDark ? BAR.dark : BAR.light;
  });
  window.dispatchEvent(new Event(EVENT));
}

export function setThemeChoice(c: ThemeChoice): void {
  try { if (c === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch { /* private mode: applies for this visit only */ }
  applyTheme();
}

/** Calls `fn` whenever the effective theme may have changed (a new choice, or the phone switching day/night). */
export function onThemeChange(fn: (t: Theme) => void): () => void {
  const run = () => fn(resolvedTheme());
  window.addEventListener(EVENT, run);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', run);
  return () => { window.removeEventListener(EVENT, run); mq?.removeEventListener?.('change', run); };
}
