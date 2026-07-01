// PA calculation helpers

export function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

export interface PAStats {
  calTimeHours: number;        // total hours in the month
  elapsedCalHours: number;     // hours elapsed so far in the month (today counted fully)
  downtimeUsedHours: number;   // logged downtime this month
  paCurrent: number;           // PA using elapsed cal time (real-time view)
  paMonthProjected: number;    // PA if no more downtime for rest of month
  maxAllowedDowntime: number;  // total downtime budget for month at target
  remainingAllowedDowntime: number; // budget - used (can be negative)
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
  return `${sign}${abs.toFixed(1)}h`;
}

export function formatPct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

export function monthRange(now: Date = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: toISO(first), end: toISO(last) };
}

export function todayISO(now: Date = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
