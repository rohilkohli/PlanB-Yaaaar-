/** Time helpers. All "minutes" values are minutes since local midnight. */

export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60 + 30;
  const cleaned = timeStr.trim();
  const isPM = /pm/i.test(cleaned);
  const isAM = /am/i.test(cleaned);
  const parts = cleaned.replace(/[^\d:]/g, '').split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const mins = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + mins;
}

export function minutesToTimeString(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(m / 60);
  const mins = m % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${mins < 10 ? '0' + mins : mins} ${period}`;
}

export function minutesToHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Offset (minutes east of UTC) of an IANA zone at a given instant. */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const p: Record<string, number> = {};
    for (const part of dtf.formatToParts(at)) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Current local minutes-since-midnight and ISO date in a zone. */
export function localNow(timeZone: string, at: Date = new Date()): { minutes: number; date: string } {
  const off = tzOffsetMinutes(timeZone, at);
  const local = new Date(at.getTime() + off * 60000);
  return {
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    date: local.toISOString().slice(0, 10)
  };
}
