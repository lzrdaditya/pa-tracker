import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useUnits,
  useRangeBreakdowns,
  useSettings,
  useUpdateBreakdown,
  type Unit,
  type Breakdown,
} from "@/lib/data";
import {
  computePARange,
  formatHours,
  formatPct,
  paStatusLevel,
  hoursInRange,
  elapsedHours,
  formatDateTime,
  computeMTBS,
  computeMTTR,
  formatHoursOrDash,
  remainingStoppages,
  remainingMttrBudget,
  maxHoursNextRepair,
  budgetStatus,
} from "@/lib/pa";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BreakdownDialog } from "@/components/BreakdownDialog";
import { ManageUnitsDialog } from "@/components/ManageUnitsDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { HistoryDialog } from "@/components/HistoryDialog";
import { toast } from "sonner";
import {
  Activity,
  Plus,
  Settings as SettingsIcon,
  Wrench,
  Search,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Pencil,
  Flag,
  Clock,
  Filter,
  CalendarDays,
  PlusCircle,
  Timer,
  Gauge,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

type Level = "ok" | "warn" | "bad";

function Dashboard() {
  const { data: units = [], isLoading: unitsLoading } = useUnits();
  const { data: settings } = useSettings();
  const target = settings?.pa_target ?? 0.9;
  const updateBd = useUpdateBreakdown();

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const todayStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [toDate, setToDate] = useState<string>(() => todayStr(new Date()));
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const from = useMemo(() => {
    const [y, m, d] = fromDate.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }, [fromDate]);
  const to = useMemo(() => {
    const [y, m, d] = toDate.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }, [toDate]);

  const isCurrentPeriod = to.getTime() >= clock.getTime();
  const anchor = clock < to ? clock : to;

  const { data: breakdowns = [] } = useRangeBreakdowns(from, to);

  const [createOpen, setCreateOpen] = useState(false);
  const [createUnitId, setCreateUnitId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Breakdown | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageStartNew, setManageStartNew] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [q, setQ] = useState("");

  const classes = useMemo(() => {
    const s = new Set<string>();
    for (const u of units) {
      const c = (u.notes ?? "").trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort();
  }, [units]);

  const downtimeByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of breakdowns) {
      map.set(
        b.unit_id,
        (map.get(b.unit_id) ?? 0) + hoursInRange(b.started_at, b.finished_at, from, to, clock),
      );
    }
    return map;
  }, [breakdowns, from, to, clock]);

  const stoppageCountByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of breakdowns) {
      if (hoursInRange(b.started_at, b.finished_at, from, to, clock) > 0) {
        map.set(b.unit_id, (map.get(b.unit_id) ?? 0) + 1);
      }
    }
    return map;
  }, [breakdowns, from, to, clock]);

  const openByUnit = useMemo(() => {
    const map = new Map<string, Breakdown>();
    for (const b of breakdowns) if (!b.finished_at) map.set(b.unit_id, b);
    return map;
  }, [breakdowns]);

  const activeBreakdowns = useMemo(
    () => breakdowns.filter((b) => !b.finished_at),
    [breakdowns],
  );

  // Unfiltered baseline for class summaries
  const allEnriched = useMemo(() => {
    return units.map((u) => {
      const dt = downtimeByUnit.get(u.id) ?? 0;
      const stoppages = stoppageCountByUnit.get(u.id) ?? 0;
      const stats = computePARange(dt, target, from, to, clock);
      const level: Level = paStatusLevel(stats.paCurrent, target);
      const open = openByUnit.get(u.id) ?? null;
      const mtbs = computeMTBS(stats.elapsedCalHours, dt, stoppages);
      const mttr = computeMTTR(dt, stoppages);
      const remStop = remainingStoppages(
        stats.elapsedCalHours,
        dt,
        stoppages,
        u.mtbs_target_hours,
      );
      const remMttr = remainingMttrBudget(dt, stoppages, u.mttr_target_hours);
      const maxNext = maxHoursNextRepair(dt, stoppages, u.mttr_target_hours);
      return { unit: u, stats, level, open, stoppages, mtbs, mttr, remStop, remMttr, maxNext };
    });
  }, [units, downtimeByUnit, stoppageCountByUnit, target, openByUnit, from, to, clock]);

  // Filtered baseline for Fleet KPIs and Lists
  const enriched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allEnriched
      .filter((e) => (classFilter === "all" ? true : (e.unit.notes ?? "") === classFilter))
      .filter((e) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "breakdown") return e.open !== null;

        const max = Math.max(0.001, e.stats.maxAllowedDowntime);
        const usedPct = Math.min(100, Math.max(0, (e.stats.downtimeUsedHours / max) * 100));
        const remaining = e.stats.remainingAllowedDowntime;
        const remainingPct = Math.max(0, 100 - usedPct);

        if (statusFilter === "safe") return remaining > 0 && remainingPct >= 25;
        if (statusFilter === "critical") return remaining > 0 && remainingPct < 25;
        if (statusFilter === "over") return remaining <= 0;

        return true;
      })
      .filter((e) =>
        needle ? (e.unit.code + " " + e.unit.name).toLowerCase().includes(needle) : true,
      );
  }, [allEnriched, q, classFilter, statusFilter]);

  // Average per-unit MTBS/MTTR (only units with stoppages contribute)
  function avgOfPerUnit(items: typeof allEnriched, pick: (e: (typeof allEnriched)[number]) => number | null) {
    const vals = items.map(pick).filter((v): v is number => v !== null && isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const fleet = useMemo(() => {
    const totalDown = enriched.reduce((a, e) => a + e.stats.downtimeUsedHours, 0);
    const totalStoppages = enriched.reduce((a, e) => a + e.stoppages, 0);
    const n = enriched.length || 1;
    const avgDown = totalDown / n;
    const stats = computePARange(avgDown, target, from, to, clock);
    const critical = enriched.filter((e) => e.level === "bad").length;
    const warn = enriched.filter((e) => e.level === "warn").length;
    const ok = enriched.filter((e) => e.level === "ok").length;
    const enrichedIds = new Set(enriched.map((e) => e.unit.id));
    const activeCount = activeBreakdowns.filter((b) => enrichedIds.has(b.unit_id)).length;
    // Per-unit average — matches per-unit target scale
    const mtbs = avgOfPerUnit(enriched, (e) => e.mtbs);
    const mttr = avgOfPerUnit(enriched, (e) => e.mttr);
    return { stats, critical, warn, ok, activeCount, totalStoppages, mtbs, mttr };
  }, [enriched, target, from, to, clock, activeBreakdowns]);

  // Per-class aggregation using UNFILTERED allEnriched data
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

  const openCreate = (unitId: string | null) => {
    setCreateUnitId(unitId);
    setCreateOpen(true);
  };

  const finishNow = async (b: Breakdown) => {
    try {
      await updateBd.mutateAsync({ id: b.id, finished_at: new Date().toISOString() });
      toast.success("Marked as finished");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    }
  };

  const periodLabel = `${from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  const [historyUnit, setHistoryUnit] = useState<Unit | null>(null);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="relative border-b overflow-hidden">
        <div className="absolute inset-0 bg-secondary" />
        <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(circle_at_20%_10%,var(--primary),transparent_50%),radial-gradient(circle_at_80%_90%,var(--primary),transparent_45%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap text-secondary-foreground">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Wrench className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-none tracking-tight">PA Monitor</h1>
              <p className="text-xs text-secondary-foreground/70 mt-1.5">
                Workshop physical availability · {periodLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              <SettingsIcon className="h-4 w-4 mr-1" /> Target {(target * 100).toFixed(0)}%
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setManageStartNew(false); setManageOpen(true); }}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              <Wrench className="h-4 w-4 mr-1" /> Units
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setManageStartNew(true); setManageOpen(true); }}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              <PlusCircle className="h-4 w-4 mr-1" /> Register unit
            </Button>
            <Button size="sm" onClick={() => openCreate(null)} className="shadow-md shadow-primary/20">
              <Plus className="h-4 w-4 mr-1" /> New breakdown
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Filters strip */}
        <section className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Filter className="h-3.5 w-3.5" /> View
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-[150px]"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={toDate}
              min={fromDate}
              max={todayStr(clock)}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes ({units.length})</SelectItem>
                {classes.map((c) => {
                  const count = units.filter((u) => (u.notes ?? "") === c).length;
                  return (
                    <SelectItem key={c} value={c}>
                      {c} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="breakdown">Breakdown</SelectItem>
                <SelectItem value="safe">Safe</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="over">Downtime Over</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(classFilter !== "all" || statusFilter !== "all" || !isCurrentPeriod) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setClassFilter("all");
                setStatusFilter("all");
                const d = clock;
                setFromDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
                setToDate(todayStr(d));
              }}
            >
              Reset
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{enriched.length}</span>{" "}
            of {units.length} unit{units.length === 1 ? "" : "s"}
            {!isCurrentPeriod && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                Historical view
              </span>
            )}
          </div>
        </section>

        {/* Views */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Main dashboard</TabsTrigger>
            <TabsTrigger value="list">List view</TabsTrigger>
            <TabsTrigger value="detail">Detailed view</TabsTrigger>
          </TabsList>

          {/* Main dashboard: fleet KPIs + per-class summaries */}
          <TabsContent value="overview" className="space-y-8">
            
            {/* Top Section: Summary by class */}
            <section>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                Summary by class
              </div>
              {classSummaries.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No units in this view.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {classSummaries.map((c) => (
                    <ClassSummaryCard
                      key={c.className}
                      name={c.className}
                      unitCount={c.items.length}
                      down={c.down}
                      pa={c.stats.paCurrent}
                      target={target}
                      mtbs={c.mtbs}
                      mttr={c.mttr}
                      mtbsTarget={settings?.mtbs_target_hours ?? 65}
                      mttrTarget={settings?.mttr_target_hours ?? 10}
                      stoppages={c.totalStop}
                      level={c.level}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Bottom Section: Fleet KPIs */}
            <div className="space-y-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                Fleet Overview
              </div>
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label={isCurrentPeriod ? "Fleet PA (to date)" : "Fleet PA"}
                  value={formatPct(fleet.stats.paCurrent)}
                  hint={`Target ${formatPct(target)}`}
                  tone={paStatusLevel(fleet.stats.paCurrent, target)}
                  icon={<TrendingUp className="h-4 w-4" />}
                />
                <KpiCard
                  label="Running breakdowns"
                  value={`${fleet.activeCount}`}
                  hint={fleet.activeCount === 0 ? "All units up" : "Awaiting finish"}
                  tone={fleet.activeCount === 0 ? "ok" : "warn"}
                  icon={<CircleDot className="h-4 w-4" />}
                />
                <KpiCard
                  label="Units at target"
                  value={`${fleet.ok}/${units.length || 0}`}
                  hint="Green units"
                  tone="ok"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                />
                <KpiCard
                  label="Below target"
                  value={`${fleet.critical}`}
                  hint={`${fleet.warn} in warning`}
                  tone={fleet.critical > 0 ? "bad" : fleet.warn > 0 ? "warn" : "ok"}
                  icon={<AlertTriangle className="h-4 w-4" />}
                />
              </section>

              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  label="MTBS (Fleet)"
                  value={formatHoursOrDash(fleet.mtbs)}
                  hint={`Target ≥ ${formatHours(settings?.mtbs_target_hours ?? 65)}`}
                  tone={
                    fleet.mtbs === null
                      ? "ok"
                      : fleet.mtbs >= (settings?.mtbs_target_hours ?? 65)
                        ? "ok"
                        : "warn"
                  }
                  icon={<Gauge className="h-4 w-4" />}
                />
                <KpiCard
                  label="MTTR (Fleet)"
                  value={formatHoursOrDash(fleet.mttr)}
                  hint={`Target ≤ ${formatHours(settings?.mttr_target_hours ?? 10)}`}
                  tone={
                    fleet.mttr === null
                      ? "ok"
                      : fleet.mttr <= (settings?.mttr_target_hours ?? 10)
                        ? "ok"
                        : "warn"
                  }
                  icon={<Timer className="h-4 w-4" />}
                />
                <KpiCard
                  label="Stoppages"
                  value={`${fleet.totalStoppages}`}
                  hint="Recorded this period"
                  tone={fleet.totalStoppages === 0 ? "ok" : "warn"}
                  icon={<AlertTriangle className="h-4 w-4" />}
                />
              </section>
            </div>
          </TabsContent>

          {/* List view */}
          <TabsContent value="list" className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search unit code or name"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {enriched.length} unit{enriched.length === 1 ? "" : "s"}
              </div>
            </div>

            {unitsLoading ? (
              <div className="text-center py-16 text-muted-foreground">Loading...</div>
            ) : enriched.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No units to show.
              </div>
            ) : (
              <div className="rounded-lg border bg-card overflow-hidden divide-y">
                {enriched.map((e) => (
                  <ListRow
                    key={e.unit.id}
                    unit={e.unit}
                    stats={e.stats}
                    level={e.level}
                    open={e.open}
                    target={target}
                    onRegister={() => openCreate(e.unit.id)}
                    onUpdateOpen={() => e.open && setEditing(e.open)}
                    onFinishOpen={() => e.open && finishNow(e.open)}
                    onOpenHistory={() => setHistoryUnit(e.unit)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Detailed view (current cards) */}
          <TabsContent value="detail" className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search unit code or name"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {enriched.length} unit{enriched.length === 1 ? "" : "s"} · month:{" "}
                <span className="font-mono">
                  {fleet.stats.dayOfMonth}/{fleet.stats.daysInMonth}
                </span>{" "}
                days
              </div>
            </div>

            {unitsLoading ? (
              <div className="text-center py-16 text-muted-foreground">Loading...</div>
            ) : units.length === 0 ? (
              <EmptyState onAdd={() => setManageOpen(true)} />
            ) : (
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {enriched.map(({ unit, stats, level, open, stoppages, mtbs, mttr, remStop, remMttr, maxNext }) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    stats={stats}
                    level={level}
                    open={open}
                    target={target}
                    now={anchor}
                    stoppages={stoppages}
                    mtbs={mtbs}
                    mttr={mttr}
                    remStop={remStop}
                    remMttr={remMttr}
                    maxNext={maxNext}
                    onRegister={() => openCreate(unit.id)}
                    onUpdateOpen={() => open && setEditing(open)}
                    onFinishOpen={() => open && finishNow(open)}
                  />
                ))}
              </section>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <BreakdownDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setCreateUnitId(null);
        }}
        mode="create"
        defaultUnitId={createUnitId}
      />
      <BreakdownDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        mode="edit"
        breakdown={editing}
      />
      <ManageUnitsDialog
        open={manageOpen}
        onOpenChange={(v) => { setManageOpen(v); if (!v) setManageStartNew(false); }}
        startInNew={manageStartNew}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <HistoryDialog
        open={!!historyUnit}
        onOpenChange={(v) => !v && setHistoryUnit(null)}
        unit={historyUnit}
        onEdit={(b) => {
          setHistoryUnit(null);
          setEditing(b);
        }}
      />
    </div>
  );
}

function toneClasses(t: Level) {
  if (t === "ok")
    return {
      bar: "bg-success",
      text: "text-success",
      ring: "ring-success/25",
      chip: "bg-success/10 text-success",
      accent: "before:bg-success",
    };
  if (t === "warn")
    return {
      bar: "bg-warning",
      text: "text-[oklch(0.55_0.15_75)]",
      ring: "ring-warning/30",
      chip: "bg-warning/20 text-[oklch(0.4_0.12_75)]",
      accent: "before:bg-warning",
    };
  return {
    bar: "bg-destructive",
    text: "text-destructive",
    ring: "ring-destructive/30",
    chip: "bg-destructive/10 text-destructive",
    accent: "before:bg-destructive",
  };
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: Level;
  icon: React.ReactNode;
}) {
  const t = toneClasses(tone);
  return (
    <div
      className={`relative rounded-lg border bg-card p-4 shadow-sm overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${t.accent}`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground pl-2">
        <span>{label}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${t.chip}`}>
          {icon}
        </span>
      </div>
      <div className={`mt-2 font-mono tabular text-3xl font-bold pl-2 ${t.text}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground pl-2">{hint}</div>
    </div>
  );
}

function UnitCard({
  unit,
  stats,
  level,
  open,
  target,
  now,
  stoppages,
  mtbs,
  mttr,
  remStop,
  remMttr,
  maxNext,
  onRegister,
  onUpdateOpen,
  onFinishOpen,
}: {
  unit: Unit;
  stats: ReturnType<typeof computePARange>;
  level: Level;
  open: Breakdown | null;
  target: number;
  now: Date;
  stoppages: number;
  mtbs: number | null;
  mttr: number | null;
  remStop: number | null;
  remMttr: number | null;
  maxNext: number | null;
  onRegister: () => void;
  onUpdateOpen: () => void;
  onFinishOpen: () => void;
}) {

  const t = toneClasses(level);
  const budgetPct = Math.min(
    100,
    Math.max(0, (stats.downtimeUsedHours / Math.max(0.001, stats.maxAllowedDowntime)) * 100),
  );
  const remainingLabel =
    stats.remainingAllowedDowntime >= 0
      ? `${formatHours(stats.remainingAllowedDowntime)} left in budget`
      : `${formatHours(Math.abs(stats.remainingAllowedDowntime))} over budget`;

  return (
    <div className={`relative rounded-lg border bg-card p-5 shadow-sm ring-1 ${t.ring} transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{unit.code}</div>
          <div className="text-base font-semibold truncate">{unit.name}</div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded ${t.chip} uppercase tracking-wider whitespace-nowrap`}>
          {level === "ok" ? "On target" : level === "warn" ? "Warning" : "Below"}
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <div className={`font-mono tabular text-4xl font-bold ${t.text}`}>
          {formatPct(stats.paCurrent)}
        </div>
        <div className="text-xs text-muted-foreground">MTD · goal {formatPct(target)}</div>
      </div>

      {open && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
              </span>
              DOWN · {formatHours(elapsedHours(open.started_at, null, now))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              since {formatDateTime(open.started_at)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Remaining Downtime Allowed</span>
          <span className="font-mono tabular">
            {formatHours(stats.downtimeUsedHours)} / {formatHours(stats.maxAllowedDowntime)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${t.bar} transition-all`} style={{ width: `${budgetPct}%` }} />
        </div>
        <div className={`mt-1 text-xs font-medium ${t.text}`}>{remainingLabel}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">MTBS</div>
          <div className="font-mono tabular font-semibold">{formatHoursOrDash(mtbs)}</div>
          <div className="text-[10px] text-muted-foreground">target {formatHours(unit.mtbs_target_hours)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">MTTR</div>
          <div className="font-mono tabular font-semibold">{formatHoursOrDash(mttr)}</div>
          <div className="text-[10px] text-muted-foreground">target ≤ {formatHours(unit.mttr_target_hours)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2 col-span-2">
          <div className="text-muted-foreground">Stoppages this period</div>
          <div className="font-mono tabular font-semibold">{stoppages}</div>
        </div>
      </div>

      {/* Remaining reliability budgets */}
      <div className="mt-3 rounded-md border bg-muted/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Remaining budget
        </div>
        <div className="grid gap-2 text-xs">
          <BudgetRow
            label="Stoppages allowed"
            value={
              remStop === null
                ? "—"
                : remStop >= 0
                  ? `${remStop} more`
                  : `${Math.abs(remStop)} over`
            }
            tone={budgetStatus(remStop, Math.max(1, (remStop ?? 0) + stoppages))}
            hint="Before MTBS falls below target"
          />
          <BudgetRow
            label="MTTR headroom"
            value={
              remMttr === null
                ? "—"
                : remMttr >= 0
                  ? `+${formatHours(remMttr)}`
                  : `−${formatHours(Math.abs(remMttr))}`
            }
            tone={budgetStatus(remMttr, Math.max(0.001, unit.mttr_target_hours * Math.max(1, stoppages)))}
            hint={stoppages === 0 ? "No stoppages yet" : "Total repair-hour headroom"}
          />
          <BudgetRow
            label="Next repair ≤"
            value={maxNext === null ? "—" : maxNext >= 0 ? formatHours(maxNext) : "0h (breached)"}
            tone={budgetStatus(maxNext, Math.max(0.001, unit.mttr_target_hours))}
            hint="Max duration to stay on MTTR"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {open ? (
          <>
            <Button size="sm" variant="outline" className="flex-1" onClick={onUpdateOpen}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Update
            </Button>
            <Button size="sm" className="flex-1" onClick={onFinishOpen}>
              <Flag className="h-3.5 w-3.5 mr-1" /> Finish
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="w-full" onClick={onRegister}>
            <Plus className="h-4 w-4 mr-1" /> Register breakdown
          </Button>
        )}
      </div>
    </div>
  );
}

function BudgetRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: Level;
  hint?: string;
}) {
  const t = toneClasses(tone);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <div className={`font-mono tabular text-sm font-bold ${t.text} whitespace-nowrap`}>{value}</div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center bg-card">
      <Wrench className="h-10 w-10 mx-auto text-muted-foreground" />
      <h2 className="mt-3 text-lg font-semibold">No units yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your workshop units to start tracking breakdowns and PA.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-1" /> Add your first unit
      </Button>
    </div>
  );
}

function ClassSummaryCard({
  name,
  unitCount,
  down,
  pa,
  target,
  mtbs,
  mttr,
  mtbsTarget,
  mttrTarget,
  stoppages,
  level,
}: {
  name: string;
  unitCount: number;
  down: number;
  pa: number;
  target: number;
  mtbs: number | null;
  mttr: number | null;
  mtbsTarget: number;
  mttrTarget: number;
  stoppages: number;
  level: Level;
}) {
  const t = toneClasses(level);
  return (
    <div className={`relative rounded-lg border bg-card p-4 shadow-sm ring-1 ${t.ring} before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${t.accent}`}>
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Class</div>
          <div className="text-base font-semibold truncate">{name}</div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded ${t.chip} uppercase tracking-wider whitespace-nowrap`}>
          {unitCount} unit{unitCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3 pl-2 flex items-baseline gap-2">
        <div className={`font-mono tabular text-3xl font-bold ${t.text}`}>{formatPct(pa)}</div>
        <div className="text-xs text-muted-foreground">PA · goal {formatPct(target)}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs pl-2">
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">MTBS</div>
          <div className="font-mono tabular font-semibold">{formatHoursOrDash(mtbs)}</div>
          <div className="text-[10px] text-muted-foreground">target ≥ {formatHours(mtbsTarget)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">MTTR</div>
          <div className="font-mono tabular font-semibold">{formatHoursOrDash(mttr)}</div>
          <div className="text-[10px] text-muted-foreground">target ≤ {formatHours(mttrTarget)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">Stoppages</div>
          <div className="font-mono tabular font-semibold">{stoppages}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">Currently down</div>
          <div className={`font-mono tabular font-semibold ${down > 0 ? "text-destructive" : ""}`}>{down}</div>
        </div>
      </div>
    </div>
  );
}

function ListRow({
  unit,
  stats,
  level,
  open,
  target,
  onRegister,
  onUpdateOpen,
  onFinishOpen,
  onOpenHistory,
}: {
  unit: Unit;
  stats: ReturnType<typeof computePARange>;
  level: Level;
  open: Breakdown | null;
  target: number;
  onRegister: () => void;
  onUpdateOpen: () => void;
  onFinishOpen: () => void;
  onOpenHistory: () => void;
}) {
  const max = Math.max(0.001, stats.maxAllowedDowntime);
  const usedPct = Math.min(100, Math.max(0, (stats.downtimeUsedHours / max) * 100));
  const remaining = stats.remainingAllowedDowntime;
  const remainingPct = Math.max(0, 100 - usedPct);

  // Warning tier per user request: high / low / empty remaining downtime
  let tier: "high" | "low" | "empty";
  if (remaining <= 0) tier = "empty";
  else if (remainingPct < 25) tier = "low";
  else tier = "high";

  const tierChip =
    tier === "high"
      ? "bg-success/10 text-success"
      : tier === "low"
        ? "bg-warning/20 text-[oklch(0.4_0.12_75)]"
        : "bg-destructive/10 text-destructive";
  const barColor =
    tier === "high" ? "bg-success" : tier === "low" ? "bg-warning" : "bg-destructive";
  const tierLabel =
    tier === "high" ? "Safe" : tier === "low" ? "Critical" : "Downtime Over";

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenHistory}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenHistory();
        }
      }}
      className="grid grid-cols-1 md:grid-cols-[1fr_280px_120px_180px] items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors focus:outline-none focus:bg-muted/40"
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-muted-foreground">{unit.code}</span>
          <span className="font-semibold truncate">{unit.name}</span>
          {open && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive uppercase">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-destructive" />
              </span>
              Down
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          PA {formatPct(stats.paCurrent)} · goal {formatPct(target)} · used{" "}
          {formatHours(stats.downtimeUsedHours)} / {formatHours(stats.maxAllowedDowntime)}
        </div>
      </div>

      <div className="w-full">
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${usedPct}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{usedPct.toFixed(0)}% used</span>
          <span className={`font-mono tabular font-semibold ${tier === "empty" ? "text-destructive" : tier === "low" ? "text-[oklch(0.4_0.12_75)]" : "text-success"}`}>
            {remaining >= 0
              ? `${formatHours(remaining)} left`
              : `${formatHours(Math.abs(remaining))} over`}
          </span>
        </div>
      </div>

      <div className="flex justify-start md:justify-center">
        <span className={`text-[10px] font-semibold px-2 py-1 rounded ${tierChip} uppercase tracking-wider whitespace-nowrap`}>
          {tierLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 justify-start md:justify-end" onClick={stop}>
        {open ? (
          <>
            <Button size="sm" variant="outline" onClick={(e) => { stop(e); onUpdateOpen(); }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Update
            </Button>
            <Button size="sm" onClick={(e) => { stop(e); onFinishOpen(); }}>
              <Flag className="h-3.5 w-3.5 mr-1" /> Finish
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={(e) => { stop(e); onRegister(); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Log
          </Button>
        )}
      </div>

      {/* silence unused level warning */}
      <span className="hidden">{level}</span>
    </div>
  );
}

// keep imported for tree-shake safety
void Activity;
