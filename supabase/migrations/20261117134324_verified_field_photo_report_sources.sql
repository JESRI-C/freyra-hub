-- Report readers and the report write trigger use the same canonical checksum.
-- A client-declared hash in upload metadata is not a verification receipt.
create view public.report_media_sources with (security_invoker = true) as
select m.id, m.project_id, m.title, m.captured_at, m.uploaded_at, m.lat, m.lng,
       m.category, coalesce(m.sha256, r.sha256) as sha256, m.file_path,
       m.storage_bucket, m.mime_type, (m.sha256 is null and r.sha256 is not null) as uses_field_receipt
from public.project_media m
left join public.field_photo_uploads u
  on m.source = 'field_upload' and m.storage_bucket = 'project-media'
 and u.id = m.id and u.project_id::text = m.project_id::text
 and u.storage_path = m.file_path and u.received_at is not null
 and m.metadata->>'field_upload_id' = u.id::text
left join public.field_photo_receipts r
  on r.upload_id = u.id and r.project_id = u.project_id and r.status = 'verified'
 and r.object_id = u.object_id and r.object_version is not distinct from u.object_version
 and r.object_updated_at = u.object_updated_at
 and r.sha256 = u.payload->>'sha256' and r.size_bytes::text = u.payload->>'sizeBytes';

revoke all on public.report_media_sources from public, anon, authenticated;
grant select on public.report_media_sources to authenticated;

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
     select to_jsonb(m) into source_row from public.report_media_sources m where m.id = media_id and m.project_id::text = d.project_id::text;
     if not found then raise exception 'Source is not in selected project'; end if;
     stored_checksum := source_row->>'sha256';
     if (src->>'checksum') is distinct from stored_checksum and not (
       new.status = 'draft' and src->>'checksum' is null
       and source_row->>'uses_field_receipt' = 'true'
     ) then raise exception 'Source checksum mismatch'; end if;
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
