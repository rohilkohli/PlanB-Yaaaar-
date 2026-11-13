import React from 'react';
import { WifiOff } from 'lucide-react';

interface OfflineBadgeProps {
  isOffline: boolean;
}

export const OfflineBadge: React.FC<OfflineBadgeProps> = ({ isOffline }) => {
  if (!isOffline) return null;

  return (
    <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 flex items-start gap-2.5 text-amber-900 shadow-sm animate-fade-in">
      <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs leading-relaxed">
        <strong>Offline mode active.</strong> Saved plan and walking directions are ready to use offline.
      </div>
    </div>
  );
};

