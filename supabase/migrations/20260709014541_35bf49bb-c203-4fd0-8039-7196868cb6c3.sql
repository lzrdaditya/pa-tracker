
-- Revert to anonymous access for all app tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('units','breakdowns','downtime_logs','app_settings') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.breakdowns TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.downtime_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.units, public.breakdowns, public.downtime_logs, public.app_settings TO service_role;

CREATE POLICY "public all units" ON public.units FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public all breakdowns" ON public.breakdowns FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public all downtime_logs" ON public.downtime_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public read app_settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert app_settings" ON public.app_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update app_settings" ON public.app_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
