/** Loads the Google Maps JavaScript API once. The key is referrer-restricted and served by our /api/config. */
declare global { interface Window { google?: any } }

let promise: Promise<any> | null = null;
let keyPromise: Promise<string | null> | null = null;

export function fetchMapsKey(): Promise<string | null> {
  keyPromise ??= fetch('/api/config', { signal: AbortSignal.timeout(4000) })
    .then(r => (r.ok ? r.json() : null))
    .then((j: { mapsKey?: string | null } | null) => j?.mapsKey ?? null)
    .catch(() => null);
  return keyPromise;
}

export function loadGoogleMaps(key: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  promise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    s.async = true;
    s.onload = () => (window.google?.maps ? resolve(window.google.maps) : reject(new Error('maps_unavailable')));
    s.onerror = () => reject(new Error('maps_script_failed'));
    document.head.appendChild(s);
  });
  return promise;
}
