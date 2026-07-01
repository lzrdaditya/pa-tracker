import { useState } from "react";
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
  const [pct, setPct] = useState<string>(((settings?.pa_target ?? 0.9) * 100).toFixed(1));

  const submit = async () => {
    const v = Number(pct);
    if (Number.isNaN(v) || v <= 0 || v >= 100) return toast.error("Enter a % between 0 and 100");
    try {
      await save.mutateAsync(v / 100);
      toast.success("Target updated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>PA target</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Target physical availability (%)</Label>
          <Input
            type="number"
            min={1}
            max={99.9}
            step={0.1}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            At 90% target the monthly downtime budget = 10% of calendar time.
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
