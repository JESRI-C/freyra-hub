-- The main report trigger serializes revision writes before this check.
create function private.validate_nature_survey_report() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  survey jsonb := new.content->'natureSurvey';
  project uuid;
  area public.monitoring_zones;
  observation public.field_observations;
  entry jsonb;
  expected jsonb;
  area_ids uuid[] := '{}';
  observation_ids uuid[] := '{}';
  canonical_areas jsonb := '[]';
  canonical_observations jsonb := '[]';
begin
  if survey is null then
    if exists (
      select 1 from public.report_revisions prior
      where prior.report_id = new.report_id and prior.version = new.version - 1
        and prior.content ? 'natureSurvey'
    ) then
      raise exception 'Rapportens naturregistreringer skal bevares.';
    end if;
    return new;
  end if;

  if coalesce(new.content->>'templateId', '') not in ('nature_baseline', 'biodiversity')
     or jsonb_typeof(survey->'areas') is distinct from 'array'
     or jsonb_typeof(survey->'observations') is distinct from 'array' then
    raise exception 'Ugyldigt rapportgrundlag for naturregistreringer.';
  end if;
  if jsonb_array_length(survey->'areas') = 0 then
    raise exception 'Naturregistreringen mangler et undersøgelsesområde.';
  end if;

  select project_id into strict project from public.report_documents where id = new.report_id;
  for entry in select * from jsonb_array_elements(survey->'areas') loop
    select * into area from public.monitoring_zones
    where id = (entry->>'id')::uuid and project_id = project and zone_type = 'nature_survey';
    if not found then
      raise exception 'Et undersøgelsesområde er ikke tilgængeligt på den valgte sag.';
    end if;
    if area.id = any(area_ids) then
      raise exception 'Rapportgrundlaget indeholder dublerede undersøgelsesområder.';
    end if;
    expected := jsonb_build_object(
      'id', area.id, 'name', area.name, 'method', area.description,
      'hectares', area.area_hectares, 'geometry', area.geometry
    );
    if entry is distinct from expected then
      raise exception 'Et undersøgelsesområde er ændret. Indlæs sagens naturregistreringer igen.';
    end if;
    area_ids := array_append(area_ids, area.id);
    canonical_areas := canonical_areas || jsonb_build_array(expected);
  end loop;

  for entry in select * from jsonb_array_elements(survey->'observations') loop
    select * into observation from public.field_observations
    where id = (entry->>'id')::uuid and project_id = project and zone_id = any(area_ids)
      and observation_type = 'nature_survey' and metadata->>'schema' = 'freyra.nature-survey/v1';
    if not found then
      raise exception 'En naturregistrering er ikke tilgængelig i rapportens undersøgelsesområder.';
    end if;
    if observation.id = any(observation_ids) then
      raise exception 'Rapportgrundlaget indeholder dublerede naturregistreringer.';
    end if;
    expected := jsonb_build_object(
      'id', observation.id, 'zoneId', observation.zone_id,
      'kind', observation.metadata->'kind', 'label', observation.metadata->'label',
      'method', observation.metadata->'method', 'notes', observation.notes,
      'determination', observation.metadata->'determination', 'observedAt', observation.observed_at
    );
    if (entry - 'observedAt') is distinct from (expected - 'observedAt')
       or (entry->>'observedAt')::timestamptz is distinct from observation.observed_at then
      raise exception 'En naturregistrering er ændret. Indlæs sagens naturregistreringer igen.';
    end if;
    observation_ids := array_append(observation_ids, observation.id);
    canonical_observations := canonical_observations || jsonb_build_array(expected);
  end loop;

  new.content := jsonb_set(new.content, '{natureSurvey}',
    jsonb_build_object('areas', canonical_areas, 'observations', canonical_observations));
  return new;
end $$;

revoke all on function private.validate_nature_survey_report() from public, anon, authenticated;
create trigger zz_validate_nature_survey_report before insert on public.report_revisions
for each row execute function private.validate_nature_survey_report();
