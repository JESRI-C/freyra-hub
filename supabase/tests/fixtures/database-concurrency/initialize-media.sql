-- Committed LOCAL metadata fixtures after the previous 13 concurrency cases.
-- No source fetch, image bytes, Storage upload, decoder or positive pixel acceptance.
begin;
do $guard$ begin
 if to_regclass('public.survey_round_media_versions') is null then raise exception 'Reviewed round-media migration required'; end if;
 if (select count(*) from public.survey_round_versions where project_id='10000000-0000-4000-8000-000000000001'::uuid)<>4 then raise exception 'Prior four committed rounds required'; end if;
 if exists(select 1 from public.uploads) or exists(select 1 from public.project_media) or exists(select 1 from storage.objects)
  or exists(select 1 from public.project_media_upload_origins) or exists(select 1 from public.project_media_promotion_requests)
  or exists(select 1 from public.survey_round_media_versions) then raise exception 'New media fixture requires unchanged zero-object operational graph'; end if;
 if not exists(select 1 from public.project_members where project_id='10000000-0000-4000-8000-000000000001'::uuid and user_id='20000000-0000-4000-8000-000000000001'::uuid and role='editor')
  or not exists(select 1 from public.organization_memberships where organization_id='94000000-0000-4000-8000-000000000001'::uuid and user_id='20000000-0000-4000-8000-000000000001'::uuid and role='viewer') then raise exception 'Exact existing fixture memberships required'; end if;
 if not exists(select 1 from storage.buckets where id='monitoring-uploads' and public=false) then raise exception 'Existing private original bucket required'; end if;
end $guard$;
insert into public.uploads(id,project_id,organization_id,uploaded_by,file_name,original_file_name,file_size,mime_type,upload_type,storage_path,intent_request_id,intent_expires_at,received_at,status)
values('95000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'94000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000001'::uuid,'concurrency-original.jpg','concurrency-original.jpg',137,'image/jpeg','drone_photo','20000000-0000-4000-8000-000000000001/intents/95000000-0000-4000-8000-000000000001/concurrency-original.jpg','97000000-0000-4000-8000-000000000001'::uuid,now()+interval '1 day','2026-10-14T00:00:00.000Z'::timestamptz,'awaiting_validation');
insert into storage.objects(id,bucket_id,name,owner_id,metadata) values('96000000-0000-4000-8000-000000000001'::uuid,'monitoring-uploads','20000000-0000-4000-8000-000000000001/intents/95000000-0000-4000-8000-000000000001/concurrency-original.jpg','20000000-0000-4000-8000-000000000001','{"size":137,"mimetype":"image/jpeg"}'::jsonb);
insert into public.uploads(id,project_id,organization_id,uploaded_by,file_name,original_file_name,file_size,mime_type,upload_type,storage_path,intent_request_id,intent_expires_at,received_at,status)
values('95000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'94000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000001'::uuid,'concurrency-changed-original.jpg','concurrency-changed-original.jpg',137,'image/jpeg','drone_photo','20000000-0000-4000-8000-000000000001/intents/95000000-0000-4000-8000-000000000002/concurrency-changed-original.jpg','97000000-0000-4000-8000-000000000002'::uuid,now()+interval '1 day','2026-10-14T00:00:00.000Z'::timestamptz,'awaiting_validation');
insert into storage.objects(id,bucket_id,name,owner_id,metadata) values('96000000-0000-4000-8000-000000000002'::uuid,'monitoring-uploads','20000000-0000-4000-8000-000000000001/intents/95000000-0000-4000-8000-000000000002/concurrency-changed-original.jpg','20000000-0000-4000-8000-000000000001','{"size":137,"mimetype":"image/jpeg"}'::jsonb);
select jsonb_build_object('syntheticOnly',true,'metadataOnly',true,'bytesUploadedOrStored',false,'uploads',(select count(*) from public.uploads),'storageObjects',(select count(*) from storage.objects),'media',(select count(*) from public.project_media));
commit;
