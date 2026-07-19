import * as XLSX from "xlsx";
import { Unit } from "./data";

export interface ZrppRow {
  date: Date;
  shift: "DS" | "NS";
  startExec: Date;
  finishExec: Date | null; // Nullable for live, continuous tracking
  equipment: string;
  statusCode: string;
  activityHours: number;
  remarks: string | null;
  cancelled: boolean;
}

export interface ParsedUpload {
  downtimeRows: ZrppRow[];
  snjRows: ZrppRow[];
  unknownEquipment: string[];
  logDate: string; // YYYY-MM-DD
  shift: "DS" | "NS";
}

export interface SnjGroup {
  equipment: string;
  unitId: string | null;
  unitCode: string;
  unitName: string;
  unitClass: string;
  date: string; // YYYY-MM-DD
  shift: "DS" | "NS";
  totalHours: number;
  startExec: string; // ISO string
  finishExec: string; // ISO string
  isBreakdown: boolean;
}

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseTime(val: any): { hours: number; minutes: number; seconds: number } {
  if (val instanceof Date) {
    return {
      hours: val.getHours(),
      minutes: val.getMinutes(),
      seconds: val.getSeconds(),
    };
  }
  if (typeof val === "number") {
    const totalSeconds = Math.round(val * 24 * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
  }
  if (typeof val === "string") {
    const cleaned = val.trim();
    const match = cleaned.match(/^(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = match[3] ? parseInt(match[3], 10) : 0;
      const ampm = match[4]?.toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      return { hours, minutes, seconds };
    }
    const d = new Date(`1970-01-01T${cleaned}`);
    if (!isNaN(d.getTime())) {
      return { hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds() };
    }
  }
  return { hours: 0, minutes: 0, seconds: 0 };
}

function parseDate(val: any): Date {
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    const date = new Date(1899, 11, 30);
    date.setDate(date.getDate() + Math.floor(val));
    return date;
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function combineDateAndTime(dateVal: any, timeVal: any, shift: "DS" | "NS"): Date {
  const baseDate = parseDate(dateVal);
  const timeInfo = parseTime(timeVal);

  let year = baseDate.getFullYear();
  let month = baseDate.getMonth();
  let day = baseDate.getDate();

  if (shift === "NS" && timeInfo.hours < 12) {
    const nextDay = new Date(year, month, day + 1);
    year = nextDay.getFullYear();
    month = nextDay.getMonth();
    day = nextDay.getDate();
  }

  return new Date(year, month, day, timeInfo.hours, timeInfo.minutes, timeInfo.seconds);
}

export async function parseZrppExcel(file: File, units: Unit[]): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { raw: true });

        const snjRows: ZrppRow[] = [];
        const rawDowntimeRows: ZrppRow[] = [];
        const unknownEquipmentSet = new Set<string>();

        let detectedDateStr = "";
        let detectedShift: "DS" | "NS" = "DS";

        // Group rows per unit to identify sequence flow
        const equipmentTimeline: Record<string, ZrppRow[]> = {};
        const absoluteLatestState: Record<string, { time: number; statusCode: string }> = {};

        for (const rawRow of json) {
          const row: Record<string, any> = {};
          for (const key of Object.keys(rawRow)) {
            row[normalizeKey(key)] = rawRow[key];
          }

          const cancelled = !!(row.cancelled === 1 || row.cancelled === "1" || String(row.cancelled).toLowerCase() === "true" || row.cancelled === "yes");
          if (cancelled) continue;

          const equipment = String(row.equipment || "").trim();
          if (!equipment) continue;

          const matchedUnit = units.find((u) => u.code.toLowerCase() === equipment.toLowerCase());
          if (!matchedUnit) {
            unknownEquipmentSet.add(equipment);
          }

          const shift = String(row.shift || "").trim().toUpperCase() === "NS" ? "NS" : "DS";
          const rawDate = row.date;
          const parsedBaseDate = parseDate(rawDate);
          const dateStr = `${parsedBaseDate.getFullYear()}-${String(parsedBaseDate.getMonth() + 1).padStart(2, "0")}-${String(parsedBaseDate.getDate()).padStart(2, "0")}`;

          if (!detectedDateStr) {
            detectedDateStr = dateStr;
            detectedShift = shift;
          }

          const startExec = combineDateAndTime(rawDate, row.startexec, shift);
          const finishExec = combineDateAndTime(rawDate, row.finishexec, shift);
          const statusCode = String(row.statuscodeforopsdb || row.status || "").trim().toUpperCase();
          const activityHours = parseFloat(row.activityhours || 0);
          const remarks = row.remarks ? String(row.remarks).trim() : null;

          const zRow: ZrppRow = {
            date: parsedBaseDate,
            shift,
            startExec,
            finishExec,
            equipment,
            statusCode,
            activityHours,
            remarks,
            cancelled: false,
          };

          const eqKey = equipment.toLowerCase();
          if (!equipmentTimeline[eqKey]) equipmentTimeline[eqKey] = [];
          equipmentTimeline[eqKey].push(zRow);

          // Track the exact absolute final operation status code at the shift end
          const startTimeMs = startExec.getTime();
          if (!absoluteLatestState[eqKey] || startTimeMs > absoluteLatestState[eqKey].time) {
            absoluteLatestState[eqKey] = { time: startTimeMs, statusCode };
          }
        }

        const downtimeRows: ZrppRow[] = [];

        // Group row chunks into structural continuous events instead of dumping raw lines
        for (const [eqKey, rows] of Object.entries(equipmentTimeline)) {
          // Sort chronologically
          const sortedRows = rows.sort((a, b) => a.startExec.getTime() - b.startExec.getTime());
          
          let currentEvent: ZrppRow | null = null;

          for (const row of sortedRows) {
            const isDowntimeStatus = row.statusCode === "BPM" || row.statusCode === "BBR";

            if (isDowntimeStatus) {
              if (!currentEvent) {
                // Initialize a new continuous breakdown block event track
                currentEvent = { ...row };
              } else {
                // If it continues immediately, extend the boundary limit timestamp pointer forward
                currentEvent.finishExec = row.finishExec;
                currentEvent.activityHours += row.activityHours;
                if (row.remarks) {
                  currentEvent.remarks = currentEvent.remarks 
                    ? `${currentEvent.remarks} | ${row.remarks}` 
                    : row.remarks;
                }
              }
            } else {
              // If status shifts back to production (e.g. SNJ/OPS) close previous tracking event blocks safely
              if (currentEvent) {
                downtimeRows.push(currentEvent);
                currentEvent = null;
              }
            }
          }

          // Handle the final trailing segment boundary rule
          if (currentEvent) {
            const finalUnitState = absoluteLatestState[eqKey];
            const endedInDowntime = finalUnitState && (finalUnitState.statusCode === "BBR" || finalUnitState.statusCode === "BPM");

            if (endedInDowntime) {
              // If the final status remains un-repaired at shift end, detach finish boundary constraints so it drains live budget
              currentEvent.finishExec = null;
            }
            downtimeRows.push(currentEvent);
          }
        }

        // Extract SNJ rows normally
        for (const rows of Object.values(equipmentTimeline)) {
          for (const r of rows) {
            if (r.statusCode === "SNJ") snjRows.push(r);
          }
        }

        resolve({
          downtimeRows,
          snjRows,
          unknownEquipment: Array.from(unknownEquipmentSet),
          logDate: detectedDateStr || new Date().toISOString().slice(0, 10),
          shift: detectedShift,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function aggregateSnjGroups(snjRows: ZrppRow[], units: Unit[]): SnjGroup[] {
  const groups: Record<string, ZrppRow[]> = {};

  for (const row of snjRows) {
    const baseDate = row.date;
    const dateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
    const key = `${row.equipment.toLowerCase()}_${dateStr}_${row.shift}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  return Object.values(groups).map((rows) => {
    const first = rows[0];
    const baseDate = first.date;
    const dateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
    const matchedUnit = units.find((u) => u.code.toLowerCase() === first.equipment.toLowerCase());

    const sorted = [...rows].sort((a, b) => a.startExec.getTime() - b.startExec.getTime());
    const startExec = sorted[0].startExec.toISOString();
    
    const finishExec = sorted[sorted.length - 1].finishExec 
      ? sorted[sorted.length - 1].finishExec!.toISOString() 
      : new Date().toISOString();
      
    const totalHours = rows.reduce((sum, r) => sum + r.activityHours, 0);

    return {
      equipment: first.equipment,
      unitId: matchedUnit?.id || null,
      unitCode: matchedUnit?.code || first.equipment,
      unitName: matchedUnit?.name || "Unknown Unit",
      unitClass: (matchedUnit?.notes ?? "").trim() || "Unassigned",
      date: dateStr,
      shift: first.shift,
      totalHours,
      startExec,
      finishExec,
      isBreakdown: false,
    };
  });
}
