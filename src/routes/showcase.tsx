import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUnits,
  useRangeBreakdowns,
  useSettings,
} from "@/lib/data";
import {
  computePA,
  formatHours,
  formatPct,
  paStatusLevel,
  hoursInMonth,
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

  const y = clock.getFullYear();
  const m = clock.getMonth();
  const from = useMemo(() => new Date(y, m, 1, 0, 0, 0, 0), [y, m]);
  const to = useMemo(() => new Date(y, m + 1, 1, 0, 0, 0, 0), [y, m]);

  const anchor = clock;
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

  // Rotate slides every 30 seconds
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev === "classes" ? "breakdowns" : "classes"));
    }, 30_000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Fixed auto scroll logic that calculates accurately with block visibility elements
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollTop = 0;
    let timer: any;

    const scroll = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      if (Math.ceil(el.scrollTop) >= maxScroll - 1) {
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
  }, [activeSlide, isPlaying, units, breakdowns]);

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

  const downtimeByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of breakdowns) {
      map.set(
        b.unit_id,
        (map.get(b.unit_id) ?? 0) + hoursInMonth(b.started_at, b.finished_at, anchor),
      );
    }
    return map;
  }, [breakdowns, anchor]);

  const stoppageCountByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of breakdowns) {
      if (hoursInMonth(b.started_at, b.finished_at, anchor) > 0) {
        map.set(b.unit_id, (map.get(b.unit_id) ?? 0) + 1);
      }
    }
    return map;
  }, [breakdowns, anchor]);

  const openByUnit = useMemo(() => {
    const map = new Map<string, typeof breakdowns[number]>();
    for (const b of breakdowns) if (!b.finished_at) map.set(b.unit_id, b);
    return map;
  }, [breakdowns]);

  const allEnriched = useMemo(() => {
    return units.map((u) => {
      const dt = downtimeByUnit.get(u.id) ?? 0;
      const stoppages = stoppageCountByUnit.get(u.id) ?? 0;
      const stats = computePA(dt, target, anchor);
      const level = paStatusLevel(stats.paCurrent, target);
      const open = openByUnit.get(u.id) ?? null;
      const mtbs = computeMTBS(stats.elapsedCalHours, dt, stoppages);
      const mttr = computeMTTR(dt, stoppages);

      return { unit: u, stats, level, open, stoppages, mtbs, mttr };
    });
  }, [units, downtimeByUnit, stoppageCountByUnit, target, openByUnit, anchor]);

  const classSummaries = useMemo(() => {
    const groups = new Map<string, typeof allEnriched>();
    for (const e of allEnriched) {
      const key = (e.unit.notes ?? "").trim() || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    return Array.from(groups.entries())
      .map(([className, items]) => {
        const totalDown = items.reduce((a, e) => a + e.stats.downtimeUsedHours, 0);
        const totalStop = items.reduce((a, e) => a + e.stoppages, 0);
        const totalReady = items.reduce((a, e) => a + e.stats.elapsedCalHours, 0);
        const avgDown = totalDown / items.length;
        const stats = computePA(avgDown, target, anchor);
        const mtbs = computeMTBS(totalReady, totalDown, totalStop);
        const mttr = computeMTTR(totalDown, totalStop);
        const level = paStatusLevel(stats.paCurrent, target);
        const down = items.filter((i) => i.open).length;
        return { className, items, stats, mtbs, mttr, level, totalStop, down };
      })
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [allEnriched, target, anchor]);

  const fleetPa = useMemo(() => {
    const totalDown = allEnriched.reduce((a, e) => a + e.stats.downtimeUsedHours, 0);
    const n = allEnriched.length || 1;
    const avgDown = totalDown / n;
    const stats = computePA(avgDown, target, anchor);
    return stats.paCurrent;
  }, [allEnriched, target, anchor]);

  const downUnits = useMemo(() => {
    return allEnriched.filter((e) => e.open !== null);
  }, [allEnriched]);

  const criticalUnits = useMemo(() => {
    return allEnriched.filter((e) => e.open === null && e.stats.remainingAllowedDowntime < 24);
  }, [allEnriched]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col justify-between p-8 font-sans overflow-hidden">
      {/* Top Banner / Showcase Header */}
      <header className="flex justify-between items-center border-b border-slate-200 bg-white rounded-xl px-6 py-4 mb-4 shrink-0 shadow-md border-b-2 border-b-slate-300">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md shadow-orange-500/20">
            <Tv className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              PA SHOWCASE SCREEN
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-mono uppercase tracking-widest">
              Live Workshop Operations Dashboard
            </p>
          </div>
        </div>

        {/* Global Fleet Metrics & Clock */}
        <div className="flex items-center gap-8 bg-slate-50 border border-slate-200 rounded-xl px-6 py-2.5">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Fleet PA</span>
            <p className={`text-2xl font-bold font-mono ${fleetPa >= target ? "text-emerald-600" : "text-rose-600"}`}>
              {formatPct(fleetPa)}
            </p>
          </div>
          <div className="w-[1px] h-10 bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Down Units</span>
            <p className={`text-2xl font-bold font-mono ${downUnits.length > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {downUnits.length}
            </p>
          </div>
          <div className="w-[1px] h-10 bg-slate-200" />
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Current Time</span>
            <p className="text-2xl font-bold font-mono text-slate-700">
              {clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
        </div>

        {/* Presentation Controls */}
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="outline" className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 gap-1.5 h-10 shadow-sm">
              <ArrowLeft className="h-4 w-4" /> Exit
            </Button>
          </Link>
          <Button
            variant="outline"
            className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 h-10 shadow-sm"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 h-10 shadow-sm"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Main Slide Carousel Section with Fixed Layout Constraints */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 py-4 scrollbar-none">
        
        {/* SLIDE 1: CLASSES */}
        <div className={`transition-all duration-500 ease-in-out transform ${
          activeSlide === "classes" 
            ? "opacity-100 translate-y-0 block" 
            : "opacity-0 translate-y-4 hidden"
        }`}>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-800 flex items-center justify-center gap-2">
              <Gauge className="h-7 w-7 text-amber-500" /> PHYSICAL AVAILABILITY PER CLASS
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Target PA is set to <span className="text-amber-600 font-bold">{formatPct(target)}</span> for all equipment classes.
            </p>
          </div>

          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto w-full pb-8">
            {classSummaries.map((c) => {
              const isSuccess = c.stats.paCurrent >= target;
              const statusColor = isSuccess ? "text-emerald-600 font-bold" : "text-rose-600 font-bold";
              const cardBorder = isSuccess ? "border-emerald-350 bg-emerald-50/20" : "border-rose-350 bg-rose-50/20";

              return (
                <div
                  key={c.className}
                  className={`rounded-2xl border-2 p-6 flex flex-col justify-between transition-all bg-white shadow-md hover:shadow-lg ${cardBorder}`}
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Class</span>
                        <h3 className="text-2xl font-bold text-slate-800">{c.className}</h3>
                      </div>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 font-mono shadow-sm">
                        {c.items.length} units
                      </Badge>
                    </div>

                    <div className="my-6">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Class PA</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className={`text-5xl font-extrabold font-mono tracking-tight ${statusColor}`}>
                          {formatPct(c.stats.paCurrent)}
                        </span>
                      </div>
                      <Progress value={c.stats.paCurrent * 100} className="h-2.5 mt-3 bg-slate-100" style={{ "--progress-background": isSuccess ? "#10b981" : "#f43f5e" } as any} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 mt-2">
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 shadow-inner">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">MTBS</span>
                      <span className="text-base font-bold font-mono text-slate-700">
                        {c.mtbs !== null && isFinite(c.mtbs) ? `${c.mtbs.toFixed(1)}h` : "—"}
                      </span>
                    </div>
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 shadow-inner">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">MTTR</span>
                      <span className="text-base font-bold font-mono text-slate-700">
                        {c.mttr !== null && isFinite(c.mttr) ? `${c.mttr.toFixed(1)}h` : "—"}
                      </span>
                    </div>
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 shadow-inner col-span-2 flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Status</span>
                      <span className={`text-xs font-bold ${c.down > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {c.down > 0 ? `${c.down} UNIT DOWN` : "ALL OPERATIONAL"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SLIDE 2: BREAKDOWNS */}
        <div className={`transition-all duration-500 ease-in-out transform ${
          activeSlide === "breakdowns" 
            ? "opacity-100 translate-y-0 block" 
            : "opacity-0 translate-y-4 hidden"
        }`}>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-800 flex items-center justify-center gap-2">
              <AlertTriangle className="h-7 w-7 text-rose-500" /> Unit Breakdown & Remaining Downtime Allowed
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Showing currently down units and operational units with critical remaining downtime allowed.
            </p>
          </div>

          <div className="max-w-6xl mx-auto w-full bg-white rounded-2xl border-2 border-slate-200 shadow-md mb-8 overflow-hidden">
            <div className="grid grid-cols-[140px_160px_1fr_220px] bg-slate-100 px-6 py-4 border-b-2 border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
              <div>Unit Code</div>
              <div>Class</div>
              <div>Status Details</div>
              <div className="text-right">Downtime Budget</div>
            </div>

            <div className="divide-y divide-slate-100">
              {downUnits.length === 0 && criticalUnits.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-white">
                  <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4 animate-pulse" />
                  <h3 className="text-xl font-bold text-slate-800">All Units Operational</h3>
                  <p className="text-slate-500 text-sm mt-1">All workshop equipment is on-track and within their reliability budgets.</p>
                </div>
              ) : (
                <>
                  {downUnits.map((e) => {
                    const elapsed = e.open ? elapsedHours(e.open.started_at, null, clock) : 0;
                    const isOverBudget = e.stats.remainingAllowedDowntime < 0;
                    return (
                      <div key={e.unit.id} className="grid grid-cols-[140px_160px_1fr_220px] px-6 py-5 items-center bg-rose-50/40 hover:bg-rose-50/70 transition-colors border-l-4 border-l-rose-500">
                        <div className="font-mono text-lg font-bold text-rose-600 flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                          </span>
                          {e.unit.code}
                        </div>
                        <div className="text-sm text-slate-600">{e.unit.notes || "Unassigned"}</div>
                        <div className="text-xs text-slate-700">
                          <span className="text-rose-600 font-bold uppercase">DOWN</span> for{" "}
                          <span className="font-mono font-bold text-rose-600">{elapsed.toFixed(1)}h</span>
                          <span className="text-slate-400 ml-1.5 font-mono">since {formatDateTime(e.open!.started_at)}</span>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono text-sm font-bold ${isOverBudget ? "text-rose-600" : "text-amber-600"}`}>
                            {e.stats.remainingAllowedDowntime >= 0
                              ? `${formatHours(e.stats.remainingAllowedDowntime)} left`
                              : `${formatHours(Math.abs(e.stats.remainingAllowedDowntime))} over`}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {formatHours(e.stats.downtimeUsedHours)} used / {formatHours(e.stats.maxAllowedDowntime)}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {criticalUnits.map((e) => {
                    const isOverBudget = e.stats.remainingAllowedDowntime < 0;
                    return (
                      <div key={e.unit.id} className="grid grid-cols-[140px_160px_1fr_220px] px-6 py-5 items-center bg-white hover:bg-slate-50/50 transition-colors border-l-4 border-l-amber-400">
                        <div className="font-mono text-base font-bold text-slate-700">{e.unit.code}</div>
                        <div className="text-sm text-slate-600">{e.unit.notes || "Unassigned"}</div>
                        <div className="text-xs text-slate-600 flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <span>Operational · PA {formatPct(e.stats.paCurrent)}</span>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono text-sm font-bold ${isOverBudget ? "text-rose-600 animate-pulse" : "text-amber-600"}`}>
                            {e.stats.remainingAllowedDowntime >= 0
                              ? `${formatHours(e.stats.remainingAllowedDowntime)} left`
                              : `${formatHours(Math.abs(e.stats.remainingAllowedDowntime))} over`}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
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
      </main>

      {/* Showcase Bottom Slide Navigator */}
      <footer className="border-t border-slate-200 pt-6 mt-4 bg-white rounded-xl px-6 py-4 flex justify-between items-center text-xs font-mono text-slate-400 shrink-0 shadow-md">
        <div>
          <span>MONTHLY TARGET: <strong className="text-amber-500 font-bold">{formatPct(target)} PA</strong></span>
        </div>

        {/* Carousel indicators */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSlide("classes")}
            className={`h-2.5 w-8 rounded-full transition-all duration-300 ${
              activeSlide === "classes" ? "bg-amber-500 w-12" : "bg-slate-200 hover:bg-slate-300"
            }`}
          />
          <button
            onClick={() => setActiveSlide("breakdowns")}
            className={`h-2.5 w-8 rounded-full transition-all duration-300 ${
              activeSlide === "breakdowns" ? "bg-amber-500 w-12" : "bg-slate-200 hover:bg-slate-300"
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

function hoursInMonth(startedAt: string, finishedAt: string | null, now: Date) {
  const s = new Date(startedAt).getTime();
  const e = (finishedAt ? new Date(finishedAt) : now).getTime();
  return Math.max(0, (e - s) / 3600000);
}
