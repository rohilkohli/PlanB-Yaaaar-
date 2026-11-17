import { env } from './env';
import { json, type ApiRequest, type ApiResponse } from './http';
import { checkLimit } from './ratelimit';
import { adapt, ApiError, generate, logEvent, swap } from './pipeline';
import { autocomplete, reverseGeocode } from './places';
import { CITIES } from '../src/data/placesData';
import { fetchWeather } from './weather';
import { recordEvent } from './events';
import { discover, placeDetails, placePhoto, placePhotoRefs, placeSummary, DISCOVER_CATEGORIES, type DiscoverCategory } from './discover';

async function limited(req: ApiRequest, bucket: string, limit: number): Promise<ApiResponse | null> {
  const r = await checkLimit(req.ip, bucket, limit);
  if (r.allowed) return null;
  return json(429, {
    error: 'rate_limited',
    message: bucket === 'generate'
      ? 'You’ve reached today’s plan limit. Your saved plan is still available below.'
      : 'You’ve reached today’s change limit. Your current plan is saved below.'
  }, { 'Retry-After': String(r.retryAfterSec), 'X-RateLimit-Limit': String(r.limit), 'X-RateLimit-Remaining': '0' });
}

export async function handle(req: ApiRequest): Promise<ApiResponse> {
  const e = env();
  try {
    switch (`${req.method} ${req.path}`) {
      case 'GET /api/config':
        // Browser-safe values only. The Maps key is restricted to PlanB's domains by Google (HTTP referrers).
        return json(200, {
          mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
          contactEmail: process.env.CONTACT_EMAIL || null,
          // false (default) = Places content is never stored on the device (Google Places policy); true only after counsel's OK
          placesOfflineStorage: process.env.PLACES_OFFLINE_STORAGE === 'allow'
        });
      case 'GET /api/health':
        return json(200, { ok: true, mode: { places: !!e.placesKey, llm: !!e.geminiKey && !e.deterministicOnly, deterministicOnly: e.deterministicOnly } });

      case 'POST /api/plan/generate': {
        const lim = await limited(req, 'generate', e.limitGenerate); if (lim) return lim;
        const out = await generate(req.body);
        logEvent('plan_generated_server', { city: out.plan.city.id, latency_ms: out.meta.latencyMs, used_fallback: out.meta.usedFallback, reason: out.meta.fallbackReason ?? 'none', source: out.meta.source, blocks: out.plan.blocks.length });
        return json(200, out);
      }
      case 'POST /api/plan/adapt': {
        const lim = await limited(req, 'adapt', e.limitAdapt); if (lim) return lim;
        const out = await adapt(req.body);
        logEvent('plan_adapted_server', { latency_ms: out.meta.latencyMs, used_fallback: out.meta.usedFallback, reason: out.meta.fallbackReason ?? 'none', source: out.meta.source });
        return json(200, out);
      }
      case 'POST /api/plan/swap': {
        const lim = await limited(req, 'swap', e.limitSwap); if (lim) return lim;
        return json(200, await swap(req.body));
      }
      case 'GET /api/places/autocomplete': {
        const q = (req.query.get('q') || '').trim().slice(0, 60);
        if (q.length < 2) return json(200, { suggestions: [] });
        const curated = CITIES.filter(c => c.name.toLowerCase().includes(q.toLowerCase())).map(c => ({ text: `${c.name}, ${c.country}`, cityId: c.id }));
        let live: Array<{ text: string; cityId?: string }> = [];
        try { live = await autocomplete(q); } catch { /* optional */ }
        return json(200, { suggestions: [...curated, ...live].slice(0, 6) });
      }
      case 'GET /api/geocode/reverse': {
        const lat = Number(req.query.get('lat')); const lng = Number(req.query.get('lng'));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(400, { error: 'bad_request' });
        try {
          const r = await reverseGeocode({ lat, lng });
          return json(200, { place: r });
        } catch { return json(200, { place: null }); }
      }
      case 'GET /api/weather': {
        const lat = Number(req.query.get('lat')); const lng = Number(req.query.get('lng'));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(400, { error: 'bad_request' });
        return json(200, await fetchWeather(lat, lng));
      }
      case 'GET /api/places/discover': {
        const lat = Number(req.query.get('lat')); const lng = Number(req.query.get('lng'));
        const category = req.query.get('category') as DiscoverCategory;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !DISCOVER_CATEGORIES.includes(category)) return json(400, { error: 'bad_request' });
        const lim = await limited(req, 'discover', 120); if (lim) return lim;
        return json(200, await discover({ center: { lat, lng }, category, radiusM: Number(req.query.get('radius')) || undefined }));
      }
      case 'GET /api/places/details': {
        const id = req.query.get('id') || '';
        const lim = await limited(req, 'details', 120); if (lim) return lim;
        const d = await placeDetails(id).catch(() => null);
        return d ? json(200, { details: d }) : json(200, { details: null });
      }
      case 'GET /api/places/photo-refs': {
        const lim = await limited(req, 'photo-refs', 300); if (lim) return lim;
        return json(200, { photos: await placePhotoRefs(req.query.get('id') || '').catch(() => []) }, { 'Cache-Control': 'private, no-store' });
      }
      case 'GET /api/places/summary': {
        const lim = await limited(req, 'summary', 300); if (lim) return lim;
        return json(200, { summary: await placeSummary(req.query.get('id') || '').catch(() => null) }, { 'Cache-Control': 'private, no-store' });
      }
      case 'GET /api/places/photo': {
        const name = req.query.get('name') || '';
        const lim = await limited(req, 'photo', 300); if (lim) return lim;
        const img = await placePhoto(name, Number(req.query.get('w')) || 800);
        if (!img) return json(404, { error: 'no_photo' });
        return { status: 200, body: Buffer.from(img.bytes), headers: { 'Content-Type': img.type, 'Cache-Control': 'private, no-store' } };
      }
      case 'POST /api/csp-report': {
        const lim = await limited(req, 'csp', 60); if (lim) return lim;
        const r = ((req.body as any)?.['csp-report'] ?? req.body ?? {}) as Record<string, unknown>;
        logEvent('csp_violation', { directive: String(r['violated-directive'] ?? r['effectiveDirective'] ?? '').slice(0, 80), blocked: String(r['blocked-uri'] ?? r['blockedURL'] ?? '').slice(0, 200), document: String(r['document-uri'] ?? '').slice(0, 120) });
        return { status: 204 };
      }
      case 'POST /api/events': {
        const lim = await limited(req, 'events', e.limitEvents); if (lim) return lim;
        recordEvent(req.body);
        return { status: 204 };
      }
      default:
        return json(404, { error: 'not_found' });
    }
  } catch (err) {
    if (err instanceof ApiError) return json(err.status, { error: err.code, message: err.message });
    const status = (err as { status?: number })?.status;
    if (status === 413 || status === 400) return json(status, { error: (err as Error).message });
    logEvent('server_error', { message: (err as Error)?.message, stack_trace: (err as Error)?.stack?.split('\n').slice(0, 12).join('\n') });
    return json(500, { error: 'server_error', message: 'Something went wrong on our side. Your saved plan is untouched.' });
  }
}
