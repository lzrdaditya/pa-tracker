import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useUnits,
  useCreateBreakdown,
  useUpdateBreakdown,
  useDeleteBreakdown,
  type Breakdown,
} from "@/lib/data";
import { toLocalInput, fromLocalInput, elapsedHours, formatHours } from "@/lib/pa";
import { Trash2 } from "lucide-react";

type Mode = "create" | "edit";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  defaultUnitId?: string | null;
  breakdown?: Breakdown | null;
}

export function BreakdownDialog({ open, onOpenChange, mode, defaultUnitId, breakdown }: Props) {
  const { data: units = [] } = useUnits();
  const create = useCreateBreakdown();
  const update = useUpdateBreakdown();
  const del = useDeleteBreakdown();

  const [unitId, setUnitId] = useState<string>(defaultUnitId ?? "");
  const [startedAt, setStartedAt] = useState<string>(toLocalInput());
  const [finishedAt, setFinishedAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && breakdown) {
      setUnitId(breakdown.unit_id);
      setStartedAt(toLocalInput(new Date(breakdown.started_at)));
      setFinishedAt(breakdown.finished_at ? toLocalInput(new Date(breakdown.finished_at)) : "");
      setNotes(breakdown.notes ?? "");
    } else {
      setUnitId(defaultUnitId ?? "");
      setStartedAt(toLocalInput());
      setFinishedAt("");
      setNotes("");
    }
  }, [open, mode, breakdown, defaultUnitId]);

  const unit = useMemo(() => units.find((u) => u.id === unitId), [units, unitId]);

  const currentElapsed = useMemo(() => {
    if (!startedAt) return 0;
    return elapsedHours(
      new Date(startedAt).toISOString(),
      finishedAt ? new Date(finishedAt).toISOString() : null,
    );
  }, [startedAt, finishedAt]);

  const finishNow = () => setFinishedAt(toLocalInput());

  const save = async () => {
    if (!unitId) return toast.error("Select a unit");
    if (!startedAt) return toast.error("Start time required");
    const started_iso = fromLocalInput(startedAt);
    const finished_iso = finishedAt ? fromLocalInput(finishedAt) : null;
    if (finished_iso && new Date(finished_iso) < new Date(started_iso)) {
      return toast.error("Finish time must be after start");
    }
    try {
      if (mode === "edit" && breakdown) {
        await update.mutateAsync({
          id: breakdown.id,
          started_at: started_iso,
          finished_at: finished_iso,
          notes: notes.trim() || null,
        });
        toast.success("Breakdown updated");
      } else {
        await create.mutateAsync({
          unit_id: unitId,
          started_at: started_iso,
          finished_at: finished_iso,
          notes: notes.trim() || null,
        });
        toast.success("Breakdown registered");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    }
  };

  const remove = async () => {
    if (!breakdown) return;
    if (!confirm("Delete this breakdown record?")) return;
    try {
      await del.mutateAsync(breakdown.id);
      toast.success("Breakdown deleted");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  };

  const title = mode === "edit" ? "Update breakdown" : "Register breakdown";
  const running = mode === "edit" && breakdown && !breakdown.finished_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            {running && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive uppercase tracking-wide">
                Running
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Unit</Label>
            <Select
              value={unitId}
              onValueChange={setUnitId}
              disabled={mode === "edit" || !!defaultUnitId}
            >
              <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unit && (
              <p className="text-xs text-muted-foreground">
                {unit.code} · {unit.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Breakdown started</Label>
              <DateTime24
                value={startedAt}
                onChange={setStartedAt}
              />
            </div>
            <div className="grid gap-2">
              <Label className="flex items-center justify-between">
                <span>Finished</span>
                <button
                  type="button"
                  onClick={finishNow}
                  className="text-xs text-primary hover:underline"
                >
                  Set now
                </button>
              </Label>
              <DateTime24
                value={finishedAt}
                onChange={setFinishedAt}
                allowEmpty
              />

              {!finishedAt && (
                <p className="text-xs text-muted-foreground">Leave empty while still down.</p>
              )}
            </div>
          </div>


          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Elapsed downtime</span>
            <span className="font-mono tabular font-semibold">
              {formatHours(currentElapsed)}
            </span>
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              placeholder="Failure mode, work order, technician..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {mode === "edit" && (
              <Button variant="ghost" size="sm" onClick={remove} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending
                ? "Saving..."
                : mode === "edit"
                  ? "Save changes"
                  : "Register"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Date + 24h time input pair. Splitting avoids browser locales that force
 * AM/PM in <input type="datetime-local">. Value is the same
 * "YYYY-MM-DDTHH:MM" string produced by toLocalInput().
 */
function DateTime24({
  value,
  onChange,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""];
  const emit = (d: string, t: string) => {
    if (!d && !t) return onChange("");
    const safeD = d || new Date().toISOString().slice(0, 10);
    const safeT = t || "00:00";
    onChange(`${safeD}T${safeT.slice(0, 5)}`);
  };
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <Input
        type="date"
        value={datePart}
        onChange={(e) => emit(e.target.value, timePart)}
      />
      <Input
        type="time"
        lang="en-GB"
        step={60}
        className="w-[110px] font-mono tabular"
        value={timePart ? timePart.slice(0, 5) : ""}
        placeholder={allowEmpty ? "--:--" : "HH:MM"}
        onChange={(e) => emit(datePart, e.target.value)}
      />
    </div>
  );
}

