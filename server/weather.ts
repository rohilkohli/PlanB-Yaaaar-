/** F-09 (v1.1, free tier): rain nudge via Open-Meteo (no key required). */
const cache = new Map<string, { at: number; value: { rainSoon: boolean; probability: number } }>();

export async function fetchWeather(lat: number, lng: number): Promise<{ rainSoon: boolean; probability: number; available: boolean }> {
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`; // city-level; also keeps precise location out of any log
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { ...hit.value, available: true };
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&hourly=precipitation_probability&forecast_hours=3&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error('weather_http');
    const j = (await res.json()) as { hourly?: { precipitation_probability?: number[] } };
    const probs = j.hourly?.precipitation_probability ?? [];
    const probability = probs.length ? Math.max(...probs) : 0;
    const value = { rainSoon: probability >= 60, probability };
    cache.set(key, { at: Date.now(), value });
    return { ...value, available: true };
  } catch {
    return { rainSoon: false, probability: 0, available: false };
  }
}
