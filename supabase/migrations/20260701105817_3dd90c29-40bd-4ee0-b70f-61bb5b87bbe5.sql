
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO anon, authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read units" ON public.units FOR SELECT USING (true);
CREATE POLICY "public insert units" ON public.units FOR INSERT WITH CHECK (true);
CREATE POLICY "public update units" ON public.units FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete units" ON public.units FOR DELETE USING (true);

CREATE TABLE public.downtime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  downtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (downtime_hours >= 0 AND downtime_hours <= 24),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, log_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.downtime_logs TO anon, authenticated;
GRANT ALL ON public.downtime_logs TO service_role;
ALTER TABLE public.downtime_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read logs" ON public.downtime_logs FOR SELECT USING (true);
CREATE POLICY "public insert logs" ON public.downtime_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "public update logs" ON public.downtime_logs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete logs" ON public.downtime_logs FOR DELETE USING (true);

CREATE INDEX idx_downtime_logs_unit_date ON public.downtime_logs(unit_id, log_date);

CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pa_target NUMERIC(5,4) NOT NULL DEFAULT 0.9,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "public insert settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "public update settings" ON public.app_settings FOR UPDATE USING (true) WITH CHECK (true);

INSERT INTO public.app_settings (id, pa_target) VALUES (1, 0.9) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER units_updated BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER logs_updated BEFORE UPDATE ON public.downtime_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
