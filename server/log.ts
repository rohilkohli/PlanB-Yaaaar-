import { truncateCoords } from '../src/core/geo';
import type { Coordinates } from '../src/types/itinerary';

/**
 * Structured log line (Cloud Logging reads `severity` and `message` from JSON on stdout).
 * Coordinates are coarsened to city level (PRD §25); IPs are never logged.
 */
export function logEvent(name: string, props: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v && typeof v === 'object' && 'lat' in (v as object) && 'lng' in (v as object)) safe[k] = truncateCoords(v as Coordinates);
    else safe[k] = v;
  }
  const isError = name === 'server_error' || name === 'places_error';
  const severity = isError ? 'ERROR' : name === 'routes_error' ? 'WARNING' : 'INFO';
  // Cloud Error Reporting groups ERROR entries that carry a stack trace in `message` and a serviceContext.
  const message = isError && typeof safe.stack_trace === 'string' ? `${String(safe.message ?? name)}\n${safe.stack_trace}` : name;
  if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify({ severity, message, event: name, serviceContext: { service: 'planb' }, ...safe }));
}

