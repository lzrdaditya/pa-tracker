ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS mtbs_target_hours numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS mttr_target_hours numeric NOT NULL DEFAULT 8;