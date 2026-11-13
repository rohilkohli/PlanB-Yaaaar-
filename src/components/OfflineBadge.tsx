import React from 'react';
import { WifiOff } from 'lucide-react';

export const OFFLINE_MESSAGE = 'Offline mode — your plan and addresses are saved. Reconnect to adapt.';

export const OfflineBadge: React.FC<{ isOffline: boolean }> = ({ isOffline }) => {
  if (!isOffline) return null;
  return (
    <div role="status" className="w-full bg-amber-50 border border-amber-300 rounded-2xl p-3 mb-3 flex items-start gap-2.5 text-amber-950 shadow-sm animate-fade-in">
      <WifiOff className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="flex-1 text-xs leading-relaxed">{OFFLINE_MESSAGE}</p>
    </div>
  );
};
