import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, Navigation } from 'lucide-react';
import { minutesToTimeString } from '../core/time';
import { navigate } from '../router';

interface ViewBlock { id: string; start: number; end: number; status: string; category: string; source: 'curated' | 'google'; name?: string; placeId?: string; note?: string }
interface Payload {
  view: { kind: 'share' | 'recap'; city: string; date: string; tz: string; blocks: ViewBlock[] };
  location: { lat: number; lng: number; at: number } | null;
  checkin: { status: 'safe' | 'help'; at: number } | null;
  serverNow: number;
}

const STATUS: Record<string, string> = { completed: 'Done', in_progress: 'Now', skipped: 'Skipped', upcoming: 'Up next' };
const CAT: Record<string, string> = { viewpoint: 'Viewpoint', dining: 'Food', cafe: 'Café', culture: 'Culture', walk: 'Walk', bakery: 'Bakery', market: 'Market' };

function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

/** Read-only page for a traveler's contact (/s/…) or for a shared recap (/r/…). No account, no tracking. */
export const SharedPage: React.FC<{ kind: 'share' | 'recap'; token: string }> = ({ kind, token }) => {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [skew, setSkew] = useState(0); // server clock minus this phone's clock, so "seen N min ago" is right even if the phone's clock is off

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/${kind === 'share' ? 'share' : 'recap'}/view?t=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j?.message || 'This link is not available.'); setData(null); return; }
      setError(null); setData(j as Payload); setSkew((j as Payload).serverNow - Date.now());
    } catch { /* keep the last good data; the next poll retries */ }
  }, [kind, token]);

  useEffect(() => {
    load();
    if (kind !== 'share') return;
    const id = setInterval(load, 20_000);
    const clock = setInterval(() => setTick(n => n + 1), 30_000);
    return () => { clearInterval(id); clearInterval(clock); };
  }, [load, kind]);

  // Google venues are named live by Google (never stored by PlanB).
  useEffect(() => {
    const need = (data?.view.blocks ?? []).filter(b => b.source === 'google' && b.placeId && !names[b.placeId]);
    need.forEach(async b => {
      try {
        const r = await fetch(`/api/places/summary?id=${encodeURIComponent(b.placeId as string)}`);
        const j = await r.json();
        if (j?.summary?.name) setNames(n => ({ ...n, [b.placeId as string]: j.summary.name }));
      } catch { /* leave the generic label */ }
    });
  }, [data, names]);

  useEffect(() => { document.title = kind === 'share' ? 'Shared day · PlanB' : 'Day recap · PlanB'; }, [kind]);

  const hhmm = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

  if (error) return (
    <main className="flex-1 px-5 pt-10 pb-24">
      <h1 className="font-extrabold text-2xl text-obsidian">PlanB</h1>
      <p role="status" className="mt-4 text-sm text-olive-slate">{error}</p>
      <button type="button" onClick={() => navigate('/')} className="mt-4 min-h-[44px] px-5 rounded-full bg-chartreuse text-obsidian text-sm font-bold">Plan your own day</button>
    </main>
  );
  if (!data) return <main className="flex-1 px-5 pt-10"><p role="status" className="text-sm text-olive-slate">Loading…</p></main>;

  const { view } = data;
  const age = data.location ? Date.now() + skew - data.location.at + tick * 0 : null;
  const stale = age !== null && age > 15 * 60_000;
  return (
    <main className="flex-1 px-5 pt-6 pb-24">
      <p className="text-xs font-bold text-spruce uppercase tracking-wide">{kind === 'share' ? 'Shared with you' : 'Day recap'}</p>
      <h1 className="font-extrabold text-2xl text-obsidian tracking-tight mt-1">{view.city}</h1>
      <p className="text-sm text-olive-slate">{new Date(view.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      {kind === 'share' && data.checkin && (
        data.checkin.status === 'safe'
          ? <p role="status" className="mt-4 p-3.5 rounded-2xl bg-lime-50 border border-lime-200 text-sm font-semibold text-spruce flex gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />Checked in safe at {hhmm(data.checkin.at, view.tz)}.</p>
          : <p role="alert" className="mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-sm font-semibold text-red-900 flex gap-2"><AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />They asked for help at {hhmm(data.checkin.at, view.tz)}. Try calling them now. In an emergency call 112.</p>
      )}

      {kind === 'share' && (
        <section aria-label="Last known location" className="mt-4 p-3.5 rounded-2xl bg-surface/85 border border-card-border">
          {data.location ? (
            <>
              <p className="text-sm font-bold text-obsidian flex items-center gap-2"><MapPin className="w-4 h-4 text-spruce" aria-hidden="true" />Last seen {ago(age as number)}</p>
              {stale && <p className="text-xs text-amber-900 mt-1">No recent update. Their phone may be offline, or PlanB may be closed.</p>}
              <a href={`https://www.google.com/maps?q=${data.location.lat},${data.location.lng}`} target="_blank" rel="noopener noreferrer" className="mt-2 min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-sm font-bold inline-flex items-center gap-2"><Navigation className="w-4 h-4" aria-hidden="true" />Open in <span translate="no">Google Maps</span></a>
            </>
          ) : <p className="text-sm text-olive-slate">Waiting for their first location update. They need to have PlanB open on their phone.</p>}
        </section>
      )}

      <h2 className="mt-6 font-bold text-base text-obsidian">{kind === 'share' ? 'Their plan' : 'The stops'}</h2>
      <ol className="mt-2 flex flex-col gap-3">
        {view.blocks.map(b => {
          const name = b.name ?? (b.placeId ? names[b.placeId] : undefined) ?? 'A local stop';
          return (
            <li key={b.id} className="p-3.5 rounded-2xl bg-surface/85 border border-card-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-olive-slate">{minutesToTimeString(b.start)} – {minutesToTimeString(b.end)} · {CAT[b.category] ?? 'Stop'}</p>
                  <h3 className="font-bold text-sm text-obsidian mt-0.5" translate={b.source === 'google' ? 'no' : undefined}>{name}</h3>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${b.status === 'completed' ? 'bg-lime-100 text-spruce' : b.status === 'skipped' ? 'bg-gray-100 text-gray-700' : 'bg-surface border border-card-border text-obsidian'}`}>{STATUS[b.status] ?? 'Up next'}</span>
              </div>
              {b.note && <p className="mt-2 text-sm text-obsidian italic">“{b.note}”</p>}
              {b.placeId && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(b.placeId)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block min-h-[44px] leading-[44px] text-xs font-semibold underline">View on <span translate="no">Google Maps</span></a>}
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-xs text-olive-slate">{kind === 'share'
        ? 'This page updates by itself while sharing is on. The traveller can stop sharing at any time. PlanB is not an emergency service. In an emergency call 112.'
        : 'Shared by a PlanB traveller. This link is private to whoever has it and stops working after 30 days.'}</p>
      <button type="button" onClick={() => navigate('/')} className="mt-4 min-h-[44px] px-5 rounded-full bg-surface border border-card-border text-obsidian text-sm font-bold">Plan your own day with PlanB</button>
    </main>
  );
};
