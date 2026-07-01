import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useUnits, useSaveUnit, useDeleteUnit, type Unit } from "@/lib/data";
import { Pencil, Trash2, Plus, X } from "lucide-react";

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function ManageUnitsDialog({ open, onOpenChange }: Props) {
  const { data: units = [] } = useUnits();
  const save = useSaveUnit();
  const del = useDeleteUnit();

  const [editing, setEditing] = useState<Partial<Unit> | null>(null);

  const startNew = () => setEditing({ code: "", name: "", notes: "" });

  const submit = async () => {
    if (!editing) return;
    if (!editing.code?.trim() || !editing.name?.trim()) return toast.error("Code and name required");
    try {
      await save.mutateAsync({
        id: editing.id,
        code: editing.code.trim(),
        name: editing.name.trim(),
        notes: editing.notes ?? null,
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
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
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
