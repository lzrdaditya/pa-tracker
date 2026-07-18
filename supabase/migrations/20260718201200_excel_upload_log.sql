CREATE TABLE public.excel_upload_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL,
  shift text NOT NULL,
  log_date date NOT NULL,
  records_inserted int NOT NULL DEFAULT 0,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.excel_upload_log TO anon, authenticated;
GRANT ALL ON public.excel_upload_log TO service_role;
ALTER TABLE public.excel_upload_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all excel_upload_log" ON public.excel_upload_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER excel_upload_log_updated BEFORE UPDATE ON public.excel_upload_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
