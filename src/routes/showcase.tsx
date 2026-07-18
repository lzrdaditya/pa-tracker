import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUnits,
  useRangeBreakdowns,
  useSettings,
} from "@/lib/data";
import {
  computePARange,
  formatHours,
  formatPct,
  paStatusLevel,
  unionHoursInRange,
  elapsedHours,
  formatDateTime,
  computeMTBS,
  computeMTTR,
} from "@/lib/pa";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tv,
  ArrowLeft,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Settings as SettingsIcon,
  Maximize,
  Minimize,
  Gauge,
  Timer,
} from "lucide-react";

export const Route = createFileRoute("/showcase")({
  component: ShowcaseView,
});

type Slide = "classes" | "breakdowns";

function ShowcaseView() {
  const { data: units = [] } = useUnits();
  const { data: settings } = useSettings();
  const target = settings?.pa_target ?? 0.9;

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Compute current month boundaries
  const y = clock.getFullYear();
  const m = clock.getMonth();
  const from = useMemo(() => new Date(y, m, 1, 0, 0, 0, 0), [y, m]);
  const to = useMemo(() => new Date(y, m + 1, 1, 0, 0, 0, 0), [y, m]);

  const { data: breakdowns = [] } = useRangeBreakdowns(from, to);

  // Slide rotation controls
  const [activeSlide, setActiveSlide] = useState<Slide>("classes");
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Invalidate cache every 20 seconds to auto-refresh data
  useEffect(() => {
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["breakdowns"] });
    }, 20_000);
    return () => clearInterval(interval);
  }, [qc]);

  // Rotate slides every 20 seconds
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev === "classes" ? "breakdowns" : "classes"));
    }, 20_000); // 20 seconds slide buffer
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Auto scroll logic when content overflows the screen
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollTop = 0;
    let timer: any;

    const scroll = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      if (el.scrollTop >= maxScroll) {
        clearInterval(timer);
        setTimeout(() => {
          el.scrollTo({ top: 0, behavior: "smooth" });
          setTimeout(() => {
            if (isPlaying) timer = setInterval(scroll, 35);
          }, 2000);
        }, 3000);
      } else {
        el.scrollTop += 1;
      }
    };

    if (isPlaying) {
      const delay = setTimeout(() => {
        timer = setInterval(scroll, 35);
      }, 3000);
      return () => {
        clearTimeout(delay);
        clearInterval(timer);
      };
    }
  }, [activeSlide, isPlaying]);

  // Handle Fullscreen request
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error("Error enabling fullscreen", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Compute same stats as index page
  const breakdownsByUnit = useMemo(() => {
    const map = new Map<string, typeof breakdowns>();
    for (const b of breakdowns) {
      const arr = map.get(b.unit_id) ?? [];
      arr.push(b);
      map.set(b.unit_id, arr);
    }
    return map;
  }, [breakdowns]);

  const downtimeByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const [uid, list] of breakdownsByUnit) {
      map.set(uid, unionHoursInRange(list, from, to, clock));
    }
    return map;
  }, [breakdownsByUnit, from, to, clock]);

  const stoppageCountByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const [uid, list] of breakdownsByUnit) {
      const n = list.filter((b) => {
        const s = new Date(b.started_at).getTime();
        const e = (b.finished_at ? new Date(b.finished_at) : clock).getTime();
        return s < to.getTime() && e > from.getTime();
      }).length;
      if (n > 0) map.set(uid, n);
    }
    return map;
  }, [breakdownsByUnit, from, to, clock]);

  const openByUnit = useMemo(() => {
    const map = new Map<string, typeof breakdowns[number]>();
    for (const b of breakdowns) if (!b.finished_at) map.set(b.unit_id, b);
    return map;
  }, [breakdowns]);

  const allEnriched = useMemo(() => {
    return units.map((u) => {
      const dt = downtimeByUnit.get(u.id) ?? 0;
      const stoppages = stoppageCountByUnit.get(u.id) ?? 0;
      const stats = computePARange(dt, target, from, to, clock);
      const level = paStatusLevel(stats.paCurrent, target);
      const open = openByUnit.get(u.id) ?? null;
      const mtbs = computeMTBS(stats.calTimeHours, dt, stoppages);
      const mttr = computeMTTR(dt, stoppages);

      return { unit: u, stats, level, open, stoppages, mtbs, mttr };
    });
  }, [units, downtimeByUnit, stoppageCountByUnit, target, openByUnit, from, to, clock]);

  const classSummaries = useMemo(() => {
    const groups = new Map<string, typeof allEnriched>();
    for (const e of allEnriched) {
      const key = (e.unit.notes ?? "").trim() || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    function avgOfPerUnit(items: typeof allEnriched, pick: (e: typeof allEnriched[number]) => number | null) {
      const vals = items.map(pick).filter((v): v is number => v !== null && isFinite(v));
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    return Array.from(groups.entries())
      .map(([className, items]) => {
        const totalDown = items.reduce((a, e) => a + e.stats.downtimeUsedHours, 0);
        const totalStop = items.reduce((a, e) => a + e.stoppages, 0);
        const avgDown = totalDown / items.length;
        const stats = computePARange(avgDown, target, from, to, clock);
        const mtbs = avgOfPerUnit(items, (e) => e.mtbs);
        const mttr = avgOfPerUnit(items, (e) => e.mttr);
        const level = paStatusLevel(stats.paCurrent, target);
        const down = items.filter((i) => i.open).length;
        return { className, items, stats, mtbs, mttr, level, totalStop, down };
      })
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [allEnriched, target, from, to, clock]);

  const fleetPa = useMemo(() => {
    const totalDown = allEnriched.reduce((a, e) => a + e.stats.downtimeUsedHours, 0);
    const n = allEnriched.length || 1;
    const avgDown = totalDown / n;
    const stats = computePARange(avgDown, target, from, to, clock);
    return stats.paCurrent;
  }, [allEnriched, target, from, to, clock]);

  const downUnits = useMemo(() => {
    return allEnriched.filter((e) => e.open !== null);
  }, [allEnriched]);

  const criticalUnits = useMemo(() => {
    // Operational units with < 24 hours remaining downtime budget
    return allEnriched.filter((e) => e.open === null && e.stats.remainingAllowedDowntime < 24);
  }, [allEnriched]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col justify-between p-8 font-sans overflow-hidden">
      {/* Top Banner / Showcase Header */}
      <header className="flex justify-between items-center border-b border-zinc-800 pb-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Tv className="h-6 w-6 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500">
              PA SHOWCASE SCREEN
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono uppercase tracking-widest">
              Live Workshop Operations Dashboard
            </p>
          </div>
        </div>

        {/* Global Fleet Metrics & Clock */}
        <div className="flex items-center gap-8 bg-zinc-900/40 border border-zinc-800 rounded-xl px-6 py-3">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Fleet PA</span>
            <p className={`text-2xl font-bold font-mono ${fleetPa >= target ? "text-emerald-400" : "text-rose-400"}`}>
              {formatPct(fleetPa)}
            </p>
          </div>
          <div className="w-[1px] h-10 bg-zinc-800" />
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Down Units</span>
            <p className={`text-2xl font-bold font-mono ${downUnits.length > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {downUnits.length}
            </p>
          </div>
          <div className="w-[1px] h-10 bg-zinc-800" />
          <div className="text-right">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Current Time</span>
            <p className="text-2xl font-bold font-mono text-zinc-300">
              {clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
        </div>

        {/* Presentation Controls */}
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="outline" className="border-zinc-800 hover:bg-zinc-800 text-zinc-300 gap-1.5 h-10">
              <ArrowLeft className="h-4 w-4" /> Exit
            </Button>
          </Link>
          <Button
            variant="outline"
            className="border-zinc-800 hover:bg-zinc-800 text-zinc-300 h-10"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            className="border-zinc-800 hover:bg-zinc-800 text-zinc-300 h-10"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Main Slide Carousel Section */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 py-4 scrollbar-none">
        {activeSlide === "classes" ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 h-full flex flex-col justify-center">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-100 flex items-center justify-center gap-2">
                <Gauge className="h-7 w-7 text-amber-500" /> PHYSICAL AVAILABILITY PER CLASS
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                Target PA is set to <span className="text-amber-500 font-semibold">{formatPct(target)}</span> for all equipment classes.
              </p>
            </div>

            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto w-full">
              {classSummaries.map((c) => {
                const isSuccess = c.stats.paCurrent >= target;
                const statusColor = isSuccess ? "text-emerald-400" : "text-rose-400";
                const ringColor = isSuccess ? "border-emerald-500/20 bg-emerald-950/10" : "border-rose-500/20 bg-rose-950/10";
                const barColor = isSuccess ? "bg-emerald-500" : "bg-rose-500";

                return (
                  <div
                    key={c.className}
                    className={`rounded-2xl border p-6 flex flex-col justify-between transition-all hover:scale-[1.01] ${ringColor}`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Class</span>
                          <h3 className="text-2xl font-bold text-zinc-100">{c.className}</h3>
                        </div>
                        <Badge className="bg-zinc-800 text-zinc-300 font-mono border-zinc-700">
                          {c.items.length} units
                        </Badge>
                      </div>

                      <div className="my-6">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Class PA</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className={`text-5xl font-extrabold font-mono tracking-tight ${statusColor}`}>
                            {formatPct(c.stats.paCurrent)}
                          </span>
                        </div>
                        <Progress value={c.stats.paCurrent * 100} className="h-2.5 mt-3 bg-zinc-800" style={{ "--progress-background": isSuccess ? "#10b981" : "#f43f5e" } as any} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-zinc-800/80 pt-4 mt-2">
                      <div className="bg-zinc-900/30 p-3 rounded-xl border border-zinc-850">
                        <span className="text-[10px] text-zinc-500 uppercase font-mono block">MTBS</span>
                        <span className="text-base font-bold font-mono text-zinc-200">
                          {c.mtbs !== null && isFinite(c.mtbs) ? `${c.mtbs.toFixed(1)}h` : "—"}
                        </span>
                      </div>
                      <div className="bg-zinc-900/30 p-3 rounded-xl border border-zinc-850">
                        <span className="text-[10px] text-zinc-500 uppercase font-mono block">MTTR</span>
                        <span className="text-base font-bold font-mono text-zinc-200">
                          {c.mttr !== null && isFinite(c.mttr) ? `${c.mttr.toFixed(1)}h` : "—"}
                        </span>
                      </div>
                      <div className="bg-zinc-900/30 p-3 rounded-xl border border-zinc-850 col-span-2 flex justify-between items-center">
                        <span className="text-[10px] text-zinc-500 uppercase font-mono">Status</span>
                        <span className={`text-xs font-bold ${c.down > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {c.down > 0 ? `${c.down} UNIT DOWN` : "ALL UP"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 h-full flex flex-col justify-center">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-100 flex items-center justify-center gap-2">
                <AlertTriangle className="h-7 w-7 text-rose-500" /> UNIT BREAKDOWNS & RELIABILITY BUDGETS
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                Showing currently down units and operational units with critical remaining downtime budget.
              </p>
            </div>

            <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
              <div className="grid grid-cols-[140px_160px_1fr_220px] bg-zinc-900/80 px-6 py-4 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">
                <div>Unit Code</div>
                <div>Class</div>
                <div>Status Details</div>
                <div className="text-right">Downtime Budget</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
                {downUnits.length === 0 && criticalUnits.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                    <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4 animate-bounce" />
                    <h3 className="text-xl font-bold text-zinc-200">All Units Operational</h3>
                    <p className="text-zinc-500 text-sm mt-1">All workshop equipment is on-track and within their reliability budgets.</p>
                  </div>
                ) : (
                  <>
                    {/* Render Down Units first */}
                    {downUnits.map((e) => {
                      const elapsed = e.open ? elapsedHours(e.open.started_at, null, clock) : 0;
                      const isOverBudget = e.stats.remainingAllowedDowntime < 0;
                      return (
                        <div key={e.unit.id} className="grid grid-cols-[140px_160px_1fr_220px] px-6 py-5 items-center bg-rose-950/10 hover:bg-rose-950/15 transition-colors">
                          <div className="font-mono text-lg font-bold text-rose-400 flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                            </span>
                            {e.unit.code}
                          </div>
                          <div className="text-sm text-zinc-400">{e.unit.notes || "Unassigned"}</div>
                          <div className="text-xs text-zinc-300">
                            <span className="text-rose-400 font-semibold uppercase">DOWN</span> for{" "}
                            <span className="font-mono font-bold text-rose-400">{elapsed.toFixed(1)}h</span>
                            <span className="text-zinc-500 ml-1.5 font-mono">since {formatDateTime(e.open!.started_at)}</span>
                          </div>
                          <div className="text-right">
                            <p className={`font-mono text-sm font-bold ${isOverBudget ? "text-rose-400" : "text-amber-400"}`}>
                              {e.stats.remainingAllowedDowntime >= 0
                                ? `${formatHours(e.stats.remainingAllowedDowntime)} left`
                                : `${formatHours(Math.abs(e.stats.remainingAllowedDowntime))} over`}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              {formatHours(e.stats.downtimeUsedHours)} used / {formatHours(e.stats.maxAllowedDowntime)}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Render Critical Budget Units */}
                    {criticalUnits.map((e) => {
                      const isOverBudget = e.stats.remainingAllowedDowntime < 0;
                      return (
                        <div key={e.unit.id} className="grid grid-cols-[140px_160px_1fr_220px] px-6 py-5 items-center hover:bg-zinc-900/30 transition-colors">
                          <div className="font-mono text-base font-bold text-zinc-200">{e.unit.code}</div>
                          <div className="text-sm text-zinc-400">{e.unit.notes || "Unassigned"}</div>
                          <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <span>Operational · PA {formatPct(e.stats.paCurrent)}</span>
                          </div>
                          <div className="text-right">
                            <p className={`font-mono text-sm font-bold ${isOverBudget ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>
                              {e.stats.remainingAllowedDowntime >= 0
                                ? `${formatHours(e.stats.remainingAllowedDowntime)} left`
                                : `${formatHours(Math.abs(e.stats.remainingAllowedDowntime))} over`}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              {formatHours(e.stats.downtimeUsedHours)} used / {formatHours(e.stats.maxAllowedDowntime)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Showcase Bottom Slide Navigator */}
      <footer className="border-t border-zinc-800 pt-6 mt-6 flex justify-between items-center text-xs font-mono text-zinc-500">
        <div>
          <span>MONTHLY TARGET: <strong className="text-amber-500">{formatPct(target)} PA</strong></span>
        </div>

        {/* Carousel indicators */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSlide("classes")}
            className={`h-2.5 w-8 rounded-full transition-all duration-300 ${
              activeSlide === "classes" ? "bg-amber-500 w-12" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          />
          <button
            onClick={() => setActiveSlide("breakdowns")}
            className={`h-2.5 w-8 rounded-full transition-all duration-300 ${
              activeSlide === "breakdowns" ? "bg-amber-500 w-12" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          />
        </div>

        <div>
          <span>SLIDE ROTATING: {isPlaying ? "AUTO" : "PAUSED"}</span>
        </div>
      </footer>
    </div>
  );
}
