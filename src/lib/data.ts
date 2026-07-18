import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "@/lib/db";
import { monthBounds } from "@/lib/pa";

export interface Unit {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  mtbs_target_hours: number;
  mttr_target_hours: number;
}

export interface Breakdown {
  id: string;
  unit_id: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
}

export interface Settings {
  id: number;
  pa_target: number;
  mtbs_target_hours: number;
  mttr_target_hours: number;
}

// ----------------------------------------------------
// Server Functions
// ----------------------------------------------------

export const getUnitsFn = createServerFn({ method: "GET" })
  .handler(async (): Promise<Unit[]> => {
    const rows = await sql`
      SELECT id, code, name, notes, mtbs_target_hours::float, mttr_target_hours::float 
      FROM public.units 
      ORDER BY code
    `;
    return rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      notes: r.notes,
      mtbs_target_hours: Number(r.mtbs_target_hours),
      mttr_target_hours: Number(r.mttr_target_hours)
    }));
  });

export const getSettingsFn = createServerFn({ method: "GET" })
  .handler(async (): Promise<Settings> => {
    try {
      // Ensure the default row always exists
      await sql`
        INSERT INTO public.app_settings (id, pa_target, mtbs_target_hours, mttr_target_hours)
        VALUES (1, 0.9, 65, 10)
        ON CONFLICT (id) DO NOTHING
      `;
      const rows = await sql`
        SELECT id, pa_target::float, mtbs_target_hours::float, mttr_target_hours::float 
        FROM public.app_settings 
        WHERE id = 1
      `;
      if (!rows[0]) return { id: 1, pa_target: 0.9, mtbs_target_hours: 65, mttr_target_hours: 10 };
      return {
        id: rows[0].id,
        pa_target: Number(rows[0].pa_target),
        mtbs_target_hours: Number(rows[0].mtbs_target_hours),
        mttr_target_hours: Number(rows[0].mttr_target_hours)
      };
    } catch (e) {
      console.error("getSettingsFn error:", e);
      return { id: 1, pa_target: 0.9, mtbs_target_hours: 65, mttr_target_hours: 10 };
    }
  });

export const getRangeBreakdownsFn = createServerFn({ method: "GET" })
  .validator((d: { from: string; to: string }) => d)
  .handler(async ({ data: { from, to } }): Promise<Breakdown[]> => {
    const rows = await sql`
      SELECT id, unit_id, started_at, finished_at, notes 
      FROM public.breakdowns 
      WHERE started_at < ${to} 
        AND (finished_at IS NULL OR finished_at >= ${from})
      ORDER BY started_at DESC
    `;
    return rows.map(r => ({
      id: r.id,
      unit_id: r.unit_id,
      started_at: r.started_at.toISOString(),
      finished_at: r.finished_at ? r.finished_at.toISOString() : null,
      notes: r.notes
    }));
  });

export const getUnitBreakdownsFn = createServerFn({ method: "GET" })
  .validator((unitId: string) => unitId)
  .handler(async ({ data: unitId }): Promise<Breakdown[]> => {
    const rows = await sql`
      SELECT id, unit_id, started_at, finished_at, notes 
      FROM public.breakdowns 
      WHERE unit_id = ${unitId}
      ORDER BY started_at DESC
      LIMIT 30
    `;
    return rows.map(r => ({
      id: r.id,
      unit_id: r.unit_id,
      started_at: r.started_at.toISOString(),
      finished_at: r.finished_at ? r.finished_at.toISOString() : null,
      notes: r.notes
    }));
  });

export const createBreakdownFn = createServerFn({ method: "POST" })
  .validator((input: {
    unit_id: string;
    started_at: string;
    finished_at?: string | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data: input }) => {
    await sql`
      INSERT INTO public.breakdowns (unit_id, started_at, finished_at, notes) 
      VALUES (${input.unit_id}, ${input.started_at}, ${input.finished_at || null}, ${input.notes || null})
    `;
  });

export const updateBreakdownFn = createServerFn({ method: "POST" })
  .validator((input: {
    id: string;
    started_at?: string;
    finished_at?: string | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data: input }) => {
    const { id } = input;
    await sql`
      UPDATE public.breakdowns 
      SET 
        started_at = COALESCE(${input.started_at || null}, started_at),
        finished_at = ${input.finished_at === undefined ? sql`finished_at` : (input.finished_at || null)},
        notes = ${input.notes === undefined ? sql`notes` : (input.notes || null)}
      WHERE id = ${id}
    `;
  });

export const deleteBreakdownFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    await sql`DELETE FROM public.breakdowns WHERE id = ${id}`;
  });

export const saveUnitFn = createServerFn({ method: "POST" })
  .validator((u: {
    id?: string;
    code: string;
    name: string;
    notes?: string | null;
    mtbs_target_hours?: number;
    mttr_target_hours?: number;
  }) => u)
  .handler(async ({ data: u }) => {
    const notes = u.notes ?? null;
    const mtbs = u.mtbs_target_hours ?? 65;
    const mttr = u.mttr_target_hours ?? 10;
    if (u.id) {
      await sql`
        UPDATE public.units 
        SET code = ${u.code}, name = ${u.name}, notes = ${notes}, mtbs_target_hours = ${mtbs}, mttr_target_hours = ${mttr} 
        WHERE id = ${u.id}
      `;
    } else {
      await sql`
        INSERT INTO public.units (code, name, notes, mtbs_target_hours, mttr_target_hours) 
        VALUES (${u.code}, ${u.name}, ${notes}, ${mtbs}, ${mttr})
      `;
    }
  });

export const deleteUnitFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    await sql`DELETE FROM public.units WHERE id = ${id}`;
  });

export const saveTargetFn = createServerFn({ method: "POST" })
  .validator((input: {
    pa_target?: number;
    mtbs_target_hours?: number;
    mttr_target_hours?: number;
  }) => input)
  .handler(async ({ data: input }) => {
    const pa = input.pa_target !== undefined ? input.pa_target : 0.9;
    const mtbs = input.mtbs_target_hours !== undefined ? input.mtbs_target_hours : 65;
    const mttr = input.mttr_target_hours !== undefined ? input.mttr_target_hours : 10;

    await sql`
      INSERT INTO public.app_settings (id, pa_target, mtbs_target_hours, mttr_target_hours) 
      VALUES (1, ${pa}, ${mtbs}, ${mttr}) 
      ON CONFLICT (id) DO UPDATE SET 
        pa_target = EXCLUDED.pa_target,
        mtbs_target_hours = EXCLUDED.mtbs_target_hours,
        mttr_target_hours = EXCLUDED.mttr_target_hours
    `;
  });

export const uploadExcelLogsFn = createServerFn({ method: "POST" })
  .validator((input: {
    startLocal: string;
    endLocal: string;
    recordsToInsert: Array<{
      unit_id: string;
      started_at: string;
      finished_at: string;
      notes: string;
    }>;
    fileName: string;
    shift: string;
    logDate: string;
  }) => input)
  .handler(async ({ data: { startLocal, endLocal, recordsToInsert, fileName, shift, logDate } }) => {
    await sql.begin(async (tx) => {
      const existing = await tx`
        SELECT id FROM public.breakdowns 
        WHERE started_at >= ${startLocal} 
          AND started_at < ${endLocal} 
          AND notes LIKE 'Excel Import%'
      `;

      if (existing.length > 0) {
        const ids = existing.map(x => x.id);
        await tx`DELETE FROM public.breakdowns WHERE id IN ${tx(ids)}`;
      }

      if (recordsToInsert.length > 0) {
        await tx`
          INSERT INTO public.breakdowns (unit_id, started_at, finished_at, notes) 
          VALUES ${tx(recordsToInsert.map(r => [r.unit_id, r.started_at, r.finished_at, r.notes]))}
        `;
      }

      try {
        await tx`
          INSERT INTO public.excel_upload_log (file_name, shift, log_date, records_inserted) 
          VALUES (${fileName}, ${shift}, ${logDate}, ${recordsToInsert.length})
        `;
      } catch (e) {
        console.warn("Upload log table not available yet:", e);
      }
    });

    return { deletedCount: 0, insertedCount: recordsToInsert.length };
  });

// ----------------------------------------------------
// React Query Client Hooks
// ----------------------------------------------------

export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: () => getUnitsFn(),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettingsFn(),
  });
}

export function useRangeBreakdowns(from: Date, to: Date) {
  return useQuery({
    queryKey: ["breakdowns", "range", from.toISOString(), to.toISOString()],
    queryFn: () => getRangeBreakdownsFn({ from: from.toISOString(), to: to.toISOString() }),
    refetchInterval: 60_000,
  });
}

export function useMonthBreakdowns(anchor?: Date) {
  const { start, end } = monthBounds(anchor);
  return useQuery({
    queryKey: ["breakdowns", "month", start.toISOString()],
    queryFn: () => getRangeBreakdownsFn({ from: start.toISOString(), to: end.toISOString() }),
    refetchInterval: 60_000,
  });
}

export function useUnitBreakdowns(unitId: string | null) {
  return useQuery({
    enabled: !!unitId,
    queryKey: ["breakdowns", "unit", unitId],
    queryFn: () => getUnitBreakdownsFn(unitId!),
  });
}

export function useCreateBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      unit_id: string;
      started_at: string;
      finished_at?: string | null;
      notes?: string | null;
    }) => createBreakdownFn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["breakdowns"] }),
  });
}

export function useUpdateBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      started_at?: string;
      finished_at?: string | null;
      notes?: string | null;
    }) => updateBreakdownFn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["breakdowns"] }),
  });
}

export function useDeleteBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBreakdownFn(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["breakdowns"] }),
  });
}

export function useSaveUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (u: {
      id?: string;
      code: string;
      name: string;
      notes?: string | null;
      mtbs_target_hours?: number;
      mttr_target_hours?: number;
    }) => saveUnitFn(u),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUnitFn(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["breakdowns"] });
    },
  });
}

export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      pa_target?: number;
      mtbs_target_hours?: number;
      mttr_target_hours?: number;
    }) => saveTargetFn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useUploadExcelLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      startLocal: string;
      endLocal: string;
      recordsToInsert: Array<{
        unit_id: string;
        started_at: string;
        finished_at: string;
        notes: string;
      }>;
      fileName: string;
      shift: string;
      logDate: string;
    }) => uploadExcelLogsFn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["breakdowns"] }),
  });
}
