/** Offline PostgreSQL/RLS regression harness. No network, secrets or customer data.
 * Usage: node scripts/test-bykaer-rls.mjs /path/to/node_modules/@electric-sql/pglite/dist/index.js
 * The minimal pre-existing schema mirrors the relevant checked-in Supabase policies.
 * Storage assertions exercise storage.objects policies, not the hosted Storage byte API.
 * This is NOT proof that production has the same schema, grants or storage policies.
 */
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const modulePath = process.argv[2];
if (!modulePath)
  throw new Error(
    "Supply a locally installed PGlite module; this harness never installs packages.",
  );
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
let count = 0;
const q = (sql, args = []) => db.query(sql, args);
async function denied(label, sql, args = []) {
  let failed = false;
  try {
    await q(sql, args);
  } catch {
    failed = true;
  }
  assert.ok(failed, `${label}: expected rejection`);
  count++;
}
async function check(label, sql, args, verify) {
  const { rows } = await q(sql, args);
  verify(rows);
  count++;
  console.log(`PASS ${label}`);
}
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table public.organizations(id uuid primary key,name text not null);
create table public.organization_memberships(user_id uuid,organization_id uuid,role text,primary key(user_id,organization_id));
create table public.projects(id uuid primary key,organization_id uuid,name text not null);
create table public.project_members(project_id uuid,user_id uuid,role text);
create function public.is_org_member(_user_id uuid,_org_id uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from organization_memberships where user_id=_user_id and organization_id=_org_id)$$;
create function public.is_project_member(_project_id uuid,_user_id uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from project_members where project_id=_project_id and user_id=_user_id)$$;
create function public.has_org_role(_user_id uuid,_org_id uuid,_roles text[]) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from organization_memberships where user_id=_user_id and organization_id=_org_id and role=any(_roles))$$;
alter table public.projects enable row level security;
create policy projects_read on public.projects for select to authenticated using(public.is_project_member(id,auth.uid()) or public.has_org_role(auth.uid(),organization_id,array['owner','admin']));
alter table public.organizations enable row level security;
create policy org_read on public.organizations for select to authenticated using(public.is_org_member(auth.uid(),id));
alter table public.organization_memberships enable row level security;
create policy memberships_read on public.organization_memberships for select to authenticated using(user_id=auth.uid());
create table public.project_media(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),title text not null,category text not null default 'drone_image',source text default 'drone',file_path text not null,url text not null default '',captured_at timestamptz,uploaded_at timestamptz not null default now(),lat float8,lng float8);
alter table public.project_media enable row level security;
-- Legacy permissive policies intentionally included to test restrictive migration policy.
create policy legacy_media_read on public.project_media for select using(true);
create policy legacy_media_insert on public.project_media for insert with check(auth.uid() is not null);
create policy legacy_media_update on public.project_media for update using(auth.uid() is not null);
create policy legacy_media_delete on public.project_media for delete using(auth.uid() is not null);
create table public.evidence_files(id uuid primary key,project_id uuid,title text,evidence_type text,created_at timestamptz default now());
alter table public.evidence_files enable row level security;
create policy evidence_read on public.evidence_files for select to authenticated using(public.is_project_member(project_id,auth.uid()));
create table public.drone_flights(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),flown_at timestamptz default now());
alter table public.drone_flights enable row level security;
create policy existing_flight_access on public.drone_flights for all to authenticated using(public.is_project_member(project_id,auth.uid())) with check(public.is_project_member(project_id,auth.uid()));
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
grant usage on schema public,auth,storage to authenticated,anon,service_role;
grant select on auth.users,public.organizations,public.organization_memberships,public.projects,public.project_members,public.evidence_files to authenticated;
grant all on public.project_media,public.drone_flights,storage.objects to authenticated;
`);
const migrationNames = (await readdir("supabase/migrations"))
  .filter((n) =>
    /^20261026.*(bykaer_reports|watercourse_versions|drone_originals_and_jobs)\.sql$/.test(n),
  )
  .sort();
assert.equal(migrationNames.length, 3);
for (const name of migrationNames) {
  await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
  console.log(`APPLIED ${name}`);
}
const uidA = "00000000-0000-0000-0000-000000000001",
  uidB = "00000000-0000-0000-0000-000000000002";
const orgA = "00000000-0000-0000-0000-000000000011",
  orgB = "00000000-0000-0000-0000-000000000012";
const projectA = "00000000-0000-0000-0000-000000000021",
  projectB = "00000000-0000-0000-0000-000000000022";
const flightA = "00000000-0000-0000-0000-000000000031",
  flightB = "00000000-0000-0000-0000-000000000032";
const mediaA = "00000000-0000-0000-0000-000000000041",
  mediaB = "00000000-0000-0000-0000-000000000042";
const hash = "a".repeat(64),
  hashB = "b".repeat(64);
await q("insert into auth.users values($1),($2)", [uidA, uidB]);
await q("insert into organizations values($1,'Organization A'),($2,'Organization B')", [
  orgA,
  orgB,
]);
await q("insert into organization_memberships values($1,$2,'owner'),($3,$4,'owner')", [
  uidA,
  orgA,
  uidB,
  orgB,
]);
await q("insert into projects values($1,$2,'Project A'),($3,$4,'Project B')", [
  projectA,
  orgA,
  projectB,
  orgB,
]);
await q("insert into project_members values($1,$2,'admin'),($3,$4,'admin')", [
  projectA,
  uidA,
  projectB,
  uidB,
]);
await q("insert into drone_flights(id,project_id) values($1,$2),($3,$4)", [
  flightA,
  projectA,
  flightB,
  projectB,
]);
async function actor(uid) {
  await db.exec("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec("set role authenticated");
}
const mediaSql =
  "insert into project_media(id,project_id,title,file_path,storage_bucket,sha256,flight_id,upload_scope,lat,lng) values($1,$2::text::uuid,'Original',$2::text||'/'||$3::text||'/'||$4,'project-originals',$4,$3::text::uuid,$3::text,55,9)";
await actor(uidB);
await q(mediaSql, [mediaB, projectB, flightB, hashB]);
await actor(uidA);
await q(mediaSql, [mediaA, projectA, flightA, hash]);
await check("media isolation", "select id from project_media", [], (rows) =>
  assert.deepEqual(
    rows.map((r) => r.id),
    [mediaA],
  ),
);
await denied("cross-project media insert", mediaSql, [
  "00000000-0000-0000-0000-000000000043",
  projectB,
  flightB,
  hash,
]);
await denied("cross-project flight binding", mediaSql, [
  "00000000-0000-0000-0000-000000000044",
  projectA,
  flightB,
  hashB,
]);
await denied("original checksum immutable", "update project_media set sha256=$1 where id=$2", [
  hashB,
  mediaA,
]);
await check(
  "original record cannot be deleted",
  "delete from project_media where id=$1 returning id",
  [mediaA],
  (rows) => assert.equal(rows.length, 0),
);
await q("insert into storage.objects(bucket_id,name) values('project-originals',$1)", [
  `${projectA}/${flightA}/${hash}`,
]);
await denied(
  "private storage cross-org insert",
  "insert into storage.objects(bucket_id,name) values('project-originals',$1)",
  [`${projectB}/${flightB}/${hash}`],
);
await check(
  "private storage object cannot be overwritten",
  "update storage.objects set name='changed' returning id",
  [],
  (rows) => assert.equal(rows.length, 0),
);
await check(
  "private storage object cannot be deleted",
  "delete from storage.objects returning id",
  [],
  (rows) => assert.equal(rows.length, 0),
);
const source = {
  id: `media:${mediaA}`,
  checksum: hash,
  title: "forged",
  kind: "forged",
  capturedAt: null,
  position: [0, 0],
  method: "forged",
  version: "forged",
};
const content = {
  title: "Test",
  scope: "Stream",
  audience: "Customer",
  projectName: "Forged",
  organizationName: "Forged",
  sections: [
    {
      id: "s1",
      title: "Findings",
      text: "Observed",
      basis: "observed",
      sourceIds: [source.id],
      reviewed: true,
    },
  ],
  sources: [source],
};
const rpc = "select save_report_revision($1,$2,$3,$4,$5,$6::jsonb) as revision";
const first = (await q(rpc, [null, orgA, projectA, 0, "draft", JSON.stringify(content)])).rows[0]
  .revision;
await check(
  "server canonical source and names",
  "select content from report_revisions where id=$1",
  [first.id],
  (rows) => {
    const c = rows[0].content;
    assert.equal(c.projectName, "Project A");
    assert.equal(c.organizationName, "Organization A");
    assert.deepEqual(c.sources[0].position, [9, 55]);
    assert.equal(c.sources[0].title, "Original");
  },
);
await denied("report wrong organization", rpc, [
  null,
  orgB,
  projectA,
  0,
  "draft",
  JSON.stringify(content),
]);
await denied("report cross-org source", rpc, [
  first.report_id,
  orgA,
  projectA,
  1,
  "draft",
  JSON.stringify({ ...content, sources: [{ ...source, id: `media:${mediaB}`, checksum: hashB }] }),
]);
await denied(
  "direct approval missing section shape",
  "insert into report_revisions(report_id,version,status,content) values($1,2,'approved',$2::jsonb)",
  [first.report_id, JSON.stringify({ ...content, sections: [{ reviewed: true, text: "Forged" }] })],
);
await denied(
  "direct draft missing section title",
  "insert into report_revisions(report_id,version,status,content) values($1,2,'draft',$2::jsonb)",
  [
    first.report_id,
    JSON.stringify({ ...content, sections: [{ ...content.sections[0], title: null }] }),
  ],
);
await denied(
  "direct draft invalid source reference shape",
  "insert into report_revisions(report_id,version,status,content) values($1,2,'draft',$2::jsonb)",
  [
    first.report_id,
    JSON.stringify({ ...content, sections: [{ ...content.sections[0], sourceIds: [123] }] }),
  ],
);
await denied(
  "direct draft numeric title",
  "insert into report_revisions(report_id,version,status,content) values($1,2,'draft',$2::jsonb)",
  [first.report_id, JSON.stringify({ ...content, title: 123 })],
);
await denied("approval missing sources", rpc, [
  first.report_id,
  orgA,
  projectA,
  1,
  "approved",
  JSON.stringify({ ...content, sources: [] }),
]);
await denied("approval wrong checksum", rpc, [
  first.report_id,
  orgA,
  projectA,
  1,
  "approved",
  JSON.stringify({ ...content, sources: [{ ...source, checksum: hashB }] }),
]);
await q(rpc, [first.report_id, orgA, projectA, 1, "approved", JSON.stringify(content)]);
count++;
await denied("stale report version", rpc, [
  first.report_id,
  orgA,
  projectA,
  1,
  "draft",
  JSON.stringify(content),
]);
await denied("immutable revision", "update report_revisions set status='draft' where id=$1", [
  first.id,
]);
await denied("revision deletion", "delete from report_revisions where id=$1", [first.id]);
await actor(uidB);
await check("report documents isolation", "select * from report_documents", [], (rows) =>
  assert.equal(rows.length, 0),
);
await check("report revisions isolation", "select * from report_revisions", [], (rows) =>
  assert.equal(rows.length, 0),
);
await denied(
  "cross-org revision insert",
  "insert into report_revisions(report_id,version,status,content) values($1,3,'draft',$2::jsonb)",
  [first.report_id, JSON.stringify(content)],
);
await actor(uidA);
const line = {
  type: "LineString",
  coordinates: [
    [9, 55],
    [9.001, 55],
  ],
};
const segments = [{ id: "segment1", name: "Segment 1", fromM: 0, toM: 20 }];
const lineSql =
  "insert into watercourse_versions(organization_id,project_id,version,geometry,crs,direction,source,length_m,method,segments) values($1,$2,$3,$4::jsonb,'EPSG:4326','unknown','manual',999,'forged',$5::jsonb) returning *";
const v = (await q(lineSql, [orgA, projectA, 1, JSON.stringify(line), JSON.stringify(segments)]))
  .rows[0];
assert.ok(v.length_m > 60 && v.length_m < 65);
assert.notEqual(v.method, "forged");
count++;
await denied("geometry cross-org", lineSql, [
  orgB,
  projectB,
  1,
  JSON.stringify(line),
  JSON.stringify(segments),
]);
await denied("geometry malformed", lineSql, [orgA, projectA, 2, "{}", "[]"]);
await denied("geometry negative station", lineSql, [
  orgA,
  projectA,
  2,
  JSON.stringify(line),
  JSON.stringify([{ id: "negative", name: "Bad", fromM: -1, toM: 10 }]),
]);
await denied("geometry segments overlap", lineSql, [
  orgA,
  projectA,
  2,
  JSON.stringify(line),
  JSON.stringify([...segments, { id: "segment2", name: "Overlap", fromM: 10, toM: 25 }]),
]);
await denied(
  "geometry version immutable",
  "update watercourse_versions set source='changed' where id=$1",
  [v.id],
);
await denied("geometry version deletion", "delete from watercourse_versions where id=$1", [v.id]);
const obsSql =
  "insert into watercourse_observations(organization_id,project_id,centerline_version_id,segment_id,kind,text,feature_key,source_ids,determination_level) values($1,$2,$3,'segment1','species','Suggestion','tree-1',$4::uuid[],'species_suggestion') returning id";
const obs = (await q(obsSql, [orgA, projectA, v.id, [mediaA]])).rows[0];
count++;
await denied("observation duplicate feature", obsSql, [orgA, projectA, v.id, [mediaA]]);
await denied("observation cross-project source", obsSql, [orgA, projectA, v.id, [mediaB]]);
const mediaA2 = "00000000-0000-0000-0000-000000000045";
await q(mediaSql, [mediaA2, projectA, flightA, "c".repeat(64)]);
const comparisonSql =
  "insert into watercourse_observations(organization_id,project_id,centerline_version_id,segment_id,kind,text,feature_key,source_ids,determination_level,comparison) values($1,$2,$3,'segment1','vegetation','Comparison',$5,$4::uuid[],'observed',$6::jsonb) returning comparison";
const comparison = {
  beforeId: mediaA,
  afterId: mediaA2,
  beforeLight: "Sol",
  afterLight: "Overskyet",
};
await check(
  "comparison roles and lighting roundtrip",
  comparisonSql,
  [orgA, projectA, v.id, [mediaA, mediaA2], "pair-1", JSON.stringify(comparison)],
  (rows) => assert.deepEqual(rows[0].comparison, comparison),
);
await denied("comparison cannot use foreign role", comparisonSql, [
  orgA,
  projectA,
  v.id,
  [mediaA, mediaA2],
  "pair-2",
  JSON.stringify({ ...comparison, afterId: mediaB }),
]);
await denied("comparison roles must be distinct", comparisonSql, [
  orgA,
  projectA,
  v.id,
  [mediaA, mediaA2],
  "pair-3",
  JSON.stringify({ ...comparison, afterId: mediaA }),
]);
await denied("comparison light requires after photo", comparisonSql, [
  orgA,
  projectA,
  v.id,
  [mediaA],
  "pair-4",
  JSON.stringify({ ...comparison, afterId: null }),
]);

await check(
  "review actor and timestamp cannot be spoofed",
  "insert into watercourse_observation_reviews(observation_id,approved_by,approved_at) values($1,$2,'2000-01-01') returning *",
  [obs.id, uidB],
  (rows) => {
    assert.equal(rows[0].approved_by, uidA);
    assert.ok(new Date(rows[0].approved_at).getTime() > Date.now() - 60000);
  },
);
await denied("observation cross-org scope", obsSql, [orgB, projectB, v.id, [mediaA]]);
// A regular organization member without project membership cannot read its observations.
await db.exec("reset role");
const uidC = "00000000-0000-0000-0000-000000000003";
await q("insert into auth.users values($1)", [uidC]);
await q("insert into organization_memberships values($1,$2,'member')", [uidC, orgA]);
await actor(uidC);
await check(
  "same-org project access enforced",
  "select * from watercourse_observations",
  [],
  (rows) => assert.equal(rows.length, 0),
);
await denied(
  "same-org unauthorized review",
  "insert into watercourse_observation_reviews(observation_id) values($1)",
  [obs.id],
);
await actor(uidB);
await check("geometry isolation", "select * from watercourse_versions", [], (rows) =>
  assert.equal(rows.length, 0),
);
await check("observation isolation", "select * from watercourse_observations", [], (rows) =>
  assert.equal(rows.length, 0),
);
await denied(
  "cross-org observation approval",
  "insert into watercourse_observation_reviews(observation_id) values($1)",
  [obs.id],
);
await denied(
  "job cannot fake completion",
  "insert into drone_processing_jobs(project_id,flight_id,input_version,input_manifest,status,progress) values($1,$2,$3,'[]','completed',100)",
  [projectB, flightB, hashB],
);
await q(
  "insert into drone_processing_jobs(project_id,flight_id,input_version,input_manifest,status,progress) values($1,$2,$3,'[]','blocked',0)",
  [projectB, flightB, hashB],
);
count++;
await actor(uidA);
await check("job isolation", "select * from drone_processing_jobs", [], (rows) =>
  assert.equal(rows.length, 0),
);
await db.exec(`reset role;
create function public.has_project_role(_project_id uuid,_user_id uuid,_role text) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from project_members where project_id=_project_id and user_id=_user_id and role=_role)$$;
create table public.audit_events(id uuid primary key default gen_random_uuid(),project_id uuid,event_type text,title text,actor text,source text,entity_type text,entity_id uuid,after_data jsonb);
grant select,insert on public.audit_events to authenticated;
`);
const workspaceMigration = (await readdir("supabase/migrations")).find((n) =>
  n.endsWith("_project_workspace_entries.sql"),
);
await db.exec(await readFile(`supabase/migrations/${workspaceMigration}`, "utf8"));
const workspaceAuditFix = (await readdir("supabase/migrations")).find((n) =>
  n.endsWith("_workspace_audit_uuid_fix.sql"),
);
await db.exec(await readFile(`supabase/migrations/${workspaceAuditFix}`, "utf8"));
const entryId = "00000000-0000-0000-0000-000000000091";
const entrySql = `insert into project_workspace_entries(entry_id,organization_id,project_id,kind,version,title,payload) values($1,$2,$3,'decision_note',$4,'Notat',$5::jsonb) returning id`;
const payload = JSON.stringify({ basis: "Registreret grundlag", source: "Rapportversion 1" });
await actor(uidA);
await q(entrySql, [entryId, orgA, projectA, 1, payload]);
count++;
await q(entrySql, [entryId, orgA, projectA, 2, payload]);
count++;
await denied("stale workspace revision", entrySql, [entryId, orgA, projectA, 2, payload]);
await denied("workspace project cannot move", entrySql, [entryId, orgB, projectB, 3, payload]);
await denied("workspace invalid required fields", entrySql, [
  "00000000-0000-0000-0000-000000000092",
  orgA,
  projectA,
  1,
  "{}",
]);
await denied("workspace extra fields", entrySql, [
  "00000000-0000-0000-0000-000000000092",
  orgA,
  projectA,
  1,
  JSON.stringify({ basis: "x", source: "x", published: true }),
]);
await denied(
  "workspace immutable update",
  "update project_workspace_entries set title='overwrite'",
);
await denied("workspace immutable delete", "delete from project_workspace_entries");
await check(
  "workspace audit recorded",
  "select * from audit_events where entity_id=$1",
  [entryId],
  (rows) => assert.equal(rows.length, 2),
);
await actor(uidB);
await check(
  "workspace cross-org isolation",
  "select * from project_workspace_entries",
  [],
  (rows) => assert.equal(rows.length, 0),
);
await denied("workspace cross-org write", entrySql, [
  "00000000-0000-0000-0000-000000000092",
  orgA,
  projectA,
  1,
  payload,
]);
await db.exec("reset role");
await q("insert into project_members values($1,$2,'viewer')", [projectA, uidC]);
await actor(uidC);
await check("workspace reader can read", "select * from project_workspace_entries", [], (rows) =>
  assert.equal(rows.length, 2),
);
await denied("workspace reader cannot write", entrySql, [
  "00000000-0000-0000-0000-000000000092",
  orgA,
  projectA,
  1,
  payload,
]);

await db.exec('reset role; create schema private; grant usage on schema private to authenticated;');
await db.exec(`
create function private.can_read_project(pid uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.is_project_member(pid,auth.uid()) or exists(select 1 from projects p where p.id=pid and public.has_org_role(auth.uid(),p.organization_id,array['owner','admin'])) $$;
create function private.can_write_project(pid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from projects p where p.id=pid and public.has_org_role(auth.uid(),p.organization_id,array['owner','admin'])) or exists(select 1 from project_members m where m.project_id=pid and m.user_id=auth.uid() and m.role in ('admin','project_manager','editor')) $$;
create function private.can_contribute_project(pid uuid) returns boolean language sql stable security definer set search_path=public as $$select private.can_write_project(pid) or exists(select 1 from project_members m where m.project_id=pid and m.user_id=auth.uid() and m.role='field')$$;
grant execute on all functions in schema private to authenticated;
update organization_memberships set role='viewer' where user_id='00000000-0000-0000-0000-000000000003';
`);
const releaseMigration = (await readdir('supabase/migrations')).find(n=>n.endsWith('_release_1_0_reader_boundaries.sql'));
await db.exec(await readFile('supabase/migrations/'+releaseMigration,'utf8'));
const fullMigrationNames=[...migrationNames,workspaceMigration,workspaceAuditFix,releaseMigration];
for(const name of fullMigrationNames) await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
count++;console.log('PASS six migrations replay idempotently');
await actor(uidC);
for(const table of ['report_documents','report_revisions','watercourse_versions','watercourse_observations','watercourse_observation_reviews','project_media','project_workspace_entries']){
 const {rows}=await q('select * from '+table); assert.ok(rows.length>0,table+' viewer read');count++;
}
async function roleDenied(label,sql,args=[]){try{await q(sql,args);throw new Error(label+': unexpectedly allowed')}catch(e){assert.equal(e.code,'42501',label+': must be denied by RLS, not invalid content');count++;console.log('PASS '+label)}}
const doc=(await q('select id from report_documents limit 1')).rows[0];
const revision=(await q('select * from report_revisions where report_id=$1 order by version desc limit 1',[doc.id])).rows[0];
await roleDenied('viewer cannot create report document','insert into report_documents(organization_id,project_id) values($1,$2)',[orgA,projectA]);
await roleDenied('viewer cannot append report revision','insert into report_revisions(report_id,version,status,content) values($1,$2,$3,$4)',[doc.id,revision.version+1,'draft',JSON.stringify(revision.content)]);
await roleDenied('viewer cannot call report save RPC','select save_report_revision(null,$1,$2,0,$3,$4)',[orgA,projectA,'draft',JSON.stringify(revision.content)]);
await roleDenied('viewer cannot append watercourse version',`insert into watercourse_versions(organization_id,project_id,version,geometry,crs,direction,source,length_m,method,segments) select organization_id,project_id,version+1,geometry,crs,direction,source,length_m,method,segments from watercourse_versions where id=$1`,[v.id]);
await roleDenied('viewer cannot create dronejob',`insert into drone_processing_jobs(project_id,flight_id,input_version,input_manifest) values($1,$2,$3,'[]')`,[projectA,flightA,'c'.repeat(64)]);
await roleDenied('viewer cannot upload original',`insert into storage.objects(bucket_id,name) values('project-originals',$1)`,[projectA+'/'+flightA+'/'+'c'.repeat(64)]);
await roleDenied('viewer cannot add flight','insert into drone_flights(project_id) values($1)',[projectA]);
await check('viewer reads own private original','select * from storage.objects',[],rows=>assert.ok(rows.length>0));
await actor(uidA);
await q(`insert into drone_processing_jobs(project_id,flight_id,input_version,input_manifest) values($1,$2,$3,'[]')`,[projectA,flightA,'c'.repeat(64)]);count++;
await q(`insert into storage.objects(bucket_id,name) values('project-originals',$1)`,[projectA+'/'+flightA+'/'+'c'.repeat(64)]);count++;
console.log(`PASS ${count} offline PostgreSQL/RLS assertions including viewer boundaries and six idempotent migrations.`);
await db.close();
