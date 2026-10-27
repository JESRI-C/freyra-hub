-- Additive only. Existing reports and customer data are unchanged.
CREATE TABLE IF NOT EXISTS public.report_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.report_revisions (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.report_documents(id),
 version integer not null check (version > 0),
 status text not null check (status in ('draft','review','approved')),
 content jsonb not null check (jsonb_typeof(content) = 'object'),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(report_id, version)
);
CREATE INDEX IF NOT EXISTS report_documents_scope on public.report_documents(organization_id, project_id);
alter table public.report_documents enable row level security;
alter table public.report_revisions enable row level security;
revoke all on public.report_documents, public.report_revisions from anon, authenticated;
grant select, insert on public.report_documents, public.report_revisions to authenticated;
-- The projects subquery applies existing project RLS as well as organization membership.
DROP POLICY IF EXISTS report_documents_read ON public.report_documents;
create policy report_documents_read on public.report_documents for select to authenticated using (
 exists(select 1 from public.projects p where p.id = project_id and p.organization_id = report_documents.organization_id)
 and public.is_org_member(auth.uid(), organization_id)
);
DROP POLICY IF EXISTS report_documents_insert ON public.report_documents;
create policy report_documents_insert on public.report_documents for insert to authenticated with check (
 created_by = auth.uid() and public.is_org_member(auth.uid(), organization_id)
 and exists(select 1 from public.projects p where p.id = project_id and p.organization_id = report_documents.organization_id)
);
DROP POLICY IF EXISTS report_revisions_read ON public.report_revisions;
create policy report_revisions_read on public.report_revisions for select to authenticated using (
 exists(select 1 from public.report_documents d where d.id = report_id)
);
DROP POLICY IF EXISTS report_revisions_insert ON public.report_revisions;
create policy report_revisions_insert on public.report_revisions for insert to authenticated with check (
 created_by = auth.uid() and exists(select 1 from public.report_documents d where d.id = report_id)
);
-- No UPDATE or DELETE grants/policies: every saved or reviewed version is immutable.
CREATE OR REPLACE FUNCTION public.save_report_revision(
 _report_id uuid, _organization_id uuid, _project_id uuid,
 _expected_version integer, _status text, _content jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare rid uuid; rev public.report_revisions; latest integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if _status not in ('draft','review','approved') then raise exception 'Invalid status'; end if;
 if jsonb_typeof(_content->'sections') is distinct from 'array' or jsonb_array_length(_content->'sections') = 0
    or jsonb_typeof(_content->'sources') is distinct from 'array'
    or coalesce(length(_content->>'title'),0) = 0
    or coalesce(length(_content->>'scope'),0) = 0
    or coalesce(length(_content->>'audience'),0) = 0 then raise exception 'Invalid report content'; end if;
 if _status = 'approved' and (
   jsonb_array_length(_content->'sources') = 0
   or exists(select 1 from jsonb_array_elements(_content->'sources') s where coalesce(s->>'checksum','') !~ '^[a-f0-9]{64}$')
   or exists(select 1 from jsonb_array_elements(_content->'sections') s where coalesce(s->>'reviewed','false') <> 'true' or btrim(coalesce(s->>'text','')) = ''
     or (s->>'basis' <> 'not_measured' and jsonb_array_length(s->'sourceIds') = 0))
   or exists(select 1 from jsonb_array_elements(_content->'sections') s, jsonb_array_elements_text(s->'sourceIds') sid
     where not exists(select 1 from jsonb_array_elements(_content->'sources') src where src->>'id' = sid))
 ) then raise exception 'Evidence and review are incomplete'; end if;
 if _report_id is null then
   if _expected_version <> 0 or _status <> 'draft' then raise exception 'New report must be a draft'; end if;
   insert into public.report_documents(organization_id, project_id) values(_organization_id,_project_id) returning id into rid;
 else
   -- Transaction advisory lock serializes writers without requiring UPDATE permission.
   perform pg_advisory_xact_lock(hashtextextended(_report_id::text, 0));
   select id into rid from public.report_documents where id = _report_id and organization_id = _organization_id and project_id = _project_id;
   if rid is null then raise exception 'Report not found in selected project'; end if;
 end if;
 select coalesce(max(version),0) into latest from public.report_revisions where report_id = rid;
 if latest <> _expected_version then raise exception 'Report changed; reload before saving'; end if;
 insert into public.report_revisions(report_id,version,status,content) values(rid,latest+1,_status,_content) returning * into rev;
 return to_jsonb(rev);
end $$;
revoke all on function public.save_report_revision(uuid,uuid,uuid,integer,text,jsonb) from public, anon;
grant execute on function public.save_report_revision(uuid,uuid,uuid,integer,text,jsonb) to authenticated;

-- Apply these checks to direct Data API inserts too, not only the RPC.
CREATE OR REPLACE FUNCTION public.validate_report_revision_insert() returns trigger
language plpgsql security invoker set search_path = public as $$
declare d public.report_documents; src jsonb; media_id uuid; stored_checksum text; latest integer; canonical jsonb := '[]'::jsonb; source_row jsonb;
begin
 select * into d from public.report_documents where id = new.report_id;
 if d.id is null then raise exception 'Report not accessible'; end if;
 if new.created_by <> auth.uid() then raise exception 'Invalid actor'; end if;
 new.created_at := now();
 perform pg_advisory_xact_lock(hashtextextended(new.report_id::text,0));
 select coalesce(max(version),0) into latest from public.report_revisions where report_id = new.report_id;
 if new.version <> latest+1 then raise exception 'Report version conflict'; end if;
 if jsonb_typeof(new.content->'sections') is distinct from 'array' or jsonb_typeof(new.content->'sources') is distinct from 'array'
 or jsonb_array_length(new.content->'sections') = 0 then raise exception 'Invalid report structure'; end if;
 if jsonb_typeof(new.content->'title') is distinct from 'string' or jsonb_typeof(new.content->'scope') is distinct from 'string' or jsonb_typeof(new.content->'audience') is distinct from 'string' or coalesce(length(new.content->>'title'),0)=0 or coalesce(length(new.content->>'scope'),0)=0 or coalesce(length(new.content->>'audience'),0)=0 then raise exception 'Missing report metadata'; end if;
 if exists(select 1 from jsonb_array_elements(new.content->'sections') s
   where s->>'basis' is null or s->>'basis' not in ('documented','observed','screening','not_measured')
   or jsonb_typeof(s->'sourceIds') is distinct from 'array' or jsonb_typeof(s->'reviewed') is distinct from 'boolean'
   or jsonb_typeof(s->'id') is distinct from 'string' or jsonb_typeof(s->'title') is distinct from 'string' or coalesce(s->>'id','')='' or jsonb_typeof(s->'text') is distinct from 'string') then raise exception 'Invalid section'; end if;
 if exists(select 1 from jsonb_array_elements(new.content->'sections') s, jsonb_array_elements(s->'sourceIds') sid where jsonb_typeof(sid) is distinct from 'string') then raise exception 'Invalid source reference'; end if;
 if (select count(*) from jsonb_array_elements(new.content->'sections')) <> (select count(distinct s->>'id') from jsonb_array_elements(new.content->'sections') s)
 or (select count(*) from jsonb_array_elements(new.content->'sources')) <> (select count(distinct s->>'id') from jsonb_array_elements(new.content->'sources') s) then raise exception 'Duplicate report identifiers'; end if;
 for src in select * from jsonb_array_elements(new.content->'sources') loop
   if src->>'id' like 'media:%' then
     media_id := substring(src->>'id' from 7)::uuid;
     -- to_jsonb supports legacy rows until the additive media-checksum migration is applied.
     select to_jsonb(m) into source_row from public.project_media m where m.id = media_id and m.project_id::text = d.project_id::text;
     if not found then raise exception 'Source is not in selected project'; end if;
     stored_checksum := source_row->>'sha256';
     if (src->>'checksum') is distinct from stored_checksum then raise exception 'Source checksum mismatch'; end if;
     canonical := canonical || jsonb_build_array(jsonb_build_object('id',src->>'id','filePath',source_row->>'file_path','storageBucket',coalesce(source_row->>'storage_bucket','project-media'),'mimeType',source_row->>'mime_type','title',source_row->>'title','kind',source_row->>'category','capturedAt',source_row->'captured_at','checksum',stored_checksum,'position',case when source_row->>'lat' is not null and source_row->>'lng' is not null then jsonb_build_array(source_row->'lng',source_row->'lat') else 'null'::jsonb end,'method','Originalfoto; position fra registrerede metadata, ikke målfast ortofoto','version',source_row->>'uploaded_at'));

   elsif src->>'id' like 'evidence:%' then
     if not exists(select 1 from public.evidence_files e where e.id = substring(src->>'id' from 10)::uuid and e.project_id::text = d.project_id::text) then raise exception 'Source is not in selected project'; end if;
     if src->>'checksum' is not null then raise exception 'Document checksum is not recorded'; end if;
     select to_jsonb(e) into source_row from public.evidence_files e where e.id=substring(src->>'id' from 10)::uuid;
     canonical := canonical || jsonb_build_array(jsonb_build_object('id',src->>'id','title',source_row->>'title','kind',coalesce(source_row->>'evidence_type','dokument'),'capturedAt',source_row->'created_at','checksum',null,'position',null,'method','Registreret dokument; indhold kræver faglig gennemgang','version',coalesce(source_row->>'created_at','ukendt')));

   else raise exception 'Unknown source type'; end if;
 end loop;
 new.content := jsonb_set(new.content,'{sources}',canonical);
 new.content := jsonb_set(new.content,'{projectName}',to_jsonb((select name from public.projects where id=d.project_id)));
 new.content := jsonb_set(new.content,'{organizationName}',to_jsonb((select name from public.organizations where id=d.organization_id)));
 if new.status = 'approved' and (
  jsonb_array_length(new.content->'sources') = 0
  or exists(select 1 from jsonb_array_elements(new.content->'sources') s where coalesce(s->>'checksum','') !~ '^[a-f0-9]{64}$')
  or exists(select 1 from jsonb_array_elements(new.content->'sections') s where coalesce(s->>'reviewed','false') <> 'true' or btrim(coalesce(s->>'text','')) = '' or (s->>'basis' <> 'not_measured' and jsonb_array_length(s->'sourceIds')=0))
  or exists(select 1 from jsonb_array_elements(new.content->'sections') s, jsonb_array_elements_text(s->'sourceIds') sid where not exists(select 1 from jsonb_array_elements(new.content->'sources') x where x->>'id'=sid))
 ) then raise exception 'Evidence and review are incomplete'; end if;
 return new;
end $$;
revoke all on function public.validate_report_revision_insert() from public, anon, authenticated;
DROP TRIGGER IF EXISTS validate_report_revision ON public.report_revisions;
create trigger validate_report_revision before insert on public.report_revisions for each row execute function public.validate_report_revision_insert();
