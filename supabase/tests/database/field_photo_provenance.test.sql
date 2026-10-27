begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Replaying the complete grant is idempotent and never grants the server columns.
GRANT INSERT (metadata) ON public.project_media TO authenticated;
GRANT INSERT (metadata) ON public.project_media TO authenticated;
select ok(has_column_privilege('authenticated','public.project_media','metadata','INSERT'),'new field provenance is insertable');
select ok(not has_column_privilege('authenticated','public.project_media','metadata','UPDATE'),'metadata updates remain revoked');
select ok(not has_column_privilege('authenticated','public.project_media','storage_bucket','INSERT'),'storage bucket remains server-controlled');
select ok(not has_column_privilege('authenticated','public.project_media','original_role','INSERT'),'original role remains server-controlled');
select ok(not has_column_privilege('authenticated','public.project_media','sha256','INSERT'),'immutable original checksum remains server-controlled');
select ok(not has_column_privilege('anon','public.project_media','metadata','INSERT'),'anonymous provenance inserts remain forbidden');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','fc130000-0000-4000-8000-000000000001','authenticated','authenticated','field-provenance-reader@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','fc130000-0000-4000-8000-000000000002','authenticated','authenticated','field-provenance-editor@example.test','',now(),'{"provider":"email"}','{}',now(),now());
insert into public.organizations(id,name,type,country) values ('fc140000-0000-4000-8000-000000000001','Technical field provenance','test','Denmark');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('fc140000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000001','viewer'),
 ('fc140000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000002','viewer');
insert into public.projects(id,organization_id,name) values ('fc150000-0000-4000-8000-000000000001','fc140000-0000-4000-8000-000000000001','Technical field provenance');
insert into public.project_members(project_id,user_id,role) values
 ('fc150000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000001','viewer'),
 ('fc150000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000002','editor');
set local role authenticated;
select set_config('request.jwt.claim.sub','fc130000-0000-4000-8000-000000000001',true);
select throws_ok($$insert into public.project_media(project_id,title,category,source,file_path,url,metadata) values ('fc150000-0000-4000-8000-000000000001','Technical rejected reader','field_photo','field_upload','fc150000-0000-4000-8000-000000000001/1777777777000_photo.jpg','','{"original_name":"photo.jpg"}')$$,'42501',null,'viewer cannot insert provenance even after the column grant');
select set_config('request.jwt.claim.sub','fc130000-0000-4000-8000-000000000002',true);
select lives_ok($$insert into public.project_media(project_id,title,category,source,file_path,url,metadata) values ('fc150000-0000-4000-8000-000000000001','Technical editor field photo','field_photo','field_upload','fc150000-0000-4000-8000-000000000001/1777777777000_photo.jpg','','{"original_name":"photo.jpg"}')$$,'authorized editor can insert a legacy field photo with provenance');
reset role;
select * from finish();
rollback;
