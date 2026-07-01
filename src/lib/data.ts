import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRange } from "@/lib/pa";

export interface Unit {
  id: string;
  code: string;
  name: string;
  notes: string | null;
}

export interface DowntimeLog {
  id: string;
  unit_id: string;
  log_date: string;
  downtime_hours: number;
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

export function useMonthLogs() {
  const { start, end } = monthRange();
  return useQuery({
    queryKey: ["logs", "month", start, end],
    queryFn: async (): Promise<DowntimeLog[]> => {
      const { data, error } = await supabase
        .from("downtime_logs")
        .select("id,unit_id,log_date,downtime_hours,notes")
        .gte("log_date", start)
        .lte("log_date", end);
      if (error) throw error;
      return (data ?? []) as DowntimeLog[];
    },
  });
}

export function useUnitLogs(unitId: string | null) {
  const { start, end } = monthRange();
  return useQuery({
    enabled: !!unitId,
    queryKey: ["logs", "unit", unitId, start, end],
    queryFn: async (): Promise<DowntimeLog[]> => {
      const { data, error } = await supabase
        .from("downtime_logs")
        .select("id,unit_id,log_date,downtime_hours,notes")
        .eq("unit_id", unitId!)
        .gte("log_date", start)
        .lte("log_date", end)
        .order("log_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DowntimeLog[];
    },
  });
}

export function useUpsertLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      unit_id: string;
      log_date: string;
      downtime_hours: number;
      notes?: string | null;
    }) => {
      const { error } = await supabase
        .from("downtime_logs")
        .upsert(input, { onConflict: "unit_id,log_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
    },
  });
}

export function useDeleteLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("downtime_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs"] }),
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
      qc.invalidateQueries({ queryKey: ["logs"] });
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
