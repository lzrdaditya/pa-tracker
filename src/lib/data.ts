import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
}

export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: async (): Promise<Unit[]> => {
      const { data, error } = await supabase
        .from("units")
        .select("id,code,name,notes")
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("id,pa_target")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { id: 1, pa_target: 0.9 };
      return data as Settings;
    },
  });
}

/** All breakdowns overlapping the given month (open OR finished this month). */
export function useMonthBreakdowns(anchor?: Date) {
  const { start, end } = monthBounds(anchor);
  return useQuery({
    queryKey: ["breakdowns", "month", start.toISOString()],
    queryFn: async (): Promise<Breakdown[]> => {
      const { data, error } = await supabase
        .from("breakdowns")
        .select("id,unit_id,started_at,finished_at,notes")
        .lt("started_at", end.toISOString())
        .or(`finished_at.is.null,finished_at.gte.${start.toISOString()}`)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Breakdown[];
    },
    refetchInterval: 60_000,
  });
}

export function useUnitBreakdowns(unitId: string | null) {
  return useQuery({
    enabled: !!unitId,
    queryKey: ["breakdowns", "unit", unitId],
    queryFn: async (): Promise<Breakdown[]> => {
      const { data, error } = await supabase
        .from("breakdowns")
        .select("id,unit_id,started_at,finished_at,notes")
        .eq("unit_id", unitId!)
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Breakdown[];
    },
  });
}

export function useCreateBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      unit_id: string;
      started_at: string;
      finished_at?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from("breakdowns").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["breakdowns"] }),
  });
}

export function useUpdateBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      started_at?: string;
      finished_at?: string | null;
      notes?: string | null;
    }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("breakdowns").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["breakdowns"] }),
  });
}

export function useDeleteBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("breakdowns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["breakdowns"] }),
  });
}

export function useSaveUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (u: { id?: string; code: string; name: string; notes?: string | null }) => {
      if (u.id) {
        const { error } = await supabase
          .from("units")
          .update({ code: u.code, name: u.name, notes: u.notes ?? null })
          .eq("id", u.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("units")
          .insert({ code: u.code, name: u.name, notes: u.notes ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["breakdowns"] });
    },
  });
}

export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pa_target: number) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ id: 1, pa_target }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}
