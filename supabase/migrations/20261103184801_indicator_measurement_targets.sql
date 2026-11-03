ALTER TABLE public.indicators
  ADD COLUMN target_value numeric,
  ADD COLUMN target_direction text,
  ADD COLUMN target_unit text,
  ADD CONSTRAINT indicators_measurement_target_complete CHECK (
    (target_value IS NULL AND target_direction IS NULL AND target_unit IS NULL)
    OR (
      target_value IS NOT NULL
      AND target_value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      AND target_direction IS NOT NULL
      AND target_direction IN ('at_least', 'at_most')
      AND target_unit IS NOT NULL
      AND char_length(btrim(target_unit)) BETWEEN 1 AND 120
    )
  );
