/** Build a Date for a wall-clock time in the business time zone (Raleigh, America/New_York). */
export const BUSINESS_TZ = 'America/New_York';

function tzOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - date.getTime()) / 60000;
}

/** Local (business-TZ) date parts for a Date. */
export function businessParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), weekday: get('weekday') };
}

/** Date at y-m-d h:mm in the business TZ. */
export function businessDate(y, m, d, h, min) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const off = tzOffsetMinutes(guess, BUSINESS_TZ);
  const out = new Date(guess.getTime() - off * 60000);
  // DST edge: recompute once with the corrected offset.
  const off2 = tzOffsetMinutes(out, BUSINESS_TZ);
  return off2 === off ? out : new Date(guess.getTime() - off2 * 60000);
}

/** Next `count` weekday slots at the given wall-clock times, starting tomorrow (business TZ). */
export function weekdaySlots(now, times, count) {
  const out = [];
  const start = new Date(now.getTime() + 86400000);
  for (let i = 0; out.length < count && i < 60; i++) {
    const day = new Date(start.getTime() + i * 86400000);
    const p = businessParts(day);
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
    for (const t of times) {
      if (out.length >= count) break;
      const s = businessDate(p.y, p.m, p.d, t.h, t.m);
      if (s > now) out.push(s.toISOString());
    }
  }
  return out;
}
