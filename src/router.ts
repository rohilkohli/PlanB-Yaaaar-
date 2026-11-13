/**
 * Minimal History-API router for the PRD sitemap:
 *   /  ·  /today  ·  /today#adapt  ·  /today#swap-[blockId]  ·  /preferences  (+ /explore)
 */
import { useCallback, useEffect, useState } from 'react';

export interface Route { path: string; hash: string; search: string }

const read = (): Route => ({
  path: window.location.pathname.replace(/\/+$/, '') || '/',
  hash: window.location.hash.replace(/^#/, ''),
  search: window.location.search
});

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (to === current) return;
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event('planb:nav'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    window.addEventListener('planb:nav', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
      window.removeEventListener('planb:nav', on);
    };
  }, []);
  return route;
}

export function useNavigate() {
  return useCallback(navigate, []);
}
