
-- app_settings
DROP POLICY IF EXISTS "public read settings" ON public.app_settings;
DROP POLICY IF EXISTS "public insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "public update settings" ON public.app_settings;
REVOKE ALL ON public.app_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
CREATE POLICY "auth read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update settings" ON public.app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- breakdowns
DROP POLICY IF EXISTS "public read breakdowns" ON public.breakdowns;
DROP POLICY IF EXISTS "public insert breakdowns" ON public.breakdowns;
DROP POLICY IF EXISTS "public update breakdowns" ON public.breakdowns;
DROP POLICY IF EXISTS "public delete breakdowns" ON public.breakdowns;
REVOKE ALL ON public.breakdowns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.breakdowns TO authenticated;
GRANT ALL ON public.breakdowns TO service_role;
CREATE POLICY "auth read breakdowns" ON public.breakdowns FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert breakdowns" ON public.breakdowns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update breakdowns" ON public.breakdowns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete breakdowns" ON public.breakdowns FOR DELETE TO authenticated USING (true);

-- downtime_logs
DROP POLICY IF EXISTS "public read logs" ON public.downtime_logs;
DROP POLICY IF EXISTS "public insert logs" ON public.downtime_logs;
DROP POLICY IF EXISTS "public update logs" ON public.downtime_logs;
DROP POLICY IF EXISTS "public delete logs" ON public.downtime_logs;
REVOKE ALL ON public.downtime_logs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.downtime_logs TO authenticated;
GRANT ALL ON public.downtime_logs TO service_role;
CREATE POLICY "auth read logs" ON public.downtime_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert logs" ON public.downtime_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update logs" ON public.downtime_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete logs" ON public.downtime_logs FOR DELETE TO authenticated USING (true);

-- units
DROP POLICY IF EXISTS "public read units" ON public.units;
DROP POLICY IF EXISTS "public insert units" ON public.units;
DROP POLICY IF EXISTS "public update units" ON public.units;
DROP POLICY IF EXISTS "public delete units" ON public.units;
REVOKE ALL ON public.units FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
CREATE POLICY "auth read units" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert units" ON public.units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update units" ON public.units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete units" ON public.units FOR DELETE TO authenticated USING (true);
