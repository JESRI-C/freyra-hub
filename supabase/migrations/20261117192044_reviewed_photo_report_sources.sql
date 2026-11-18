-- A report and an appended professional decision must observe the same ordering.
-- The report holds a shared lock once per project, independent of source order.
create function private.lock_report_photo_review_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('report-photo-review:' || new.project_id::text, 0));
  return new;
end $$;
revoke all on function private.lock_report_photo_review_change() from public, anon, authenticated, service_role;
create trigger photo_point_review_report_lock before insert on public.photo_point_review_versions
  for each row execute function private.lock_report_photo_review_change();

-- One image can belong to multiple rounds. Take the latest decision for each
-- binding before filtering decisions; two reviewed bindings do not identify
-- one report source. The raw validation receipt and assignment stay unmodified.
create view public.reviewed_report_media_sources with (security_invoker = true) as
select m.id, m.project_id, m.title,
       case when p.review is not null then p.captured_at else s.captured_at end as captured_at,
       m.uploaded_at,
       case when p.review is not null then p.lat else s.lat end as lat,
       case when p.review is not null then p.lng else s.lng end as lng,
       m.category, case when m.original_role = 'drone_original' then p.sha256 else s.sha256 end as sha256,
       m.file_path, m.storage_bucket, m.mime_type, s.uses_field_receipt,
       p.review as photo_point_review,
       case when p.review is not null then 'Originalfoto med fagligt bekræftet fotopunkt. Eventuel position angiver kameraets placering.' end as method,
       p.review->>'sha256' as version, p.capture_date
from public.project_media m
join public.report_media_sources s on s.id = m.id and s.project_id = m.project_id
left join lateral (
  select jsonb_build_object(
           'id', q.review_id, 'sha256', q.review_sha256,
           'bindingId', q.id, 'bindingSha256', q.manifest_sha256,
           'originalSha256', q.original_sha256, 'originalValidationSha256', q.original_validation_sha256
         ) as review, c.captured_at, c.capture_date, c.lat, c.lng, c.sha256
  from (
    select b.*, d.id as review_id, d.review_sha256, d.review, count(*) over () as reviewed_bindings
    from public.survey_round_media_versions b
    cross join lateral (
      select v.id, v.review_sha256, v.review
      from public.photo_point_review_versions v
      where v.project_id = b.project_id and v.binding_id = b.id and v.binding_sha256 = b.manifest_sha256
      order by v.created_at desc, v.id desc limit 1
    ) d
    where m.original_role = 'drone_original' and b.project_id = m.project_id and b.media_id = m.id
  ) q
  join public.uploads u on u.project_id = m.project_id and u.id = m.source_upload_id
  join storage.objects o on o.id = m.storage_object_id and o.bucket_id = m.storage_bucket and o.name = m.file_path
  cross join lateral private.promoted_photo_capture(m) c
  where q.reviewed_bindings = 1 and q.review->>'decision' = 'confirmed'
    and q.review->>'mediaId' = m.id::text and q.review->>'originalSha256' = m.original_sha256
    and q.review->>'baselineId' = q.baseline_id::text and q.review->>'baselineSha256' = q.baseline_sha256
    and q.original_sha256 = m.original_sha256 and q.original_validation_sha256 = m.original_validation_sha256
    and q.storage_object_id = m.storage_object_id and q.storage_object_version is not distinct from m.storage_object_version
    and q.storage_object_updated_at = m.storage_object_updated_at
    and u.received_at is not null and u.intent_request_id is not null and u.status not in ('draft','archived','rejected')
    and u.mime_type = 'image/jpeg' and u.file_size = m.file_size_bytes
    and u.original_validation->>'schema' = 'gofreyra.drone-original-validation/v1'
    and u.original_validation->>'validatorVersion' = 'jpeg-structure-exifr/v1'
    and u.original_validation->'reportEligible' = 'false'::jsonb
    and u.original_validation->>'projectId' = m.project_id::text and u.original_validation->>'uploadId' = u.id::text
    and u.original_validation #>> '{original,sha256}' = m.original_sha256
    and u.original_validation #>> '{original,storagePath}' = m.file_path
    and u.original_validation #> '{original,sizeBytes}' = to_jsonb(m.file_size_bytes)
    and o.owner_id = u.uploaded_by::text and o.metadata->>'size' = m.file_size_bytes::text
    and lower(o.metadata->>'mimetype') = 'image/jpeg'
    and to_jsonb(o)->>'archived_at' is null and not coalesce((to_jsonb(o)->>'is_delete_marker')::boolean, false)
    and to_jsonb(o)->>'version' is not distinct from m.storage_object_version and o.updated_at = m.storage_object_updated_at
    and not exists (
      select 1 from storage.objects other
      where other.bucket_id = o.bucket_id and other.name = o.name and other.id <> o.id
        and to_jsonb(other)->>'archived_at' is null and not coalesce((to_jsonb(other)->>'is_delete_marker')::boolean, false)
    )
    and c.sha256 = m.original_sha256
) p on true;
revoke all on public.reviewed_report_media_sources from public, anon, authenticated;
grant select on public.reviewed_report_media_sources to authenticated;

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
 if exists(select 1 from jsonb_array_elements(new.content->'sources') s
           where s->>'id' like 'media:%' and nullif(s->'photoPointReview','null'::jsonb) is not null) then
   perform pg_advisory_xact_lock_shared(hashtextextended('report-photo-review:' || d.project_id::text, 0));
 end if;
 for src in select * from jsonb_array_elements(new.content->'sources') loop
   if src->>'id' like 'media:%' then
     media_id := substring(src->>'id' from 7)::uuid;
     if nullif(src->'photoPointReview','null'::jsonb) is not null then
       select to_jsonb(m) into source_row from public.reviewed_report_media_sources m
       where m.id = media_id and m.project_id::text = d.project_id::text;
     else
       select to_jsonb(m) into source_row from public.report_media_sources m
       where m.id = media_id and m.project_id::text = d.project_id::text;
     end if;
     if not found then raise exception 'Source is not in selected project'; end if;
     if nullif(src->'photoPointReview','null'::jsonb) is distinct from nullif(source_row->'photo_point_review','null'::jsonb) then
       raise exception 'Photo point review changed; reload before saving';
     end if;
     stored_checksum := source_row->>'sha256';
     if (src->>'checksum') is distinct from stored_checksum and not (
       new.status = 'draft' and src->>'checksum' is null
       and source_row->>'uses_field_receipt' = 'true'
     ) then raise exception 'Source checksum mismatch'; end if;
     canonical := canonical || jsonb_build_array(jsonb_build_object(
       'id',src->>'id', 'filePath',source_row->>'file_path', 'storageBucket',coalesce(source_row->>'storage_bucket','project-media'),
       'mimeType',source_row->>'mime_type', 'title',source_row->>'title', 'kind',source_row->>'category',
       'capturedAt',source_row->'captured_at', 'checksum',stored_checksum,
       'position',case when source_row->>'lat' is not null and source_row->>'lng' is not null then jsonb_build_array(source_row->'lng',source_row->'lat') else 'null'::jsonb end,
       'method',coalesce(source_row->>'method','Originalfoto; position fra registrerede metadata, ikke målfast ortofoto'),
       'version',coalesce(source_row->>'version',source_row->>'uploaded_at')
     ) || jsonb_strip_nulls(jsonb_build_object('photoPointReview',source_row->'photo_point_review','localCaptureDate',source_row->'capture_date')));

   elsif src->>'id' like 'evidence:%' then
     if not exists(select 1 from public.evidence_files e where e.id = substring(src->>'id' from 10)::uuid and e.project_id::text = d.project_id::text) then raise exception 'Source is not in selected project'; end if;
     if src->>'checksum' is not null then raise exception 'Document checksum is not recorded'; end if;
     select to_jsonb(e) into source_row from public.evidence_files e where e.id=substring(src->>'id' from 10)::uuid;
     canonical := canonical || jsonb_build_array(jsonb_build_object('id',src->>'id','title',source_row->>'title','kind',coalesce(source_row->>'evidence_type','dokument'),'capturedAt',source_row->'created_at','checksum',null,'position',null,'method','Registreret dokument; indhold kræver faglig gennemgang','version',coalesce(source_row->>'created_at','ukendt')));

   elsif src->>'id' like 'field:%' or src->>'id' like 'survey-area:%' then
     select r.source into source_row from public.report_registration_sources r
     where r.id = src->>'id' and r.project_id = d.project_id;
     if not found then raise exception 'Registration source is not in selected project'; end if;
     if src->>'checksum' is distinct from source_row->>'checksum' then
       raise exception 'Registration source changed; reload before saving';
     end if;
     canonical := canonical || jsonb_build_array(source_row);
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
