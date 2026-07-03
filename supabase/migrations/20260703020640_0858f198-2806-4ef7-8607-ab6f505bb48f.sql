ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS mtbs_target_hours numeric NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS mttr_target_hours numeric NOT NULL DEFAULT 10;

UPDATE public.app_settings SET mtbs_target_hours = 65 WHERE mtbs_target_hours IS NULL;
UPDATE public.app_settings SET mttr_target_hours = 10 WHERE mttr_target_hours IS NULL;

ALTER TABLE public.units
  ALTER COLUMN mtbs_target_hours SET DEFAULT 65,
  ALTER COLUMN mttr_target_hours SET DEFAULT 10;