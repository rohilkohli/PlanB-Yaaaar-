/**
 * Browser speech recognition for quick adapt. Audio is handled by the browser's own speech service (in Chrome that is
 * Google's); PlanB receives only the text and never records or stores audio. Hidden where unsupported.
 */
type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };

const Ctor = (): (new () => Rec) | null => {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

export const speechSupported = () => typeof window !== 'undefined' && !!Ctor();

export interface Listener { stop: () => void }

export function listen(lang: 'en' | 'hi', on: { text: (s: string) => void; end: () => void; error: (code: string) => void }): Listener | null {
  const C = Ctor();
  if (!C) return null;
  const r = new C();
  r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  r.onresult = e => { const s = e?.results?.[0]?.[0]?.transcript; if (typeof s === 'string' && s.trim()) on.text(s); };
  r.onerror = e => on.error(String(e?.error || 'error'));
  r.onend = () => on.end();
  try { r.start(); } catch { on.error('start_failed'); return null; }
  return { stop: () => { try { r.stop(); } catch { /* already stopped */ } } };
}
