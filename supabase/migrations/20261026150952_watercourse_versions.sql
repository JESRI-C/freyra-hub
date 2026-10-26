-- Append-only centerlines. Deliberately separate from project boundaries and photo GPS.
create table public.watercourse_versions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 version integer not null check (version > 0),
 geometry jsonb not null check (geometry->>'type' = 'LineString'),
 crs text not null check (crs = 'EPSG:4326'),
 direction text not null check (direction in ('downstream','upstream','unknown')),
 source text not null check (length(trim(source)) > 0),
 length_m double precision not null check (length_m > 0 and length_m < 'Infinity'::float8),
 method text not null,
 segments jsonb not null default '[]'::jsonb check (jsonb_typeof(segments) = 'array'),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id),
 unique (project_id, version)
);
alter table public.watercourse_versions enable row level security;
revoke all on public.watercourse_versions from anon, authenticated;
grant select, insert on public.watercourse_versions to authenticated;
create policy "Read authorized watercourse versions" on public.watercourse_versions for select to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.organization_id = watercourse_versions.organization_id and public.is_org_member(auth.uid(), p.organization_id)));
create policy "Append authorized watercourse versions" on public.watercourse_versions for insert to authenticated
with check (created_by = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.organization_id = watercourse_versions.organization_id and public.is_org_member(auth.uid(), p.organization_id)));
create index watercourse_versions_org_project on public.watercourse_versions (organization_id, project_id);

create function public.validate_watercourse_version() returns trigger language plpgsql security invoker set search_path = public as $$
declare point jsonb; prev jsonb; seg jsonb; total double precision := 0; ids text[] := '{}'; last_end double precision := 0;
begin
 if new.geometry->>'type' is distinct from 'LineString' or jsonb_typeof(new.geometry->'coordinates') is distinct from 'array' or jsonb_array_length(new.geometry->'coordinates') < 2 then raise exception 'Invalid centerline'; end if;
 for point in select value from jsonb_array_elements(new.geometry->'coordinates') loop
  if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point) < 2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' or abs((point->>0)::float8) > 180 or abs((point->>1)::float8) > 90 then raise exception 'Invalid WGS84 coordinate'; end if;
  if prev is not null then
   total := total + 6371008.8 * 2 * asin(least(1.0,sqrt(power(sin(radians((point->>1)::float8-(prev->>1)::float8)/2),2) + cos(radians((prev->>1)::float8))*cos(radians((point->>1)::float8))*power(sin(radians((point->>0)::float8-(prev->>0)::float8)/2),2))));
  end if;
  prev := point;
 end loop;
 if total <= 0 then raise exception 'Centerline length must be positive'; end if;
 new.length_m := total;
 new.method := 'turf-7.3.5-geodesic-wgs84-v1';
 for seg in select value from jsonb_array_elements(new.segments) order by (value->>'fromM')::float8 loop
  if nullif(trim(seg->>'id'),'') is null or nullif(trim(seg->>'name'),'') is null or (seg->>'id') = any(ids) or jsonb_typeof(seg->'fromM') is distinct from 'number' or jsonb_typeof(seg->'toM') is distinct from 'number' then raise exception 'Invalid segment'; end if;
  if (seg->>'fromM')::float8 < last_end or (seg->>'toM')::float8 <= (seg->>'fromM')::float8 or (seg->>'toM')::float8 > total+0.001 then raise exception 'Invalid segment stationing'; end if;
  ids := array_append(ids,seg->>'id'); last_end := (seg->>'toM')::float8;
 end loop;
 return new;
end $$;
create trigger validate_watercourse_version before insert on public.watercourse_versions for each row execute function public.validate_watercourse_version();

create table public.watercourse_observations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 centerline_version_id uuid not null references public.watercourse_versions(id),
 segment_id text not null,
 kind text not null check (kind in ('vegetation','water','tree','species','recommendation')),
 text text not null check (length(trim(text)) > 0),
 feature_key text not null check (length(trim(feature_key)) > 0),
 source_ids uuid[] not null check (cardinality(source_ids) > 0),
 determination_level text not null check (determination_level in ('observed','screening','species_suggestion')),
 quality_flags text[] not null default '{}',
 comparison jsonb default null check (comparison is null or jsonb_typeof(comparison) = 'object'),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id),
 unique(project_id, centerline_version_id, segment_id, kind, feature_key)
);
create table public.watercourse_observation_reviews (
 observation_id uuid primary key references public.watercourse_observations(id),
 approved_by uuid not null default auth.uid() references auth.users(id),
 approved_at timestamptz not null default now()
);
alter table public.watercourse_observations enable row level security;
alter table public.watercourse_observation_reviews enable row level security;
revoke all on public.watercourse_observations, public.watercourse_observation_reviews from anon, authenticated;
grant select, insert on public.watercourse_observations, public.watercourse_observation_reviews to authenticated;
create policy "Read observations within organization" on public.watercourse_observations for select to authenticated using (exists (select 1 from public.watercourse_versions v where v.id = centerline_version_id and v.project_id = watercourse_observations.project_id and v.organization_id = watercourse_observations.organization_id));
create policy "Insert observations within organization" on public.watercourse_observations for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.watercourse_versions v where v.id = centerline_version_id and v.project_id = watercourse_observations.project_id and v.organization_id = watercourse_observations.organization_id));
create policy "Read observation reviews" on public.watercourse_observation_reviews for select to authenticated using (exists(select 1 from public.watercourse_observations o where o.id = observation_id));
create policy "Approve accessible observations" on public.watercourse_observation_reviews for insert to authenticated with check (approved_by = auth.uid() and exists(select 1 from public.watercourse_observations o where o.id = observation_id));
create function public.validate_watercourse_observation() returns trigger language plpgsql security invoker set search_path = public as $$
declare matched integer;
begin
 if not exists(select 1 from public.watercourse_versions v where v.id = new.centerline_version_id and v.project_id = new.project_id and v.organization_id = new.organization_id and exists(select 1 from jsonb_array_elements(v.segments) s where s->>'id' = new.segment_id)) then raise exception 'Observation centerline/segment does not belong to project'; end if;
 select count(distinct id) into matched from public.project_media where project_id = new.project_id and id = any(new.source_ids);
 if matched <> cardinality(new.source_ids) then raise exception 'Photo sources must be unique and belong to project'; end if;
 if new.comparison is not null then
  if jsonb_typeof(new.comparison->'beforeId') is distinct from 'string' or not ((new.comparison->>'beforeId')::uuid = any(new.source_ids)) then raise exception 'Before photo must be an observation source'; end if;
  if new.comparison->>'afterId' is not null and (jsonb_typeof(new.comparison->'afterId') is distinct from 'string' or not ((new.comparison->>'afterId')::uuid = any(new.source_ids)) or new.comparison->>'afterId' = new.comparison->>'beforeId') then raise exception 'After photo must be a distinct observation source'; end if;
  if coalesce(new.comparison->>'beforeLight','') not in ('','Overskyet','Sol','Skygge') or coalesce(new.comparison->>'afterLight','') not in ('','Overskyet','Sol','Skygge') then raise exception 'Invalid comparison lighting'; end if;
  if new.comparison->>'afterId' is null and new.comparison->>'afterLight' is not null then raise exception 'After lighting requires after photo'; end if;
 end if;
 new.feature_key := lower(trim(new.feature_key));
 return new;
end $$;
create trigger validate_watercourse_observation before insert on public.watercourse_observations for each row execute function public.validate_watercourse_observation();

create function public.stamp_watercourse_review() returns trigger language plpgsql security invoker set search_path = public as $$
begin
 new.approved_at := clock_timestamp();
 new.approved_by := auth.uid();
 return new;
end $$;
create trigger stamp_watercourse_review before insert on public.watercourse_observation_reviews for each row execute function public.stamp_watercourse_review();
