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

/** MTBS = (Ready Hour - Downtime) / No of Stoppage, where Ready Hour = Elapsed Cal - Downtime */
export function computeMTBS(elapsedCalHours: number, downtime: number, stoppages: number) {
  if (stoppages <= 0) return null;
  return (elapsedCalHours - downtime - downtime) / stoppages;
}

/** MTTR = Downtime / No of Stoppage */
export function computeMTTR(downtime: number, stoppages: number) {
  if (stoppages <= 0) return null;
  return downtime / stoppages;
}

export function formatHoursOrDash(h: number | null) {
  if (h === null || !isFinite(h)) return "—";
  return formatHours(h);
}


export function formatPct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
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
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
