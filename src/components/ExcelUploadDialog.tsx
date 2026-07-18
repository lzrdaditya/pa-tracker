import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useUnits } from "@/lib/data";
import { parseZrppExcel, aggregateSnjGroups, SnjGroup, ZrppRow } from "@/lib/excel-parser";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Step = "upload" | "review-snj" | "summary" | "processing";

export function ExcelUploadDialog({ open, onOpenChange }: Props) {
  const { data: units = [] } = useUnits();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [downtimeRows, setDowntimeRows] = useState<ZrppRow[]>([]);
  const [snjGroups, setSnjGroups] = useState<SnjGroup[]>([]);
  const [unknownEquipment, setUnknownEquipment] = useState<string[]>([]);
  const [logDate, setLogDate] = useState("");
  const [shift, setShift] = useState<"DS" | "NS">("DS");
  const [parsing, setParsing] = useState(false);

  // Filters
  const [classFilter, setClassFilter] = useState("all");

  const classes = useMemo(() => {
    const s = new Set<string>();
    for (const u of units) {
      const c = (u.notes ?? "").trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort();
  }, [units]);

  const filteredSnjGroups = useMemo(() => {
    return snjGroups.filter((g) => {
      if (classFilter === "all") return true;
      return g.unitClass === classFilter;
    });
  }, [snjGroups, classFilter]);

  const resetState = () => {
    setStep("upload");
    setFile(null);
    setDowntimeRows([]);
    setSnjGroups([]);
    setUnknownEquipment([]);
    setLogDate("");
    setShift("DS");
    setParsing(false);
    setClassFilter("all");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    await processFile(selectedFile);
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setParsing(true);
    setStep("processing");

    try {
      const parsed = await parseZrppExcel(selectedFile, units);
      setDowntimeRows(parsed.downtimeRows);
      setUnknownEquipment(parsed.unknownEquipment);
      setLogDate(parsed.logDate);
      setShift(parsed.shift);

      const aggregatedSnj = aggregateSnjGroups(parsed.snjRows, units);
      setSnjGroups(aggregatedSnj);

      if (aggregatedSnj.length > 0) {
        setStep("review-snj");
      } else {
        setStep("summary");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to parse Excel file");
      setStep("upload");
    } finally {
      setParsing(false);
    }
  };

  const toggleSnjBreakdown = (index: number) => {
    setSnjGroups((prev) =>
      prev.map((g, idx) => (idx === index ? { ...g, isBreakdown: !g.isBreakdown } : g))
    );
  };

  const setBulkSnj = (isBreakdown: boolean) => {
    setSnjGroups((prev) =>
      prev.map((g) => {
        // If filtered, only update matching class
        if (classFilter !== "all" && g.unitClass !== classFilter) return g;
        return { ...g, isBreakdown };
      })
    );
  };

  const handleConfirmImport = async () => {
    setStep("processing");

    try {
      const [year, month, day] = logDate.split("-").map(Number);
      let startLocal: Date;
      let endLocal: Date;

      if (shift === "DS") {
        startLocal = new Date(year, month - 1, day, 6, 30, 0);
        endLocal = new Date(year, month - 1, day, 18, 30, 0);
      } else {
        startLocal = new Date(year, month - 1, day, 18, 30, 0);
        endLocal = new Date(year, month - 1, day + 1, 6, 30, 0);
      }

      // 1. Overwrite: Delete existing Excel-imported breakdowns in this range
      const { data: existing, error: fetchErr } = await supabase
        .from("breakdowns")
        .select("id")
        .gte("started_at", startLocal.toISOString())
        .lt("started_at", endLocal.toISOString())
        .like("notes", "Excel Import%");

      if (fetchErr) throw fetchErr;

      if (existing && existing.length > 0) {
        const ids = existing.map((x) => x.id);
        const { error: delErr } = await supabase.from("breakdowns").delete().in("id", ids);
        if (delErr) throw delErr;
      }

      // 2. Prepare new records
      const recordsToInsert: any[] = [];

      // Add standard downtime (BPM, BBR)
      for (const row of downtimeRows) {
        const matched = units.find((u) => u.code.toLowerCase() === row.equipment.toLowerCase());
        if (!matched) continue;

        recordsToInsert.push({
          unit_id: matched.id,
          started_at: row.startExec.toISOString(),
          finished_at: row.finishExec.toISOString(),
          notes: `Excel Import - ${row.statusCode}`,
        });
      }

      // Add confirmed SNJ breakdowns
      const confirmedSnjs = snjGroups.filter((g) => g.isBreakdown && g.unitId);
      for (const snj of confirmedSnjs) {
        recordsToInsert.push({
          unit_id: snj.unitId,
          started_at: snj.startExec,
          finished_at: snj.finishExec,
          notes: `Excel Import - SNJ (Breakdown)`,
        });
      }

      // 3. Write records
      if (recordsToInsert.length > 0) {
        const { error: insErr } = await supabase.from("breakdowns").insert(recordsToInsert);
        if (insErr) throw insErr;
      }

      // 4. Write log (optional, do not block import if table not migrated yet)
      try {
        const { error: logErr } = await supabase.from("excel_upload_log").insert({
          file_name: file?.name || "unknown",
          shift,
          log_date: logDate,
          records_inserted: recordsToInsert.length,
        });
        if (logErr) console.warn("Upload audit log warning:", logErr);
      } catch (e) {
        console.warn("Upload log table not available yet:", e);
      }

      toast.success(
        `Import completed! Overwrote ${existing?.length || 0} old records. Inserted ${recordsToInsert.length} new records.`
      );
      qc.invalidateQueries({ queryKey: ["breakdowns"] });
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Database write failed");
      setStep("summary");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <DialogContent className="w-screen max-w-none h-screen max-h-none flex flex-col p-0 overflow-hidden border-none bg-zinc-950 text-zinc-100 rounded-none m-0 shadow-none">
        <DialogHeader className="px-6 pt-6 pb-2 border-b border-zinc-800 bg-zinc-900/50">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
            <FileSpreadsheet className="h-5 w-5 text-amber-500" />
            Upload Activity Log
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Upload Excel ZRPP file to log downtime and physical availability status.
          </DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="p-8 flex flex-col items-center justify-center min-h-[300px]">
            <div className="w-full max-w-md border-2 border-dashed border-zinc-800 hover:border-amber-500/50 rounded-xl p-8 flex flex-col items-center text-center justify-center cursor-pointer transition-all bg-zinc-900/20 hover:bg-zinc-900/40 relative">
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="h-16 w-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800 shadow-lg shadow-zinc-950">
                <Upload className="h-8 w-8 text-amber-500 animate-pulse" />
              </div>
              <h3 className="font-semibold text-zinc-200 mb-1">Drag file here or click</h3>
              <p className="text-xs text-zinc-400 max-w-xs">
                Supports spreadsheet log file formats (`EXPORT ZRPP JT.XLSX`).
              </p>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <div className="p-12 flex flex-col items-center justify-center min-h-[300px]">
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin mb-4" />
            <h3 className="text-lg font-semibold text-zinc-200">
              {parsing ? "Parsing spreadsheet..." : "Writing to database..."}
            </h3>
            <p className="text-sm text-zinc-400 mt-1">This takes only a few seconds.</p>
          </div>
        )}

        {/* Step: Review SNJ */}
        {step === "review-snj" && (
          <>
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {/* Review Filter Bar */}
              <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm font-semibold text-zinc-300">Filter SNJ by Class</span>
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger className="h-8 w-[140px] bg-zinc-900 border-zinc-800 text-zinc-200">
                      <SelectValue placeholder="All Classes" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-zinc-800 hover:bg-zinc-800 bg-zinc-900"
                    onClick={() => setBulkSnj(true)}
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Mark All Breakdown
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-zinc-800 hover:bg-zinc-800 bg-zinc-900"
                    onClick={() => setBulkSnj(false)}
                  >
                    <Square className="h-3.5 w-3.5 mr-1 text-zinc-400" /> Mark All Standby
                  </Button>
                </div>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-3">
                  <div className="rounded-lg bg-zinc-900/30 border border-zinc-800 p-4 mb-4">
                    <span className="text-xs font-semibold text-amber-500 uppercase tracking-wide">
                      SNJ Status Classification
                    </span>
                    <p className="text-xs text-zinc-400 mt-1">
                      Excel contains {snjGroups.length} SNJ standby logs. Classify below if the SNJ
                      duration should count as **equipment breakdown** (drops PA) or **normal standby** (retains PA).
                    </p>
                  </div>

                  {filteredSnjGroups.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                      No matching records for this class filter.
                    </div>
                  ) : (
                    filteredSnjGroups.map((g) => {
                      const absoluteIdx = snjGroups.findIndex(
                        (orig) =>
                          orig.equipment === g.equipment &&
                          orig.date === g.date &&
                          orig.shift === g.shift
                      );
                      return (
                        <div
                          key={`${g.equipment}_${g.date}`}
                          className={`rounded-lg border p-4 flex items-center justify-between transition-colors ${
                            g.isBreakdown
                              ? "bg-red-950/20 border-red-900/50 hover:bg-red-950/30"
                              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900/60"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-zinc-200">
                                {g.unitCode}
                              </span>
                              <Badge className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-normal">
                                {g.unitClass || "Unassigned"}
                              </Badge>
                              {g.isBreakdown && (
                                <Badge variant="destructive" className="bg-red-900 text-red-100">
                                  Breakdown
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5 flex-wrap">
                              <span>{g.unitName}</span>
                              <span className="h-1 w-1 rounded-full bg-zinc-600" />
                              <span>{g.totalHours.toFixed(2)} hours</span>
                              <span className="h-1 w-1 rounded-full bg-zinc-600" />
                              <span className="font-mono">{g.date}</span>
                              <Badge className="text-[10px] py-0 px-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">
                                {g.shift}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pl-4">
                            <span className="text-xs font-semibold text-zinc-400">
                              {g.isBreakdown ? "Unit Down" : "Standby"}
                            </span>
                            <Switch
                              checked={g.isBreakdown}
                              onCheckedChange={() => toggleSnjBreakdown(absoluteIdx)}
                              className="data-[state=checked]:bg-red-600"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/40">
              <Button
                variant="outline"
                onClick={resetState}
                className="border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                Reset
              </Button>
              <Button
                onClick={() => setStep("summary")}
                className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
              >
                Proceed to Summary <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step: Summary */}
        {step === "summary" && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-2">Import Shift Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-zinc-500">Log Date</span>
                      <p className="font-mono text-zinc-300 font-semibold mt-0.5">{logDate}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Detected Shift</span>
                      <p className="text-zinc-300 font-semibold mt-0.5">{shift === "DS" ? "Day Shift" : "Night Shift"}</p>
                    </div>
                  </div>
                </div>

                {unknownEquipment.length > 0 && (
                  <div className="rounded-lg bg-yellow-950/20 border border-yellow-900/40 p-4">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-yellow-500 uppercase tracking-wide">
                          Unknown Equipment Codes Detected
                        </h4>
                        <p className="text-xs text-zinc-400 mt-1">
                          The following {unknownEquipment.length} codes in Excel did not match any unit in the database and will be skipped:
                        </p>
                        <p className="text-xs font-mono text-yellow-500/80 mt-1 flex flex-wrap gap-1.5">
                          {unknownEquipment.map(code => (
                            <span key={code} className="bg-yellow-950/40 px-1 py-0.5 rounded border border-yellow-900/40">{code}</span>
                          ))}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                    Records to Write
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center bg-zinc-900/70 p-2 rounded">
                      <span className="text-zinc-400">Standard Downtime (BPM, BBR)</span>
                      <Badge className="bg-zinc-800 text-zinc-200">{downtimeRows.length} records</Badge>
                    </div>
                    <div className="flex justify-between items-center bg-zinc-900/70 p-2 rounded">
                      <span className="text-zinc-400">Classified SNJ Breakdowns</span>
                      <Badge className="bg-zinc-800 text-zinc-200">
                        {snjGroups.filter((g) => g.isBreakdown).length} records
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center bg-zinc-900/70 p-2 rounded text-zinc-100 font-bold border-t border-zinc-800 pt-2">
                      <span>Total Insert Items</span>
                      <span className="text-amber-500">
                        {downtimeRows.length + snjGroups.filter((g) => g.isBreakdown).length} items
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 p-3 bg-red-950/10 border border-red-900/30 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200/80">
                    **Overwriting Warning**: Continuing will delete ALL existing Excel-imported records matching the date ({logDate}) and shift ({shift}) to prevent duplicate logs.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/40">
              <Button
                variant="outline"
                onClick={resetState}
                className="border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImport}
                className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Import & Overwrite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
