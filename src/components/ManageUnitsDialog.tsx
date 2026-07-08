import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useUnits, useSaveUnit, useDeleteUnit, useSettings, type Unit } from "@/lib/data";
import { Pencil, Trash2, Plus, X } from "lucide-react";

const DEFAULT_UNIT_CLASSES = [
  "DIGGER",
  "DOZER",
  "DRILLING",
  "DUMP TRUCK",
  "SMALL EXCAVATOR",
  "GRADER",
];


interface Props { open: boolean; onOpenChange: (v: boolean) => void; startInNew?: boolean }

export function ManageUnitsDialog({ open, onOpenChange, startInNew }: Props) {
  const { data: units = [] } = useUnits();
  const { data: settings } = useSettings();
  const classOptions = useMemo(() => {
    const s = new Set<string>(DEFAULT_UNIT_CLASSES);
    for (const u of units) {
      const c = (u.notes ?? "").trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort();
  }, [units]);

  const save = useSaveUnit();
  const del = useDeleteUnit();

  const defMtbs = settings?.mtbs_target_hours ?? 65;
  const defMttr = settings?.mttr_target_hours ?? 10;

  const [editing, setEditing] = useState<Partial<Unit> | null>(null);

  useEffect(() => {
    if (open && startInNew)
      setEditing({ code: "", name: "", notes: "", mtbs_target_hours: defMtbs, mttr_target_hours: defMttr });
    if (!open) setEditing(null);
  }, [open, startInNew, defMtbs, defMttr]);

  const startNew = () =>
    setEditing({ code: "", name: "", notes: "", mtbs_target_hours: defMtbs, mttr_target_hours: defMttr });

  const submit = async () => {
    if (!editing) return;
    if (!editing.code?.trim() || !editing.name?.trim()) return toast.error("Code and name required");
    try {
      await save.mutateAsync({
        id: editing.id,
        code: editing.code.trim(),
        name: editing.name.trim(),
        notes: editing.notes ?? null,
        mtbs_target_hours: Number(editing.mtbs_target_hours ?? defMtbs),
        mttr_target_hours: Number(editing.mttr_target_hours ?? defMttr),
      });
      toast.success("Unit saved");
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    }
  };


  const remove = async (u: Unit) => {
    if (!confirm(`Delete ${u.code}? All its downtime logs will also be removed.`)) return;
    try {
      await del.mutateAsync(u.id);
      toast.success("Unit deleted");
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage units</DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="grid gap-3 rounded-md border bg-muted/30 p-4">
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <div className="grid gap-2">
                <Label>Code</Label>
                <Input
                  placeholder="EX-01"
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input
                  placeholder="Excavator 320D"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>MTBS target (h)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={editing.mtbs_target_hours ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, mtbs_target_hours: Number(e.target.value) })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>MTTR target (h)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={editing.mttr_target_hours ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, mttr_target_hours: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Unit class</Label>
              <Select
                value={
                  editing.notes && classOptions.includes(editing.notes)
                    ? editing.notes
                    : editing.notes
                      ? "__custom"
                      : ""
                }
                onValueChange={(v) => {
                  if (v === "__custom") setEditing({ ...editing, notes: "" });
                  else setEditing({ ...editing, notes: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit class" />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value="__custom">Other (custom)…</SelectItem>
                </SelectContent>
              </Select>
              {(editing.notes !== undefined &&
                editing.notes !== null &&
                !classOptions.includes(editing.notes)) && (
                <Input
                  placeholder="Type custom class name"
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              )}
            </div>


            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button onClick={submit} disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button onClick={startNew} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add unit
            </Button>
          </div>
        )}

        <div className="rounded-md border max-h-[50vh] overflow-y-auto">
          {units.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No units yet. Add your first unit to get started.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2 font-mono font-semibold">{u.code}</td>
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setEditing(u)}
                        className="text-muted-foreground hover:text-foreground mr-3"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(u)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
