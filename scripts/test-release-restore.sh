set -euo pipefail
# Only the disposable local CI Supabase stack is accepted. No --linked/hosted connections.
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
[ "${CI:-}" = true ] || { echo 'Disposable CI environment required'; exit 1; }
command -v pg_dump
mkdir -p tmp/release-restore
psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'SQL'
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',false);
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values('ea000000-0000-4000-8000-000000000001','disposable-restore@example.test','{}','{}');
insert into public.organizations(id,name,type,country) values('eb000000-0000-4000-8000-000000000001','DISPOSABLE RESTORE FIXTURE','test','Denmark');
insert into public.organization_memberships(user_id,organization_id,role) values('ea000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001','owner') on conflict (user_id,organization_id) do update set role=excluded.role;
insert into public.projects(id,organization_id,name) values('ec000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001','DISPOSABLE RESTORE FIXTURE');
select public.save_report_revision(null,'eb000000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001',0,'draft','{"title":"DISPOSABLE RESTORE FIXTURE","scope":"Technical recovery only","audience":"CI","sections":[{"id":"limit","title":"Limitations","text":"No customer findings.","basis":"not_measured","sourceIds":[],"reviewed":false}],"sources":[]}');
SQL
pg_dump --format=custom --no-owner --no-privileges --file=tmp/release-restore/database.dump
sha256sum tmp/release-restore/database.dump > tmp/release-restore/dump.sha256
createdb --template=template0 freyra_release_restore
psql --dbname=freyra_release_restore --no-psqlrc --set=ON_ERROR_STOP=1 --command='drop schema public'
if ! pg_restore --exit-on-error --no-owner --no-privileges --dbname=freyra_release_restore tmp/release-restore/database.dump > tmp/release-restore/restore.log 2>&1; then
 cat tmp/release-restore/restore.log
 exit 1
fi
for db in postgres freyra_release_restore; do
 psql --dbname="$db" --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align <<'SQL' > "tmp/release-restore/${db}.json"
select jsonb_build_object('project',(select row_to_json(p) from public.projects p where p.id='ec000000-0000-4000-8000-000000000001'),'reports',(select jsonb_agg(to_jsonb(r) order by r.id) from public.report_revisions r join public.report_documents d on d.id=r.report_id where d.project_id='ec000000-0000-4000-8000-000000000001'),'policies',(select count(*) from pg_policies where policyname like 'release_%'));
SQL
 done
cmp tmp/release-restore/postgres.json tmp/release-restore/freyra_release_restore.json
printf '{"schema":"freyra.restore-test/v1","passed":true,"target":"disposable-local-postgres","fullHostedRecovery":false,"storageBytesIncluded":false}\n' > tmp/release-restore/result.json
# Dumps remain private to the disposable runner, only credential-free evidence is uploaded.
