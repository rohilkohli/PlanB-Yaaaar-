/** Post-generation validation of LLM output (PRD §18: 100% of place_ids must exist in the candidate pool). */
import type { LlmHint } from '../src/core/planner';
import { toneSafe, twoSentences } from '../src/core/planner';
import type { VerifiedVenue } from '../src/types/itinerary';

export interface LlmRaw { blocks?: Array<{ place_id?: unknown; why_it_fits?: unknown; solo_tip?: unknown }> }

export type ValidationResult =
  | { ok: true; hints: LlmHint[] }
  | { ok: false; reason: string };

export function validateLlmOutput(raw: unknown, pool: VerifiedVenue[], maxBlocks = 4): ValidationResult {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as LlmRaw).blocks)) return { ok: false, reason: 'schema' };
  const blocks = (raw as LlmRaw).blocks!;
  if (blocks.length < 1 || blocks.length > maxBlocks) return { ok: false, reason: 'block_count' };
  const ids = new Set(pool.map(v => v.placeId));
  const seen = new Set<string>();
  const hints: LlmHint[] = [];
  for (const b of blocks) {
    if (typeof b?.place_id !== 'string') return { ok: false, reason: 'schema' };
    if (!ids.has(b.place_id)) return { ok: false, reason: 'unknown_place_id' };
    if (seen.has(b.place_id)) return { ok: false, reason: 'duplicate_place_id' };
    seen.add(b.place_id);
    const clean = (s: unknown) => (typeof s === 'string' && s.length <= 400 && toneSafe(s) ? twoSentences(s) : undefined);
    hints.push({ placeId: b.place_id, whyItFits: clean(b.why_it_fits), soloTip: clean(b.solo_tip) });
  }
  return { ok: true, hints };
}
