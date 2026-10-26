-- Inert design candidate only. Root must create the real migration with CLI.
-- v1 supports create/retry/read/list only: each logical round has one initial
-- immutable version. A later revision slice needs its own reviewed migration/API.
-- No photos, observations, metric/result or scope/professional/report approval.

-- This FK target proves that the selected plan itself belongs to the same
-- project AND exact baseline; two independent ID/hash FKs would be weaker.
alter table public.verification_plan_versions
  add constraint plan_project_id_hash_baseline_unique
  unique (project_id, id, manifest_sha256, baseline_id, baseline_sha256);

create table public.survey_round_versions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null default gen_random_uuid(),
  round_version_no integer not null default 1 check (round_version_no = 1),
  supersedes_id uuid check (supersedes_id is null),
  project_id uuid not null references public.projects(id) on delete restrict,
  -- Project-wide append order is a stable list cursor, not a round revision.
  version_no integer not null check (version_no > 0),
  baseline_id uuid not null,
  baseline_sha256 text not null check (baseline_sha256 ~ '^[0-9a-f]{64}$'),
  plan_id uuid not null,
  plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  builder_version text not null check (builder_version = 'gofreyra.survey-round-draft/v1'),
  status text not null default 'draft' check (status = 'draft'),
  kind text not null check (kind in ('before','after','control')),
  title text not null check (char_length(title) between 1 and 120 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  recording_date_from date not null check (recording_date_from between date '0001-01-01' and date '9999-12-31'),
  recording_date_to date not null check (recording_date_to between date '0001-01-01' and date '9999-12-31'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  request_id uuid not null,
  constraint survey_round_date_order check (recording_date_from <= recording_date_to),
  constraint survey_round_baseline_binding foreign key (project_id,baseline_id,baseline_sha256)
    references public.project_baseline_snapshots(project_id,id,manifest_sha256) on delete restrict,
  constraint survey_round_plan_baseline_binding foreign key (project_id,plan_id,plan_sha256,baseline_id,baseline_sha256)
    references public.verification_plan_versions(project_id,id,manifest_sha256,baseline_id,baseline_sha256) on delete restrict,
  constraint survey_round_manifest_size check (octet_length(manifest::text) <= 65536),
  constraint survey_round_manifest_shape check ((
    jsonb_typeof(manifest) = 'object'
    and manifest ->> 'schema' = 'gofreyra.survey-round/v1'
    and manifest ->> 'builderVersion' = builder_version
    and manifest ->> 'status' = status
    and manifest ->> 'projectId' = project_id::text
    and manifest ->> 'baselineId' = baseline_id::text
    and manifest ->> 'baselineSha256' = baseline_sha256
    and manifest ->> 'planId' = plan_id::text
    and manifest ->> 'planSha256' = plan_sha256
    and manifest ->> 'kind' = kind
    and manifest ->> 'title' = title
    and manifest #>> '{recordingWindow,dateFrom}' = to_char(recording_date_from,'YYYY-MM-DD')
    and manifest #>> '{recordingWindow,dateTo}' = to_char(recording_date_to,'YYYY-MM-DD')
    and manifest #>> '{recordingWindow,timeZone}' = 'Europe/Copenhagen'
    and manifest #>> '{recordingWindow,datePrecision}' = 'calendar_date'
    and manifest #>> '{recordingWindow,actualCoverage}' = 'not_verified'
    and jsonb_typeof(manifest -> 'questionIds') = 'array'
    and manifest -> 'acceptance' = '{"municipalScopeApproved":false,"professionalApproved":false,"reportAccepted":false}'::jsonb
  ) is true),
  unique (project_id,version_no),
  unique (project_id,round_id,round_version_no),
  unique (project_id,created_by,request_id),
  unique (project_id,id,manifest_sha256)
);
create index survey_round_baseline_versions on public.survey_round_versions(project_id,baseline_id,version_no desc);
create index survey_round_plan_versions on public.survey_round_versions(project_id,plan_id,version_no desc);
alter table public.survey_round_versions enable row level security;
revoke all on public.survey_round_versions from public,anon,authenticated,service_role;
grant select on public.survey_round_versions to authenticated;
grant select,insert on public.survey_round_versions to service_role;
create policy survey_round_project_read on public.survey_round_versions
  for select to authenticated using (private.can_read_project(project_id));

create or replace function private.reject_survey_round_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'A saved survey round version is immutable; an explicit new version is required' using errcode = '23514';
end
$$;
revoke all on function private.reject_survey_round_mutation() from public,anon,authenticated,service_role;
create trigger survey_round_versions_immutable before update or delete on public.survey_round_versions
  for each row execute function private.reject_survey_round_mutation();

-- Caller identity is verified by the authenticated app middleware; the browser
-- has no EXECUTE grant. The SECURITY INVOKER server-only writer rechecks current
-- membership and exact immutable plan/baseline binding under the same lock
-- order as existing writers. No UPDATE grants or locks on immutable inputs.
create or replace function public.persist_survey_round(
  p_project_id uuid,p_actor_id uuid,p_request_id uuid,
  p_baseline_id uuid,p_baseline_sha256 text,p_plan_id uuid,p_plan_sha256 text,
  p_manifest_text text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  project_row public.projects%rowtype;
  baseline_row public.project_baseline_snapshots%rowtype;
  plan_row public.verification_plan_versions%rowtype;
  existing public.survey_round_versions%rowtype;
  inserted public.survey_round_versions%rowtype;
  round_manifest jsonb;
  round_hash text;
  round_title text;
  date_from date;
  date_to date;
  selected_ids jsonb;
  next_version integer;
  can_write boolean;
  organization_role text;
  project_role text;
begin
  if p_actor_id is null or p_request_id is null then
    raise exception 'Verified actor and request id are required' using errcode = '22023';
  end if;
  select * into project_row from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project access denied' using errcode='42501'; end if;
  -- Authorize only from rows actually captured under these locks. Re-reading
  -- membership with a later EXISTS could accept a newly inserted grant that
  -- was absent during the lock statement and therefore is not protected.
  select membership.role::text into organization_role from public.organization_memberships membership
    where membership.organization_id=project_row.organization_id and membership.user_id=p_actor_id for share;
  select member.role::text into project_role from public.project_members member
    where member.project_id=p_project_id and member.user_id=p_actor_id for share;
  can_write:=coalesce(organization_role in ('owner','admin') or
    (organization_role is not null and project_role in ('admin','project_manager','editor')),false);
  if can_write is not true then raise exception 'Project access denied' using errcode='42501'; end if;

  select * into baseline_row from public.project_baseline_snapshots where project_id=p_project_id and id=p_baseline_id;
  if not found or p_baseline_sha256 is distinct from baseline_row.manifest_sha256 then
    raise exception 'Invalid saved baseline binding' using errcode='23514';
  end if;
  select * into plan_row from public.verification_plan_versions where project_id=p_project_id and id=p_plan_id;
  if not found or p_plan_sha256 is distinct from plan_row.manifest_sha256
    or plan_row.baseline_id is distinct from p_baseline_id or plan_row.baseline_sha256 is distinct from p_baseline_sha256 then
    raise exception 'Invalid saved plan and baseline binding' using errcode='23514';
  end if;
  if p_manifest_text is null or octet_length(p_manifest_text)>65536 then
    raise exception 'Invalid or oversized survey round' using errcode='23514';
  end if;
  begin round_manifest:=p_manifest_text::jsonb;
  exception when invalid_text_representation then
    raise exception 'Invalid survey round JSON' using errcode='23514';
  end;
  round_hash:=encode(pg_catalog.sha256(convert_to(p_manifest_text,'UTF8')),'hex');
  if (jsonb_typeof(round_manifest)='object' and octet_length(round_manifest::text)<=65536
    and round_manifest ->> 'schema'='gofreyra.survey-round/v1'
    and round_manifest ->> 'builderVersion'='gofreyra.survey-round-draft/v1'
    and round_manifest ->> 'status'='draft'
    and round_manifest ->> 'projectId'=p_project_id::text
    and round_manifest ->> 'baselineId'=p_baseline_id::text
    and round_manifest ->> 'baselineSha256'=p_baseline_sha256
    and round_manifest ->> 'baselineSchema'=baseline_row.manifest ->> 'schema'
    and round_manifest ->> 'planId'=p_plan_id::text
    and round_manifest ->> 'planSha256'=p_plan_sha256
    and round_manifest ->> 'planSchema'='gofreyra.verification-plan/v1'
    and plan_row.manifest ->> 'schema'='gofreyra.verification-plan/v1'
    and plan_row.manifest ->> 'status'='draft'
    and round_manifest ->> 'planGeneratorVersion'=plan_row.generator_version
    and plan_row.generator_version='gofreyra.reference-location-plan/v1'
    and round_manifest ->> 'kind' in ('before','after','control')
    and jsonb_typeof(round_manifest -> 'title')='string'
    and jsonb_typeof(round_manifest -> 'recordingWindow')='object'
    and round_manifest #>> '{recordingWindow,dateFrom}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and round_manifest #>> '{recordingWindow,dateTo}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and round_manifest #>> '{recordingWindow,timeZone}'='Europe/Copenhagen'
    and round_manifest #>> '{recordingWindow,datePrecision}'='calendar_date'
    and round_manifest #>> '{recordingWindow,actualCoverage}'='not_verified'
    and (round_manifest -> 'recordingWindow') - array['dateFrom','dateTo','timeZone','datePrecision','actualCoverage']='{}'::jsonb
    and jsonb_typeof(round_manifest -> 'questionIds')='array'
    and round_manifest -> 'acceptance'='{"municipalScopeApproved":false,"professionalApproved":false,"reportAccepted":false}'::jsonb
    and round_manifest - array['schema','builderVersion','status','projectId','baselineId','baselineSha256','baselineSchema',
      'planId','planSha256','planSchema','planGeneratorVersion','kind','title','recordingWindow','questionIds','acceptance']='{}'::jsonb
  ) is not true then raise exception 'Invalid survey round manifest' using errcode='23514'; end if;
  round_title:=round_manifest ->> 'title';
  if char_length(round_title) not between 1 and 120 or round_title<>btrim(round_title) or round_title ~ '[[:cntrl:]]' then
    raise exception 'Invalid survey round title' using errcode='23514';
  end if;
  begin
    date_from:=(round_manifest #>> '{recordingWindow,dateFrom}')::date;
    date_to:=(round_manifest #>> '{recordingWindow,dateTo}')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid recording calendar dates' using errcode='23514';
  end;
  if date_from<date '0001-01-01' or date_to>date '9999-12-31' or date_from>date_to
    or to_char(date_from,'YYYY-MM-DD') is distinct from round_manifest #>> '{recordingWindow,dateFrom}'
    or to_char(date_to,'YYYY-MM-DD') is distinct from round_manifest #>> '{recordingWindow,dateTo}' then
    raise exception 'Invalid recording calendar date order' using errcode='23514';
  end if;
  selected_ids:=round_manifest -> 'questionIds';
  if jsonb_array_length(selected_ids) not between 1 and 50 then
    raise exception 'Select actual saved plan question IDs' using errcode='23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(selected_ids) as selected(value)
    where jsonb_typeof(value)<>'string' or char_length(value #>> '{}') not between 1 and 300
      or (value #>> '{}') ~ '[[:cntrl:]]'
      or not exists (select 1 from jsonb_array_elements(plan_row.manifest -> 'questions') as questions(question)
        where question ->> 'id'=value #>> '{}')
  ) or (select count(distinct value) from jsonb_array_elements(selected_ids) as selected(value))<>jsonb_array_length(selected_ids)
    or selected_ids is distinct from (select jsonb_agg(value order by (value #>> '{}') collate "C") from jsonb_array_elements(selected_ids) as selected(value)) then
    raise exception 'Survey round question IDs are unknown, duplicated or not canonical' using errcode='23514';
  end if;
  select * into existing from public.survey_round_versions
    where project_id=p_project_id and created_by=p_actor_id and request_id=p_request_id;
  if found then
    if existing.baseline_id is distinct from p_baseline_id or existing.baseline_sha256 is distinct from p_baseline_sha256
      or existing.plan_id is distinct from p_plan_id or existing.plan_sha256 is distinct from p_plan_sha256
      or existing.manifest is distinct from round_manifest or existing.manifest_sha256 is distinct from round_hash then
      raise exception 'Request id already belongs to another survey round' using errcode='23514';
    end if;
    return to_jsonb(existing);
  end if;
  select coalesce(max(version_no),0)+1 into next_version from public.survey_round_versions where project_id=p_project_id;
  insert into public.survey_round_versions(project_id,version_no,baseline_id,baseline_sha256,plan_id,plan_sha256,
    builder_version,status,kind,title,recording_date_from,recording_date_to,manifest_sha256,manifest,created_by,request_id)
  values(p_project_id,next_version,p_baseline_id,p_baseline_sha256,p_plan_id,p_plan_sha256,
    'gofreyra.survey-round-draft/v1','draft',round_manifest ->> 'kind',round_title,date_from,date_to,round_hash,round_manifest,p_actor_id,p_request_id)
  returning * into inserted;
  return to_jsonb(inserted);
end
$$;
revoke all on function public.persist_survey_round(uuid,uuid,uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.persist_survey_round(uuid,uuid,uuid,uuid,text,uuid,text,text) to service_role;
