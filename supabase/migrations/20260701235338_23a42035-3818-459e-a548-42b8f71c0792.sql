
CREATE TABLE public.breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.breakdowns TO anon, authenticated;
GRANT ALL ON public.breakdowns TO service_role;
ALTER TABLE public.breakdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read breakdowns" ON public.breakdowns FOR SELECT USING (true);
CREATE POLICY "public insert breakdowns" ON public.breakdowns FOR INSERT WITH CHECK (true);
CREATE POLICY "public update breakdowns" ON public.breakdowns FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete breakdowns" ON public.breakdowns FOR DELETE USING (true);
CREATE INDEX breakdowns_unit_idx ON public.breakdowns(unit_id);
CREATE INDEX breakdowns_started_idx ON public.breakdowns(started_at);
CREATE TRIGGER breakdowns_set_updated_at BEFORE UPDATE ON public.breakdowns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
