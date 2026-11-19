import React, { useState, useEffect } from 'react';
import { Sliders, Compass, Sparkles, Globe, Map as MapIcon } from 'lucide-react';
import { t } from '../i18n';

interface NavigationDockProps {
  activeTab: 'calibrate' | 'today' | 'explore' | 'map';
  onSelectTab: (tab: 'calibrate' | 'today' | 'explore' | 'map') => void;
  onOpenAdapt: () => void;
  hasActivePlan: boolean;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeTab,
  onSelectTab,
  onOpenAdapt,
  hasActivePlan
}) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Shrink after 24px of scroll down; expand back at top
          setIsScrolled(window.scrollY > 24);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <nav aria-label="Primary" className="fixed bottom-0 left-0 right-0 z-40 pb-safe px-4 pointer-events-none flex justify-center">
      <div
        className={`pointer-events-auto rounded-full border border-edge/80 shadow-[0_16px_40px_-8px_rgba(20,20,20,0.12)] flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isScrolled
            ? 'h-14 px-3 gap-2.5 mb-2 scale-95 bg-surface/75 backdrop-blur-2xl shadow-md'
            : 'h-16 px-4 gap-3.5 mb-4 scale-100 bg-surface/85 backdrop-blur-2xl shadow-dock'
        }`}
      >
        {/* Calibrate Icon Only */}
        <button
          type="button"
          onClick={() => onSelectTab('calibrate')}
          title={t('nav.plan')}
          aria-label={t('nav.plan')}
          aria-current={activeTab === 'calibrate' ? 'page' : undefined}
          className={`flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
            'w-11 h-11'
          } ${
            activeTab === 'calibrate'
              ? 'bg-linear-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-edge/60 text-obsidian shadow-[0_4px_14px_rgba(184,238,48,0.4)] ring-2 ring-chartreuse/40'
              : 'text-olive-slate hover:text-obsidian hover:bg-surface/60'
          }`}
        >
          <Sliders className={`transition-all duration-200 ${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} />
        </button>

        {/* Today (Active Canvas) Icon Only */}
        <button
          type="button"
          onClick={() => onSelectTab('today')}
          title="Today"
          aria-label="Today"
          aria-current={activeTab === 'today' ? 'page' : undefined}
          className={`flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
            'w-11 h-11'
          } ${
            activeTab === 'today'
              ? 'bg-linear-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-edge/60 text-obsidian shadow-[0_4px_14px_rgba(184,238,48,0.4)] ring-2 ring-chartreuse/40'
              : 'text-olive-slate hover:text-obsidian hover:bg-surface/60'
          }`}
        >
          <Compass className={`transition-all duration-200 ${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} />
        </button>

        {/* Adapt Trigger Icon Only */}
        <button
          type="button"
          onClick={onOpenAdapt}
          disabled={!hasActivePlan}
          title={hasActivePlan ? t('nav.adapt') : 'Build a plan first'}
          aria-label={t('nav.adapt')}
          className={`relative flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
            'w-11 h-11'
          } ${
            hasActivePlan
              ? 'text-spruce hover:text-obsidian hover:bg-surface/60'
              : 'opacity-35 cursor-not-allowed text-cool-gray'
          }`}
        >
          <Sparkles className={`transition-all duration-200 ${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} />
          {hasActivePlan && (
            <span aria-hidden="true" className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-chartreuse ring-1 ring-edge" />
          )}
        </button>

        {/* Map Explorer */}
        <button
          type="button"
          onClick={() => onSelectTab('map')}
          title={t('nav.map')}
          aria-label={t('nav.map')}
          aria-current={activeTab === 'map' ? 'page' : undefined}
          className={`flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 w-11 h-11 ${
            activeTab === 'map'
              ? 'bg-linear-to-r from-chartreuse/95 to-[#A3D70F]/90 border border-edge/60 text-obsidian ring-2 ring-chartreuse/40'
              : 'text-olive-slate hover:text-obsidian hover:bg-surface/60'
          }`}
        >
          <MapIcon className={`transition-all duration-200 ${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} />
        </button>

        {/* Explore Curated Gallery Icon Only */}
        <button
          type="button"
          onClick={() => onSelectTab('explore')}
          title="Explore"
          aria-label="Explore"
          aria-current={activeTab === 'explore' ? 'page' : undefined}
          className={`flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
            'w-11 h-11'
          } ${
            activeTab === 'explore'
              ? 'bg-linear-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-edge/60 text-obsidian shadow-[0_4px_14px_rgba(184,238,48,0.4)] ring-2 ring-chartreuse/40'
              : 'text-olive-slate hover:text-obsidian hover:bg-surface/60'
          }`}
        >
          <Globe className={`transition-all duration-200 ${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} />
        </button>
      </div>
    </nav>
  );
};
