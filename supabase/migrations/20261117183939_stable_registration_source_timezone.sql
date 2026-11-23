-- Converting a composite row to JSON renders timestamptz in the session time zone.
-- Freeze that conversion before hashing and reuse its UTC capture time in the citation.
create function private.report_registration_payload(registration anyelement)
returns jsonb
language sql stable strict security invoker
set search_path = ''
set timezone = 'UTC'
as $$ select pg_catalog.to_jsonb(registration) $$;

revoke all on function private.report_registration_payload(anyelement) from public, anon;
grant execute on function private.report_registration_payload(anyelement) to authenticated, service_role;

create or replace view public.report_registration_sources with (security_invoker = true) as
with registrations as (
  select 'field:' || o.id::text as id, o.project_id,
    coalesce(nullif(o.metadata->>'objectId', ''), nullif(o.metadata->>'label', ''), o.observation_type) as title,
    'Feltregistrering'::text as kind, 'observed_at'::text as capture_key,
    private.report_registration_payload(o) as payload
  from public.field_observations o where o.observation_type in ('bridge_visual', 'nature_survey')
  union all
  select 'survey-area:' || a.id::text, a.project_id, a.name,
    'Undersøgelsesområde', 'created_at', private.report_registration_payload(a)
  from public.monitoring_zones a where a.zone_type = 'nature_survey'
), hashed as (
  select *, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') as checksum
  from registrations
)
select id, project_id, jsonb_build_object(
  'id', id, 'title', title, 'kind', kind, 'capturedAt', payload->capture_key,
  'checksum', checksum, 'position', null, 'version', checksum,
  'method', 'Gemte feltoplysninger; SHA-256 af PostgreSQL JSONB-repræsentationen'
) as source
from hashed;
