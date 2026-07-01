import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useUnits, useUpsertLog, useUnitLogs, useDeleteLog } from "@/lib/data";
import { todayISO, formatHours } from "@/lib/pa";
import { Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultUnitId?: string | null;
}

export function LogDowntimeDialog({ open, onOpenChange, defaultUnitId }: Props) {
  const { data: units = [] } = useUnits();
  const [unitId, setUnitId] = useState<string>(defaultUnitId ?? "");
  const [date, setDate] = useState<string>(todayISO());
  const [hours, setHours] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");

  const activeUnit = useMemo(
    () => defaultUnitId ?? unitId,
    [defaultUnitId, unitId],
  );
  const { data: recent = [] } = useUnitLogs(activeUnit || null);

  const upsert = useUpsertLog();
  const del = useDeleteLog();

  const save = async () => {
    const uid = defaultUnitId ?? unitId;
    if (!uid) return toast.error("Select a unit");
    const h = Number(hours);
    if (Number.isNaN(h) || h < 0 || h > 24) return toast.error("Hours must be between 0 and 24");
    try {
      await upsert.mutateAsync({
        unit_id: uid,
        log_date: date,
        downtime_hours: h,
        notes: notes.trim() || null,
      });
      toast.success("Downtime logged");
      setHours("0");
      setNotes("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log downtime</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {!defaultUnitId && (
            <div className="grid gap-2">
              <Label>Unit</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Downtime (hours)</Label>
              <Input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Reason, work order, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {activeUnit && recent.length > 0 && (
            <div className="rounded-md border">
              <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                This month's logs
              </div>
              <div className="max-h-48 overflow-y-auto divide-y">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-mono">{r.log_date}</div>
                      {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular font-semibold">
                        {formatHours(Number(r.downtime_hours))}
                      </span>
                      <button
                        onClick={() => del.mutate(r.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete log"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
