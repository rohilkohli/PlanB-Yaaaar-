import React, { useEffect, useState } from 'react';
import { Compass, Train, Coffee, Landmark, X } from 'lucide-react';

interface GeneratingTransitionProps {
  cityName: string;
  onComplete: () => void;
  onCancel: () => void;
  isQuickDemo?: boolean;
}

export const GeneratingTransition: React.FC<GeneratingTransitionProps> = ({
  cityName,
  onComplete,
  onCancel,
  isQuickDemo = false
}) => {
  const [percent, setPercent] = useState(isQuickDemo ? 60 : 20);

  useEffect(() => {
    let current = isQuickDemo ? 60 : 20;
    const interval = setInterval(() => {
      current += isQuickDemo ? 25 : 15;
      if (current > 100) current = 100;
      setPercent(current);

      if (current >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          onComplete();
        }, 300);
      }
    }, isQuickDemo ? 100 : 200);

    return () => clearInterval(interval);
  }, [cityName, isQuickDemo, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col justify-between px-6 pt-safe pb-safe animate-fade-in">
      {/* Top Bar */}
      <div className="flex items-center justify-between py-4">
        <span className="font-extrabold text-base text-obsidian tracking-tight">PlanB</span>
        <button
          type="button"
          onClick={onCancel}
          className="w-8 h-8 rounded-full bg-white border border-card-border flex items-center justify-center text-obsidian hover:bg-recessed transition-colors active:scale-90"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Kinetic Radar & Orbiting Waypoints */}
      <div className="relative w-64 h-64 mx-auto flex items-center justify-center my-4">
        <div className="absolute inset-4 rounded-full bg-chartreuse/20 blur-3xl animate-pulse" />
        <div
          className="absolute inset-2 rounded-full border border-dashed border-chartreuse/60 animate-spin"
          style={{ animationDuration: '24s' }}
        />
        <div className="absolute inset-8 rounded-full border border-card-border/60" />

        {/* Orbiting Icons */}
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{ animationDuration: '10s', animationTimingFunction: 'linear' }}
        >
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-float flex items-center justify-center text-spruce">
            <Train className="w-3.5 h-3.5" />
          </div>
          <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-7 h-7 rounded-full bg-chartreuse shadow-sm flex items-center justify-center text-obsidian">
            <Coffee className="w-3.5 h-3.5" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-float flex items-center justify-center text-coral">
            <Landmark className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Center Percentage */}
        <div className="relative z-10 w-28 h-28 rounded-full bg-white shadow-float flex flex-col items-center justify-center border border-card-border">
          <Compass className="w-6 h-6 text-spruce animate-spin mb-1" style={{ animationDuration: '6s' }} />
          <div className="flex items-baseline justify-center">
            <span className="font-bold text-2xl text-obsidian tracking-tight">{percent}</span>
            <span className="text-xs font-semibold text-spruce ml-0.5">%</span>
          </div>
        </div>
      </div>

      {/* Simple Status Copy */}
      <div className="flex flex-col items-center text-center pb-8">
        <h3 className="text-base font-bold text-obsidian">
          Setting up {cityName}...
        </h3>
        <p className="text-xs text-olive-slate mt-0.5">
          Checking open hours and walking routes
        </p>
      </div>
    </div>
  );
};
