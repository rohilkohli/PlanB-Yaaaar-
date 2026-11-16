import React, { useEffect, useRef } from 'react';
import { Check, MapPin, X } from 'lucide-react';

/* ------------------------------------------------------------------ focus trap */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const items = () => Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(el => el.offsetParent !== null);
    (items()[0] ?? root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onEscape?.(); return; }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0]; const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previouslyFocused?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return ref;
}

/* ------------------------------------------------------------------ bottom sheet */

interface SheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  tall?: boolean;
}

export const BottomSheet: React.FC<SheetProps> = ({ title, subtitle, onClose, children }) => {
  const ref = useFocusTrap(true, onClose);
  const titleId = React.useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian-deep/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-t-4xl shadow-[0_-16px_40px_rgba(0,0,0,0.08)] px-5 pt-3.5 pb-8 flex flex-col max-h-[92vh] overflow-y-auto animate-slide-up border-t border-white/80 outline-none"
      >
        <div className="w-full flex justify-center pb-3" aria-hidden="true">
          <div className="w-12 h-1.5 bg-card-border rounded-full" />
        </div>
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-bold text-lg text-obsidian tracking-tight">{title}</h2>
            {subtitle && <p className="text-xs text-olive-slate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mt-1 -mr-1.5 rounded-full flex items-center justify-center text-obsidian hover:bg-white/80 active:scale-95 transition-all shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ radio cards (ARIA radiogroup, roving tabindex) */

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface RadioProps<T extends string> {
  label: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (v: T) => void;
  variant?: 'cards' | 'segmented';
}

export function RadioGroup<T extends string>({ label, value, options, onChange, variant = 'cards' }: RadioProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, dir: 1 | -1) => {
    const next = (from + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i, 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i, -1); }
  };

  if (variant === 'segmented') {
    return (
      <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
        {options.map((o, i) => {
          const sel = o.value === value;
          return (
            <button
              key={o.value}
              ref={el => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={sel}
              tabIndex={sel ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={e => onKey(e, i)}
              className={`min-h-[44px] px-2 rounded-2xl border text-center transition-all active:scale-[0.97] ${
                sel ? 'bg-white/90 border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]' : 'bg-white/65 border-white/80 hover:bg-white/85 shadow-glass-card'
              }`}
            >
              <span className="block text-sm font-bold text-obsidian">{o.label}</span>
              {o.description && <span className="block text-[11px] text-olive-slate leading-tight">{o.description}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className="space-y-2.5">
      {options.map((o, i) => {
        const sel = o.value === value;
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={e => onKey(e, i)}
            className={`w-full min-h-[44px] p-3.5 rounded-2xl text-left transition-all duration-200 border flex items-start justify-between gap-3 active:scale-[0.99] ${
              sel ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]' : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
            }`}
          >
            <span className="flex items-start gap-3 min-w-0">
              {o.icon && <span className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center text-spruce shrink-0 border border-white/80">{o.icon}</span>}
              <span className="min-w-0">
                <span className="block font-bold text-sm text-obsidian">{o.label}</span>
                {o.description && <span className="block text-xs text-olive-slate mt-0.5">{o.description}</span>}
              </span>
            </span>
            <span aria-hidden="true" className={`w-5 h-5 mt-0.5 rounded-full flex items-center justify-center shrink-0 ${sel ? 'bg-chartreuse text-obsidian' : 'bg-white/60 text-transparent'}`}>
              <Check className="w-3 h-3 stroke-[3]" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces */

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`min-h-[48px] rounded-2xl bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-xl border border-white/60 text-obsidian font-extrabold text-sm flex items-center justify-center gap-2 shadow-glass-cta active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

export const GlassButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`min-h-[44px] rounded-2xl bg-white/70 backdrop-blur-xl border border-white/80 text-obsidian font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

/** Venue photo: uses the given image, else loads the venue's live Google photo (via our server), else a placeholder. */
export const VenueImage: React.FC<{ src?: string; placeId?: string; className?: string }> = ({ src, placeId, className = '' }) => {
  const [failed, setFailed] = React.useState(false);
  const [live, setLive] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (src || !placeId?.startsWith('ChIJ') || typeof navigator !== 'undefined' && navigator.onLine === false) return;
    let alive = true;
    fetch(`/api/places/details?id=${encodeURIComponent(placeId)}`, { signal: AbortSignal.timeout(6000) })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { details?: { photoNames?: string[] } | null } | null) => {
        const name = j?.details?.photoNames?.[0];
        if (alive && name) setLive(`/api/places/photo?name=${encodeURIComponent(name)}&w=800`);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [src, placeId]);
  const url = src || live;
  if (!url || failed) {
    return (
      <div aria-hidden="true" className={`flex items-center justify-center bg-gradient-to-br from-recessed to-recessed-dark text-spruce/60 ${className}`}>
        <MapPin className="w-6 h-6" />
      </div>
    );
  }
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className={className} />;
};
