import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bed, BriefcaseBusiness, CloudRain, Coffee, ExternalLink, Globe, MapPin, Navigation, Phone, Star, Sun, Trophy, Utensils } from 'lucide-react';
import type { Coordinates } from '../types/itinerary';
import { fetchDetails, fetchDiscover, fetchWeatherNow, type DiscoverCategory, type DiscoverPlace, type PlaceDetails, type WeatherNow } from '../services/discoverService';
import { storage } from '../services/storage';
import { BottomSheet } from './ui';
import { fetchMapsKey, loadGoogleMaps } from '../services/mapsLoader';
import { DataSourcesLink } from '../pages/LegalPages';

const CATS: Array<{ id: DiscoverCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'best', label: 'Best of best', icon: Trophy },
  { id: 'cafes', label: 'Cafés', icon: Coffee },
  { id: 'hostels', label: 'Hostels', icon: Bed },
  { id: 'agencies', label: 'Agencies', icon: BriefcaseBusiness },
  { id: 'food', label: 'Food', icon: Utensils }
];

interface Props { center: Coordinates; cityName: string; onBack: () => void }

export const MapExplorerView: React.FC<Props> = ({ center, cityName, onBack }) => {
  const [category, setCategory] = useState<DiscoverCategory>('best');
  const [places, setPlaces] = useState<DiscoverPlace[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [source, setSource] = useState<'google_places' | 'curated'>('curated');
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const offline = storage.isOffline();
  const mapDiv = useRef<HTMLDivElement>(null);
  const gMap = useRef<any>(null);
  const gMarkers = useRef<any[]>([]);
  const [mapState, setMapState] = useState<'loading' | 'live' | 'drawing'>('loading');

  // Real map when the key is available; the drawn map stays as a fallback if it can't load.
  useEffect(() => {
    let alive = true;
    fetchMapsKey().then(k => k ? loadGoogleMaps(k) : Promise.reject(new Error('no_key')))
      .then(() => alive && setMapState('live'))
      .catch(() => alive && setMapState('drawing'));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (mapState !== 'live' || !mapDiv.current || !window.google?.maps) return;
    const g = window.google.maps;
    if (!gMap.current) {
      gMap.current = new g.Map(mapDiv.current, { center: { lat: center.lat, lng: center.lng }, zoom: 14, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
      new g.Marker({ position: center, map: gMap.current, title: 'You are here', icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
    }
    gMarkers.current.forEach(m => m.setMap(null));
    gMarkers.current = (places ?? []).map((p, i) => {
      const m = new g.Marker({ position: { lat: p.coords.lat, lng: p.coords.lng }, map: gMap.current, title: `${i + 1}. ${p.name}`, label: { text: String(i + 1), color: '#fff', fontWeight: '700' } });
      m.addListener('click', () => openDetails(p));
      return m;
    });
    gMap.current.setCenter({ lat: center.lat, lng: center.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapState, places, center]);

  useEffect(() => { let a = true; fetchWeatherNow(center).then(w => a && setWeather(w)); return () => { a = false; }; }, [center]);

  useEffect(() => {
    let alive = true;
    setPlaces(null); setSelected(null); setNote(undefined);
    if (offline) { setPlaces([]); setNote('You’re offline. Reconnect to explore nearby places.'); return; }
    fetchDiscover(center, category).then(r => {
      if (!alive) return;
      setPlaces(r?.places ?? []); setSource(r?.source ?? 'curated'); setNote(r ? r.note : 'Couldn’t load places right now.');
      setSelected(r?.places[0]?.id ?? null);
    });
    return () => { alive = false; };
  }, [center, category, offline]);

  const active = places?.find(p => p.id === selected) ?? null;
  // Google's policy: Places results shown on a map must be on a Google Map, so the drawn fallback is for curated data only.
  const showDrawn = mapState !== 'live' && source !== 'google_places';

  // Project lat/lng into the SVG viewport (equirectangular, padded bounding box)
  const pins = useMemo(() => {
    const pts = [center, ...(places ?? []).map(p => p.coords)];
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const spanLat = Math.max(maxLat - minLat, 0.01), spanLng = Math.max(maxLng - minLng, 0.01);
    const pos = (c: Coordinates) => ({ x: 8 + ((c.lng - minLng) / spanLng) * 84, y: 16 + (1 - (c.lat - minLat) / spanLat) * 44 });
    return { me: pos(center), items: (places ?? []).map(p => ({ p, ...pos(p.coords) })) };
  }, [places, center]);

  const openDetails = async (p: DiscoverPlace) => {
    setSelected(p.id); setOpen(true); setDetails(null);
    if (p.source === 'google_places') setDetails((await fetchDetails(p.id))?.details ?? null);
  };

  return (
    <main className="flex-1 flex flex-col relative min-h-screen overflow-hidden bg-[#F4F5F7]">
      {mapState === 'live' && <div ref={mapDiv} className="absolute inset-0 w-full h-full" role="region" aria-label="Map of nearby places" />}
      {showDrawn && <svg className="absolute inset-0 w-full h-full" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="390" height="844" fill="#F4F5F7" />
        <g stroke="#E3E6EB" strokeWidth="12" strokeLinecap="round" fill="none"><path d="M-20 180 L140 260 L240 210 L410 280" /><path d="M70 70 L90 350 L110 500 L60 860" /><path d="M320 80 L300 320 L340 550 L310 860" /><path d="M-10 620 L150 580 L290 640 L410 590" /></g>
        <g stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none"><path d="M-40 290 Q120 280 200 380 T420 460" /><path d="M60 40 L210 260 L380 430" /><path d="M-30 450 L120 430 L220 470 L420 440" /><path d="M120 200 L180 520 L140 780" /><path d="M220 120 L270 410 L230 730" /></g>
      </svg>}
      <p className="sr-only">Map overview of {places?.length ?? 0} places near {cityName}. The list below has the same places.</p>

      <header className="relative z-20 pt-3 px-5 pb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} aria-label="Go back" className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-full flex items-center justify-center shadow-soft border border-black/5 active:scale-95">
          <ArrowLeft className="w-5 h-5 text-gray-800" />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="font-extrabold text-base text-obsidian truncate">{cityName}</h1>
        </div>
        <div role="status" className="min-h-[44px] px-3 bg-white/95 rounded-full flex items-center gap-1.5 shadow-soft border border-black/5 text-xs font-bold text-obsidian">
          {weather?.available ? (<>
            {weather.rainSoon ? <CloudRain className="w-4 h-4 text-sky-700" aria-hidden="true" /> : <Sun className="w-4 h-4 text-orange-600" aria-hidden="true" />}
            <span>{weather.tempC !== undefined ? `${weather.tempC}°` : ''} {weather.rainSoon ? 'Rain soon' : weather.summary ?? ''}</span>
          </>) : <span>Weather —</span>}
        </div>
      </header>

      <div role="radiogroup" aria-label="Place type" className="relative z-20 px-5 flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {CATS.map(c => {
          const Icon = c.icon; const on = category === c.id;
          return (
            <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c.id)}
              className={`shrink-0 min-h-[44px] px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-soft border ${on ? 'bg-brand-lime text-[#151f00] border-white/60' : 'bg-white/95 text-gray-800 border-black/5'}`}>
              <Icon className="w-4 h-4" aria-hidden="true" />{c.label}
            </button>
          );
        })}
      </div>

      {/* Pins */}
      {showDrawn && <div className="absolute inset-0 z-10 pointer-events-none">
        <span className="absolute w-4 h-4 rounded-full bg-sky-600 border-2 border-white shadow" style={{ left: `${pins.me.x}%`, top: `${pins.me.y}%`, transform: 'translate(-50%,-50%)' }} aria-hidden="true" />
        {pins.items.map(({ p, x, y }, i) => (
          <button key={p.id} type="button" onClick={() => openDetails(p)} aria-label={`${i + 1}, ${p.name}, ${p.rating} stars`}
            className="absolute pointer-events-auto w-11 h-11 flex items-center justify-center" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow-md text-[11px] font-bold text-white ${p.id === selected ? 'bg-[#EA6825] scale-125' : 'bg-[#18191B]'} transition-transform`}>
              {i + 1}
            </span>
          </button>
        ))}
      </div>}

      {/* Carousel */}
      <section aria-label="Places" className="absolute bottom-0 left-0 right-0 z-20 pb-28 pt-2">
        {places === null && <div className="mx-5 h-40 rounded-3xl bg-white/80 animate-pulse" aria-busy="true" />}
        {places && places.length === 0 && (
          <div role="status" className="mx-5 p-5 rounded-3xl bg-white/95 shadow-card text-sm text-olive-slate">{note || 'No places found.'}</div>
        )}
        {places && places.length > 0 && (
          <>
            {note && <p className="mx-5 mb-1.5 text-[11px] text-olive-slate bg-white/90 rounded-full px-3 py-1 inline-block">{note}</p>}
            {mapState === 'drawing' && source === 'google_places' && <p role="status" className="mx-5 mb-1.5 text-[11px] text-olive-slate bg-white/90 rounded-full px-3 py-1 inline-block">The map is unavailable right now. Showing the list.</p>}
            <ul className="flex items-stretch gap-3.5 px-5 overflow-x-auto no-scrollbar snap-x snap-mandatory">
              {places.map((p, i) => (
                <li key={p.id} className="shrink-0 w-[280px] snap-center">
                  <button type="button" onClick={() => openDetails(p)} aria-current={p.id === selected}
                    className={`w-full text-left bg-white rounded-[26px] p-4 shadow-card border active:scale-[0.98] transition-all ${p.id === selected ? 'border-chartreuse ring-2 ring-chartreuse/50' : 'border-black/5'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-spruce">#{i + 1} · {CATS.find(c => c.id === p.category)!.label}</span>
                        <h2 className="text-[17px] font-bold text-gray-900 leading-snug">{p.name}</h2>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{p.address}</p>
                      </div>
                      <span className="shrink-0 bg-white border border-black/10 px-2.5 py-1 rounded-full text-[11px] font-bold text-gray-800 flex items-center gap-1"><MapPin className="w-3 h-3 text-[#EA6825]" aria-hidden="true" />{p.distanceKm} km</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-xs font-semibold text-gray-700">
                      <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" aria-hidden="true" />{p.rating.toFixed(1)}</span>
                      <span className="text-gray-600">({p.reviewCount.toLocaleString()} reviews)</span>
                      {p.priceLevel && <span className="text-gray-700">· {p.priceLevel}</span>}
                      {p.openNow !== undefined && <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold ${p.openNow ? 'bg-[#b8ee30]/40 text-[#3a4f00]' : 'bg-gray-100 text-gray-700'}`}>{p.openNow ? 'Open' : 'Closed'}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mx-5 mt-2 text-[11px] text-olive-slate">{source === 'google_places' ? <>Place data from Google Maps · <DataSourcesLink /></> : <>Curated listings · <DataSourcesLink /></>}</p>
      </section>

      {open && active && (
        <BottomSheet title={active.name} subtitle={active.address} onClose={() => setOpen(false)}>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" aria-hidden="true" />{active.rating.toFixed(1)}
            <span className="text-gray-600 font-medium">({active.reviewCount.toLocaleString()} reviews)</span>
            {(details?.openNow ?? active.openNow) !== undefined && <span className="ml-auto text-xs font-bold">{(details?.openNow ?? active.openNow) ? 'Open now' : 'Closed now'}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <a href={active.mapsUrl} target="_blank" rel="noopener noreferrer" className="min-h-[56px] rounded-2xl bg-[#b8ee30] text-[#151f00] text-[11px] font-bold flex flex-col items-center justify-center gap-0.5"><Navigation className="w-5 h-5" aria-hidden="true" />Directions</a>
            {details?.phone ? <a href={`tel:${details.phone.replace(/\s/g, '')}`} className="min-h-[56px] rounded-2xl bg-white border border-black/10 text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5"><Phone className="w-5 h-5" aria-hidden="true" />Call</a> : <span className="min-h-[56px] rounded-2xl bg-gray-50 border border-black/5 text-[11px] text-gray-600 flex flex-col items-center justify-center gap-0.5"><Phone className="w-5 h-5" aria-hidden="true" />No phone</span>}
            {details?.website ? <a href={details.website} target="_blank" rel="noopener noreferrer" className="min-h-[56px] rounded-2xl bg-white border border-black/10 text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5"><Globe className="w-5 h-5" aria-hidden="true" />Website</a> : <span className="min-h-[56px] rounded-2xl bg-gray-50 border border-black/5 text-[11px] text-gray-600 flex flex-col items-center justify-center gap-0.5"><ExternalLink className="w-5 h-5" aria-hidden="true" />No site</span>}
          </div>
          {details?.hours && details.hours.length > 0 && (
            <div className="mb-4"><h3 className="text-xs font-bold text-obsidian mb-1.5">Hours</h3><ul className="text-xs text-gray-700 space-y-0.5">{details.hours.map(h => <li key={h}>{h}</li>)}</ul></div>
          )}
          <div><h3 className="text-xs font-bold text-obsidian mb-1.5">Recent reviews</h3>
            {details?.reviews?.length ? (
              <ul className="space-y-2.5">{details.reviews.map((r, i) => (
                <li key={i} className="p-3 rounded-2xl bg-white border border-black/5 text-xs text-gray-700">
                  <p className="font-semibold text-gray-900">{'★'.repeat(Math.round(r.rating))} <span className="font-medium text-gray-600">· {r.authorUri ? <a href={r.authorUri} target="_blank" rel="noopener noreferrer" className="underline">{r.author}</a> : r.author} · {r.when} · <span translate="no" className="notranslate">Google Maps</span></span></p>
                  <p className="mt-1">{r.text}</p>
                </li>))}</ul>
            ) : <p className="text-xs text-gray-600">{active.source === 'google_places' ? 'Review text isn’t available for this place right now. See all reviews in Maps.' : 'Reviews appear here when live Google data is connected.'}</p>}
          </div>
        </BottomSheet>
      )}
    </main>
  );
};
