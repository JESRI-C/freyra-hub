-- The standard report trigger first locks the document and canonicalizes media sources.
create function private.validate_bridge_report_observations() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  project uuid;
  observation public.field_observations;
  entry jsonb;
  expected jsonb;
  snapshots jsonb := '[]'::jsonb;
begin
  if new.content->>'templateId' is distinct from 'bridge_registration' and exists (
    select 1 from public.report_revisions prior
    where prior.report_id = new.report_id and prior.version = new.version - 1
      and prior.content->>'templateId' = 'bridge_registration'
  ) then
    raise exception 'En brorapport skal bevare sin rapportskabelon.';
  end if;

  if not (new.content ? 'bridgeObservations') then
    if new.content->>'templateId' = 'bridge_registration' and new.status = 'approved' then
      raise exception 'Indlæs broregistreringerne før godkendelse.';
    end if;
    return new;
  end if;

  if new.content->>'templateId' is distinct from 'bridge_registration'
     or jsonb_typeof(new.content->'bridgeObservations') is distinct from 'array' then
    raise exception 'Ugyldigt rapportgrundlag for broregistreringer.';
  end if;

  if jsonb_array_length(new.content->'bridgeObservations') = 0 or exists (
    select 1 from jsonb_array_elements(new.content->'bridgeObservations') item(value)
    group by item.value->>'id' having count(*) > 1
  ) then
    raise exception 'Objektlisten mangler registreringer eller indeholder dubletter.';
  end if;

  select project_id into strict project from public.report_documents where id = new.report_id;
  for entry in select * from jsonb_array_elements(new.content->'bridgeObservations') loop
    select * into observation from public.field_observations
    where id = (entry->>'id')::uuid and project_id = project and observation_type = 'bridge_visual'
      and metadata->>'schema' = 'freyra.bridge-visual/v1';
    if not found then
      raise exception 'En broregistrering er ikke tilgængelig på den valgte sag.';
    end if;

    expected := jsonb_build_object(
      'id', observation.id,
      'objectId', observation.metadata->'objectId',
      'structureType', observation.metadata->'structureType',
      'latitude', observation.latitude,
      'longitude', observation.longitude,
      'accuracyM', observation.accuracy_m,
      'materials', observation.metadata->'materials',
      'dimensions', observation.metadata->'dimensions',
      'conditions', observation.notes,
      'photoSourceIds', observation.metadata->'photoSourceIds',
      'observedAt', observation.observed_at
    );
    if (entry - 'observedAt') is distinct from (expected - 'observedAt')
       or (entry->>'observedAt')::timestamptz is distinct from observation.observed_at then
      raise exception 'En broregistrering er ændret. Indlæs objektlisten igen.';
    end if;

    if new.status = 'approved' and exists (
      select 1 from jsonb_array_elements_text(expected->'photoSourceIds') photo(id)
      where not exists (
        select 1 from jsonb_array_elements(new.content->'sources') source
        where source->>'id' = photo.id and source->>'id' like 'media:%'
          and source->>'mimeType' like 'image/%'
          and source->>'checksum' ~ '^[a-f0-9]{64}$'
      )
    ) then
      raise exception 'Broregistreringens fotokilder skal være verificerede og med i kilderegisteret.';
    end if;
    snapshots := snapshots || jsonb_build_array(expected);
  end loop;
  new.content := jsonb_set(new.content, '{bridgeObservations}', snapshots);
  return new;
end $$;

revoke all on function private.validate_bridge_report_observations() from public, anon, authenticated;
create trigger zz_validate_bridge_report_observations before insert on public.report_revisions
for each row execute function private.validate_bridge_report_observations();
