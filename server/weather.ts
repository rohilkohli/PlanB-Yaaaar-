/** Weather (F-09): Google Weather API when a key is set, Open-Meteo (no key) otherwise. Coordinates are rounded to ~city level. */
const cache = new Map<string, { at: number; value: WeatherNow }>();

export interface WeatherNow { rainSoon: boolean; probability: number; tempC?: number; summary?: string; available: boolean }

const CODES: Array<[number, string]> = [[0, 'Clear'], [3, 'Partly cloudy'], [48, 'Fog'], [57, 'Drizzle'], [67, 'Rain'], [77, 'Snow'], [82, 'Showers'], [99, 'Thunderstorm']];
const describe = (code: number) => CODES.find(([max]) => code <= max)?.[1] ?? 'Mixed';

async function googleWeather(lat: number, lng: number, key: string): Promise<WeatherNow | null> {
  try {
    const res = await fetch(`https://weather.googleapis.com/v1/currentConditions:lookup?key=${key}&location.latitude=${lat.toFixed(2)}&location.longitude=${lng.toFixed(2)}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const j = (await res.json()) as { weatherCondition?: { type?: string; description?: { text?: string } }; temperature?: { degrees?: number }; precipitation?: { probability?: { percent?: number } } };
    const type = j.weatherCondition?.type ?? '';
    const probability = j.precipitation?.probability?.percent ?? 0;
    return {
      available: true,
      probability,
      rainSoon: probability >= 60 || /RAIN|SHOWER|THUNDER|DRIZZLE/.test(type),
      tempC: j.temperature?.degrees !== undefined ? Math.round(j.temperature.degrees) : undefined,
      summary: j.weatherCondition?.description?.text
    };
  } catch { return null; }
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherNow> {
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  // Weather API has its own field-level caching rules; default off. WEATHER_CACHE_SEC>0 enables a short cache.
  const ttlMs = Number(process.env.WEATHER_CACHE_SEC || 0) * 1000;
  const hit = cache.get(key);
  if (ttlMs > 0 && hit && Date.now() - hit.at < ttlMs) return hit.value;
  const key2 = process.env.GOOGLE_PLACES_API_KEY;
  if (key2) {
    const g = await googleWeather(lat, lng, key2);
    if (g) { cache.set(key, { at: Date.now(), value: g }); return g; }
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&current=temperature_2m,weather_code&hourly=precipitation_probability&forecast_hours=3&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error('weather_http');
    const j = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number }; hourly?: { precipitation_probability?: number[] } };
    const probs = j.hourly?.precipitation_probability ?? [];
    const probability = probs.length ? Math.max(...probs) : 0;
    const value: WeatherNow = {
      rainSoon: probability >= 60, probability, available: true,
      tempC: j.current?.temperature_2m !== undefined ? Math.round(j.current.temperature_2m) : undefined,
      summary: j.current?.weather_code !== undefined ? describe(j.current.weather_code) : undefined
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return { rainSoon: false, probability: 0, available: false };
  }
}
