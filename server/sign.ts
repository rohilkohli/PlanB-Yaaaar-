/**
 * Plan integrity: the server signs every plan it returns (HMAC-SHA256 over the fields that matter for
 * booking-like decisions: plan id, city, date, block ids, venues and times). adapt/swap accept only plans
 * whose signature still matches, so a plan edited on the phone cannot be used to trigger paid lookups
 * or to inject venues. Status and undo snapshots are not signed (they don't change which venues are used).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DayPlan } from '../src/types/itinerary';

const DEV_KEY = 'planb-dev-only-signing-key';

function key(): string | null {
  if (process.env.PLAN_SIGNING_KEY) return process.env.PLAN_SIGNING_KEY;
  return process.env.NODE_ENV === 'production' ? null : DEV_KEY;
}

export function canonical(plan: Pick<DayPlan, 'planId' | 'city' | 'calibration' | 'blocks'>): string {
  return JSON.stringify({
    planId: plan.planId,
    city: plan.city?.id,
    date: plan.calibration?.date,
    blocks: (plan.blocks ?? []).map(b => [b.blockId, b.venue?.placeId, b.startMinutes, b.endMinutes])
  });
}

export function signPlan(plan: DayPlan): string | undefined {
  const k = key();
  if (!k) return undefined; // production without a key: plans are unsigned and adapt/swap will refuse them
  return createHmac('sha256', k).update(canonical(plan)).digest('base64url');
}

export function verifyPlan(plan: DayPlan & { signature?: string }): boolean {
  const k = key();
  if (!k || !plan.signature) return false;
  const expected = Buffer.from(createHmac('sha256', k).update(canonical(plan)).digest('base64url'));
  const got = Buffer.from(String(plan.signature));
  return expected.length === got.length && timingSafeEqual(expected, got);
}
