import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useUnits,
  useMonthBreakdowns,
  useSettings,
  useUpdateBreakdown,
  type Unit,
  type Breakdown,
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

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [classFilter, setClassFilter] = useState<string>("all");

  const currentMonthKey = `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = selectedMonth === currentMonthKey;

  const anchor = useMemo(() => {
    const [ys, ms] = selectedMonth.split("-").map(Number);
    if (isCurrentMonth) return clock;
    return new Date(ys, ms, 0, 23, 59, 59);
  }, [selectedMonth, isCurrentMonth, clock]);

  const { data: breakdowns = [] } = useMonthBreakdowns(anchor);

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

  const monthOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const base = new Date(clock.getFullYear(), clock.getMonth(), 1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ value: v, label: d.toLocaleString(undefined, { month: "long", year: "numeric" }) });
    }
    return out;
  }, [clock]);

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
    const map = new Map<string, Breakdown>();
    for (const b of breakdowns) if (!b.finished_at) map.set(b.unit_id, b);
    return map;
  }, [breakdowns]);

  const activeBreakdowns = useMemo(
    () => breakdowns.filter((b) => !b.finished_at),
    [breakdowns],
  );

  const enriched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return units
      .filter((u) => (classFilter === "all" ? true : (u.notes ?? "") === classFilter))
      .filter((u) =>
        needle ? (u.code + " " + u.name).toLowerCase().includes(needle) : true,
      )
      .map((u) => {
        const dt = downtimeByUnit.get(u.id) ?? 0;
        const stoppages = stoppageCountByUnit.get(u.id) ?? 0;
        const stats = computePA(dt, target, anchor);
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
  }, [units, downtimeByUnit, stoppageCountByUnit, target, q, openByUnit, anchor, classFilter]);


  const fleet = useMemo(() => {
    const totalDown = enriched.reduce((a, e) => a + e.stats.downtimeUsedHours, 0);
    const totalStoppages = enriched.reduce((a, e) => a + e.stoppages, 0);
    const n = enriched.length || 1;
    const avgDown = totalDown / n;
    const stats = computePA(avgDown, target, anchor);
    const critical = enriched.filter((e) => e.level === "bad").length;
    const warn = enriched.filter((e) => e.level === "warn").length;
    const ok = enriched.filter((e) => e.level === "ok").length;
    const enrichedIds = new Set(enriched.map((e) => e.unit.id));
    const activeCount = activeBreakdowns.filter((b) => enrichedIds.has(b.unit_id)).length;
    const totalReady = enriched.reduce((a, e) => a + e.stats.elapsedCalHours, 0);
    const mtbs = computeMTBS(totalReady, totalDown, totalStoppages);
    const mttr = computeMTTR(totalDown, totalStoppages);
    return { stats, critical, warn, ok, activeCount, totalStoppages, mtbs, mttr };
  }, [enriched, target, anchor, activeBreakdowns]);


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

  const monthLabel = anchor.toLocaleString(undefined, { month: "long", year: "numeric" });

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
                Workshop physical availability · {monthLabel}
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
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                    {m.value === currentMonthKey ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-9 w-[200px]">
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
          {(classFilter !== "all" || !isCurrentMonth) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setClassFilter("all");
                setSelectedMonth(currentMonthKey);
              }}
            >
              Reset
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{enriched.length}</span>{" "}
            of {units.length} unit{units.length === 1 ? "" : "s"}
            {!isCurrentMonth && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                Historical view
              </span>
            )}
          </div>
        </section>
        {/* Fleet KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={isCurrentMonth ? "Fleet PA (MTD)" : "Fleet PA"}
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

        {/* Reliability KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="MTBS (Fleet)"
            value={formatHoursOrDash(fleet.mtbs)}
            hint="Mean time between stoppage"
            tone="ok"
            icon={<Gauge className="h-4 w-4" />}
          />
          <KpiCard
            label="MTTR (Fleet)"
            value={formatHoursOrDash(fleet.mttr)}
            hint="Mean time to repair"
            tone={fleet.mttr !== null && fleet.mttr > 8 ? "warn" : "ok"}
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


        {/* Active breakdowns strip */}
        {isCurrentMonth && activeBreakdowns.length > 0 && (
          <section className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-destructive/5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                </span>
                Currently down
                <span className="text-muted-foreground font-normal">
                  · {activeBreakdowns.length} unit{activeBreakdowns.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="divide-y">
              {activeBreakdowns.map((b) => {
                const u = units.find((x) => x.id === b.unit_id);
                const el = elapsedHours(b.started_at, null, anchor);
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{u?.code ?? "?"}</span>
                        <span className="font-semibold truncate">{u?.name ?? "Unknown"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> since {formatDateTime(b.started_at)}
                        </span>
                        {b.notes && <span className="truncate">· {b.notes}</span>}
                      </div>
                    </div>
                    <div className="font-mono tabular font-bold text-destructive text-lg">
                      {formatHours(el)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Update
                      </Button>
                      <Button size="sm" onClick={() => finishNow(b)} disabled={updateBd.isPending}>
                        <Flag className="h-3.5 w-3.5 mr-1" /> Mark finished
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Toolbar */}
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

        {/* Units */}
        {unitsLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading...</div>
        ) : units.length === 0 ? (
          <EmptyState onAdd={() => setManageOpen(true)} />
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map(({ unit, stats, level, open, stoppages, mtbs, mttr }) => (
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
                onRegister={() => openCreate(unit.id)}
                onUpdateOpen={() => open && setEditing(open)}
                onFinishOpen={() => open && finishNow(open)}
              />
            ))}
          </section>
        )}
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
  onRegister,
  onUpdateOpen,
  onFinishOpen,
}: {
  unit: Unit;
  stats: ReturnType<typeof computePA>;
  level: Level;
  open: Breakdown | null;
  target: number;
  now: Date;
  stoppages: number;
  mtbs: number | null;
  mttr: number | null;
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
          <div className="text-muted-foreground">Cal time</div>
          <div className="font-mono tabular font-semibold">{formatHours(stats.calTimeHours)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">EOM projected</div>
          <div className="font-mono tabular font-semibold">{formatPct(stats.paMonthProjected)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">MTBS</div>
          <div className="font-mono tabular font-semibold">{formatHoursOrDash(mtbs)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">MTTR</div>
          <div className="font-mono tabular font-semibold">{formatHoursOrDash(mttr)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2 col-span-2">
          <div className="text-muted-foreground">Stoppages this period</div>
          <div className="font-mono tabular font-semibold">{stoppages}</div>
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

// keep imported for tree-shake safety
void Activity;
