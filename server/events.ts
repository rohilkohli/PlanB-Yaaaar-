/** Anonymous analytics intake (PRD §28). Only whitelisted events/properties; no IDs, no precise location. */
const TAXONOMY: Record<string, string[]> = {
  calibration_started: ['entry_source', 'used_gps'],
  plan_generated: ['city', 'energy', 'budget', 'after_dark', 'social', 'latency_ms', 'used_fallback'],
  block_maps_clicked: ['block_sequence', 'category', 'is_adapted'],
  day_adapted: ['triggers', 'completed_count', 'latency_ms'],
  block_swapped: ['block_sequence', 'swap_reason'],
  adaptation_undone: ['action_type'],
  venue_issue_flagged: ['flag_reason'],
  next_day_returned: ['days_since_first_plan']
};

export function sanitizeEvent(body: any): { name: string; props: Record<string, unknown> } | null {
  const name = body?.name;
  if (typeof name !== 'string' || !(name in TAXONOMY)) return null;
  const props: Record<string, unknown> = {};
  for (const k of TAXONOMY[name]) {
    const v = body?.props?.[k];
    if (typeof v === 'string') props[k] = v.slice(0, 40);
    else if (typeof v === 'number' || typeof v === 'boolean') props[k] = v;
    else if (Array.isArray(v)) props[k] = v.filter(x => typeof x === 'string').slice(0, 8).map((x: string) => x.slice(0, 30));
  }
  return { name, props };
}

export function recordEvent(body: unknown) {
  const e = sanitizeEvent(body);
  if (!e) return;
  if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify({ t: new Date().toISOString(), analytics: e.name, ...e.props }));
}
