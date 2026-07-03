import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSettings, useSaveTarget } from "@/lib/data";

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function SettingsDialog({ open, onOpenChange }: Props) {
  const { data: settings } = useSettings();
  const save = useSaveTarget();
  const [pct, setPct] = useState<string>("90.0");
  const [mtbs, setMtbs] = useState<string>("65");
  const [mttr, setMttr] = useState<string>("10");

  useEffect(() => {
    if (settings) {
      setPct(((settings.pa_target ?? 0.9) * 100).toFixed(1));
      setMtbs(String(settings.mtbs_target_hours ?? 65));
      setMttr(String(settings.mttr_target_hours ?? 10));
    }
  }, [settings, open]);

  const submit = async () => {
    const v = Number(pct);
    const m = Number(mtbs);
    const r = Number(mttr);
    if (Number.isNaN(v) || v <= 0 || v >= 100) return toast.error("PA target must be between 0 and 100");
    if (Number.isNaN(m) || m <= 0) return toast.error("MTBS target must be > 0");
    if (Number.isNaN(r) || r <= 0) return toast.error("MTTR target must be > 0");
    try {
      await save.mutateAsync({ pa_target: v / 100, mtbs_target_hours: m, mttr_target_hours: r });
      toast.success("Targets updated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Fleet targets</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Physical availability target (%)</Label>
            <Input type="number" min={1} max={99.9} step={0.1} value={pct} onChange={(e) => setPct(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              At 90% target the monthly downtime budget = 10% of calendar time.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>MTBS target (h)</Label>
              <Input type="number" min={0} step={0.1} value={mtbs} onChange={(e) => setMtbs(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>MTTR target (h)</Label>
              <Input type="number" min={0} step={0.1} value={mttr} onChange={(e) => setMttr(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Global defaults for new units. Per-unit overrides live in the Units dialog.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
