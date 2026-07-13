-- LavbundsMRV: persistente tabeller for CO2 v12-modulet (før: kun in-memory mock).
-- Domæneobjekterne gemmes som jsonb-payload med nøglefelter til opslag, så
-- TypeScript-typerne i src/types/lavbund.ts forbliver kilden til sandhed.
--
-- linked_project_id kobler et lavbundsprojekt til et kerneprojekt, så
-- beregnings-snapshots kan fødes ind i projektets indicators (co2e_reduced).
--
-- RLS: authenticated fuld adgang (modulet er internt); kan strammes til
-- org-scoping når lavbundsprojekter får organisationstilknytning.

CREATE TABLE IF NOT EXISTS public.lavbund_projekter (
  id                 text PRIMARY KEY,
  navn               text NOT NULL,
  status             text,
  linked_project_id  uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  payload            jsonb NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lavbund_maalepunkter (
  id         text PRIMARY KEY,
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_maalepunkter_projekt ON public.lavbund_maalepunkter(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_readings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projekt_id    text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  maalepunkt_id text NOT NULL,
  tidspunkt     timestamptz,
  payload       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_readings_projekt ON public.lavbund_readings(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_transekter (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  nr         integer,
  fase       text,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_transekter_projekt ON public.lavbund_transekter(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_groefter (
  id         text PRIMARY KEY,
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_groefter_projekt ON public.lavbund_groefter(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projekt_id, seq)
);

CREATE TABLE IF NOT EXISTS public.lavbund_snapshots (
  projekt_id text PRIMARY KEY REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lavbund_projekter','lavbund_maalepunkter','lavbund_readings',
    'lavbund_transekter','lavbund_groefter','lavbund_ledger','lavbund_snapshots'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
