// PA calculation helpers

export function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

export interface PAStats {
  calTimeHours: number;
  elapsedCalHours: number;
  downtimeUsedHours: number;
  paCurrent: number;
  paMonthProjected: number;
  maxAllowedDowntime: number;
  remainingAllowedDowntime: number;
  target: number;
  daysInMonth: number;
  dayOfMonth: number;
}

export function computePA(
  downtimeThisMonth: number,
  target: number,
  now: Date = new Date(),
): PAStats {
  const y = now.getFullYear();
  const m = now.getMonth();
  const dim = daysInMonth(y, m);
  const dom = now.getDate();
  const calTimeHours = dim * 24;
  const elapsedCalHours = dom * 24;
  
  // Physical availability (PA) = (cal. time - down time) / cal time
  const paCurrent =
    elapsedCalHours > 0 ? (elapsedCalHours - downtimeThisMonth) / elapsedCalHours : 1;
  const paMonthProjected =
    calTimeHours > 0 ? (calTimeHours - downtimeThisMonth) / calTimeHours : 1;
    
  const maxAllowedDowntime = calTimeHours * (1 - target);
  const remainingAllowedDowntime = maxAllowedDowntime - downtimeThisMonth;
  
  return {
    calTimeHours,
    elapsedCalHours,
    downtimeUsedHours: downtimeThisMonth,
    paCurrent,
    paMonthProjected,
    maxAllowedDowntime,
    remainingAllowedDowntime,
    target,
    daysInMonth: dim,
    dayOfMonth: dom,
  };
}

export function paStatusLevel(pa: number, target: number): "ok" | "warn" | "bad" {
  if (pa >= target) return "ok";
  if (pa >= target - 0.03) return "warn";
  return "bad";
}

export function formatHours(h: number) {
  const sign = h < 0 ? "-" : "";
  const abs = Math.abs(h);
  if (abs >= 100) return `${sign}${abs.toFixed(0)}h`;
  return `${sign}${abs.toFixed(1)}h`;
}

/** MTBS = (Calendar Time - Downtime) / No of Stoppage */
export function computeMTBS(elapsedCalHours: number, downtime: number, stoppages: number) {
  if (stoppages <= 0) return null;
  return (elapsedCalHours - downtime) / stoppages;
}

/** MTTR = (Sum of down time) / No of stoppage */
export function computeMTTR(downtime: number, stoppages: number) {
  if (stoppages <= 0) return null;
  return downtime / stoppages;
}

export function formatHoursOrDash(h: number | null) {
  if (h === null || !isFinite(h)) return "—";
  return formatHours(h);
}

/** Max stoppages allowed given calendar hours, current downtime, MTBS target. */
export function remainingStoppages(
  elapsedCalHours: number,
  downtime: number,
  stoppages: number,
  mtbsTarget: number,
): number | null {
  if (!mtbsTarget || mtbsTarget <= 0) return null;
  const nMax = Math.floor((elapsedCalHours - downtime) / mtbsTarget);
  return nMax - stoppages;
}

/** Remaining downtime headroom to keep MTTR ≤ target given current stoppage count. */
export function remainingMttrBudget(
  downtime: number,
  stoppages: number,
  mttrTarget: number,
): number | null {
  if (!mttrTarget || mttrTarget <= 0) return null;
  if (stoppages <= 0) return null;
  return mttrTarget * stoppages - downtime;
}

/** Max hours the next repair can take to keep MTTR on target. */
export function maxHoursNextRepair(
  downtime: number,
  stoppages: number,
  mttrTarget: number,
): number | null {
  if (!mttrTarget || mttrTarget <= 0) return null;
  return mttrTarget * (stoppages + 1) - downtime;
}

export type BudgetTone = "ok" | "warn" | "bad";

/** Traffic-light for a remaining budget value against its ceiling. */
export function budgetStatus(remaining: number | null, ceiling: number): BudgetTone {
  if (remaining === null || !isFinite(remaining)) return "ok";
  if (remaining < 0) return "bad";
  if (ceiling > 0 && remaining / ceiling < 0.2) return "warn";
  return "ok";
}

export function formatPct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

/** PA stats for an arbitrary date range. */
export function computePARange(
  downtimeHours: number,
  target: number,
  from: Date,
  to: Date,
  now: Date = new Date(),
): PAStats {
  const periodEnd = to;
  const effectiveEnd = now < periodEnd ? now : periodEnd;
  const calTimeHours = Math.max(0, (periodEnd.getTime() - from.getTime()) / 3_600_000);
  const elapsedCalHours = Math.max(0, (effectiveEnd.getTime() - from.getTime()) / 3_600_000);
  const paCurrent =
    elapsedCalHours > 0 ? (elapsedCalHours - downtimeHours) / elapsedCalHours : 1;
  const paMonthProjected =
    calTimeHours > 0 ? (calTimeHours - downtimeHours) / calTimeHours : 1;
  const maxAllowedDowntime = calTimeHours * (1 - target);
  const remainingAllowedDowntime = maxAllowedDowntime - downtimeHours;
  return {
    calTimeHours,
    elapsedCalHours,
    downtimeUsedHours: downtimeHours,
    paCurrent,
    paMonthProjected,
    maxAllowedDowntime,
    remainingAllowedDowntime,
    target,
    daysInMonth: Math.max(1, Math.ceil(calTimeHours / 24)),
    dayOfMonth: Math.max(0, Math.ceil(elapsedCalHours / 24)),
  };
}

/** Overlap of a breakdown with an arbitrary date range, capped at now. */
export function hoursInRange(
  startedAt: string,
  finishedAt: string | null,
  from: Date,
  to: Date,
  now: Date = new Date(),
) {
  const s = new Date(startedAt);
  const rawEnd = finishedAt ? new Date(finishedAt) : now;
  const lo = s > from ? s : from;
  const hiCap = rawEnd < to ? rawEnd : to;
  const hi = hiCap < now ? hiCap : now;
  const ms = hi.getTime() - lo.getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

export function monthBounds(now: Date = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

/** Hours of a breakdown that fall inside the current month, up to now if still open. */
export function hoursInMonth(
  startedAt: string,
  finishedAt: string | null,
  now: Date = new Date(),
) {
  const { start, end } = monthBounds(now);
  const s = new Date(startedAt);
  const rawEnd = finishedAt ? new Date(finishedAt) : now;
  const lo = s > start ? s : start;
  const hiCap = rawEnd < end ? rawEnd : end;
  const hi = hiCap < now ? hiCap : now;
  const ms = hi.getTime() - lo.getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

/**
 * Sum downtime hours across multiple breakdowns for the SAME unit within a range,
 * merging overlapping intervals so concurrent/duplicate records aren't double-counted.
 */
export function unionHoursInRange(
  intervals: Array<{ started_at: string; finished_at: string | null }>,
  from: Date,
  to: Date,
  now: Date = new Date(),
) {
  const cap = now < to ? now : to;
  const clipped: Array<[number, number]> = [];
  for (const b of intervals) {
    const s = new Date(b.started_at).getTime();
    const e = (b.finished_at ? new Date(b.finished_at) : now).getTime();
    const lo = Math.max(s, from.getTime());
    const hi = Math.min(e, cap.getTime());
    if (hi > lo) clipped.push([lo, hi]);
  }
  if (clipped.length === 0) return 0;
  clipped.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curLo, curHi] = clipped[0];
  for (let i = 1; i < clipped.length; i++) {
    const [lo, hi] = clipped[i];
    if (lo <= curHi) {
      if (hi > curHi) curHi = hi;
    } else {
      total += curHi - curLo;
      curLo = lo;
      curHi = hi;
    }
  }
  total += curHi - curLo;
  return total / 3_600_000;
}


/** Total elapsed hours of a breakdown regardless of month (for display). */
export function elapsedHours(
  startedAt: string,
  finishedAt: string | null,
  now: Date = new Date(),
) {
  const s = new Date(startedAt).getTime();
  const e = (finishedAt ? new Date(finishedAt) : now).getTime();
  return Math.max(0, (e - s) / 3_600_000);
}

/** ISO local datetime string suitable for <input type="datetime-local">. */
export function toLocalInput(d: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string) {
  // Interpreted in local time by Date constructor
  return new Date(v).toISOString();
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

