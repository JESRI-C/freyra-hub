-- Unik nøgle så natur-geodata kan upsertes idempotent i geo_features.
-- NULL external_id (ældre seed-rækker) kolliderer aldrig — Postgres behandler
-- NULLs som distinkte i unikke indekser.
CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_features_layer_external
  ON public.geo_features (layer_id, external_id);
