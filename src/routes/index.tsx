import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useUnits, useMonthLogs, useSettings, type Unit } from "@/lib/data";
import { computePA, formatHours, formatPct, paStatusLevel } from "@/lib/pa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogDowntimeDialog } from "@/components/LogDowntimeDialog";
import { ManageUnitsDialog } from "@/components/ManageUnitsDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Activity, Plus, Settings, Wrench, Search, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: units = [], isLoading: unitsLoading } = useUnits();
  const { data: logs = [] } = useMonthLogs();
  const { data: settings } = useSettings();
  const target = settings?.pa_target ?? 0.9;

  const [logOpen, setLogOpen] = useState(false);
  const [logUnitId, setLogUnitId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [q, setQ] = useState("");

  const downtimeByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) {
      map.set(l.unit_id, (map.get(l.unit_id) ?? 0) + Number(l.downtime_hours));
    }
    return map;
  }, [logs]);

  const enriched = useMemo(() => {
    return units
      .filter((u) =>
        q.trim()
          ? (u.code + " " + u.name).toLowerCase().includes(q.trim().toLowerCase())
          : true,
      )
      .map((u) => {
        const dt = downtimeByUnit.get(u.id) ?? 0;
        const stats = computePA(dt, target);
        return { unit: u, stats, level: paStatusLevel(stats.paCurrent, target) };
      });
  }, [units, downtimeByUnit, target, q]);

  const fleet = useMemo(() => {
    const totalDown = Array.from(downtimeByUnit.values()).reduce((a, b) => a + b, 0);
    const n = units.length || 1;
    const avgDown = totalDown / n;
    const stats = computePA(avgDown, target);
    const critical = enriched.filter((e) => e.level === "bad").length;
    const warn = enriched.filter((e) => e.level === "warn").length;
    const ok = enriched.filter((e) => e.level === "ok").length;
    return { stats, critical, warn, ok };
  }, [downtimeByUnit, units.length, target, enriched]);

  const openLogFor = (id: string | null) => {
    setLogUnitId(id);
    setLogOpen(true);
  };

  const monthLabel = new Date().toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center">
              <Wrench className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none">PA Monitor</h1>
              <p className="text-xs text-secondary-foreground/70 mt-1">
                Workshop physical availability · {monthLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white">
              <Settings className="h-4 w-4 mr-1" /> Target {(target * 100).toFixed(0)}%
            </Button>
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white">
              <Wrench className="h-4 w-4 mr-1" /> Units
            </Button>
            <Button size="sm" onClick={() => openLogFor(null)}>
              <Plus className="h-4 w-4 mr-1" /> Log downtime
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Fleet KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Fleet PA (MTD)"
            value={formatPct(fleet.stats.paCurrent)}
            hint={`Target ${formatPct(target)}`}
            tone={paStatusLevel(fleet.stats.paCurrent, target)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <KpiCard
            label="Units at target"
            value={`${fleet.ok}/${units.length || 0}`}
            hint="Green units"
            tone="ok"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <KpiCard
            label="Warning"
            value={`${fleet.warn}`}
            hint="Within 3% of target"
            tone="warn"
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <KpiCard
            label="Below target"
            value={`${fleet.critical}`}
            hint="Needs attention"
            tone="bad"
            icon={<Activity className="h-4 w-4" />}
          />
        </section>

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
            <span className="font-mono">{fleet.stats.dayOfMonth}/{fleet.stats.daysInMonth}</span> days
          </div>
        </div>

        {/* Units */}
        {unitsLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading...</div>
        ) : units.length === 0 ? (
          <EmptyState onAdd={() => setManageOpen(true)} />
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map(({ unit, stats, level }) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                stats={stats}
                level={level}
                target={target}
                onLog={() => openLogFor(unit.id)}
              />
            ))}
          </section>
        )}
      </main>

      <LogDowntimeDialog
        open={logOpen}
        onOpenChange={(v) => { setLogOpen(v); if (!v) setLogUnitId(null); }}
        defaultUnitId={logUnitId}
      />
      <ManageUnitsDialog open={manageOpen} onOpenChange={setManageOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function toneClasses(t: "ok" | "warn" | "bad") {
  if (t === "ok") return { bar: "bg-success", text: "text-success", ring: "ring-success/30", chip: "bg-success/10 text-success" };
  if (t === "warn") return { bar: "bg-warning", text: "text-warning", ring: "ring-warning/30", chip: "bg-warning/15 text-warning-foreground" };
  return { bar: "bg-destructive", text: "text-destructive", ring: "ring-destructive/30", chip: "bg-destructive/10 text-destructive" };
}

function KpiCard({
  label, value, hint, tone, icon,
}: { label: string; value: string; hint: string; tone: "ok" | "warn" | "bad"; icon: React.ReactNode }) {
  const t = toneClasses(tone);
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${t.chip}`}>{icon}</span>
      </div>
      <div className={`mt-2 font-mono tabular text-3xl font-bold ${t.text}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function UnitCard({
  unit, stats, level, target, onLog,
}: {
  unit: Unit;
  stats: ReturnType<typeof computePA>;
  level: "ok" | "warn" | "bad";
  target: number;
  onLog: () => void;
}) {
  const t = toneClasses(level);
  const budgetPct = Math.min(100, Math.max(0, (stats.downtimeUsedHours / stats.maxAllowedDowntime) * 100));
  const remainingLabel =
    stats.remainingAllowedDowntime >= 0
      ? `${formatHours(stats.remainingAllowedDowntime)} left`
      : `${formatHours(Math.abs(stats.remainingAllowedDowntime))} over`;

  return (
    <div className={`rounded-lg border bg-card p-5 shadow-sm ring-1 ${t.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{unit.code}</div>
          <div className="text-base font-semibold">{unit.name}</div>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded ${t.chip} uppercase tracking-wide`}>
          {level === "ok" ? "On target" : level === "warn" ? "Warning" : "Below"}
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <div className={`font-mono tabular text-4xl font-bold ${t.text}`}>
          {formatPct(stats.paCurrent)}
        </div>
        <div className="text-xs text-muted-foreground">
          MTD PA · target {formatPct(target)}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Downtime budget</span>
          <span className="font-mono tabular">
            {formatHours(stats.downtimeUsedHours)} / {formatHours(stats.maxAllowedDowntime)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${t.bar} transition-all`} style={{ width: `${budgetPct}%` }} />
        </div>
        <div className={`mt-1 text-xs font-medium ${t.text}`}>{remainingLabel}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">Cal time</div>
          <div className="font-mono tabular font-semibold">{formatHours(stats.calTimeHours)}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground">EOM projected</div>
          <div className="font-mono tabular font-semibold">{formatPct(stats.paMonthProjected)}</div>
        </div>
      </div>

      <Button size="sm" variant="outline" className="mt-4 w-full" onClick={onLog}>
        <Plus className="h-4 w-4 mr-1" /> Log downtime
      </Button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center bg-card">
      <Wrench className="h-10 w-10 mx-auto text-muted-foreground" />
      <h2 className="mt-3 text-lg font-semibold">No units yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your workshop units to start tracking daily downtime and PA.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-1" /> Add your first unit
      </Button>
    </div>
  );
}
