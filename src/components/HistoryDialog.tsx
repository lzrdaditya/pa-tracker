import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUnitBreakdowns, type Unit } from "@/lib/data";
import { elapsedHours, formatDateTime, formatHours } from "@/lib/pa";
import { Pencil, Clock } from "lucide-react";
import type { Breakdown } from "@/lib/data";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unit: Unit | null;
  onEdit: (b: Breakdown) => void;
}

export function HistoryDialog({ open, onOpenChange, unit, onEdit }: Props) {
  const { data: logs = [], isLoading } = useUnitBreakdowns(unit?.id ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Downtime history
            {unit && (
              <span className="text-sm font-normal text-muted-foreground">
                · {unit.code} — {unit.name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No breakdowns logged for this unit.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y border rounded-md">
            {logs.map((b) => {
              const running = !b.finished_at;
              const duration = elapsedHours(b.started_at, b.finished_at);
              return (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{formatDateTime(b.started_at)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={running ? "text-destructive font-semibold" : ""}>
                        {b.finished_at ? formatDateTime(b.finished_at) : "still running"}
                      </span>
                    </div>
                    {b.notes && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {b.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular text-sm font-semibold">
                      {formatHours(duration)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(b)}
                      className="h-7 px-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
