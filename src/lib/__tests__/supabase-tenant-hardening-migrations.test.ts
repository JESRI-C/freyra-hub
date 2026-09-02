import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");

const migrationPaths = readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => join(migrationsDirectory, fileName));

const sqlSources = [
  ...migrationPaths,
  join(repositoryRoot, "supabase", "seed.sql"),
  join(repositoryRoot, "supabase", "setup_complete.sql"),
].map((filePath) => ({
  fileName: basename(filePath),
  sql: readFileSync(filePath, "utf8"),
}));

const hardeningSources = sqlSources.filter(({ fileName }) =>
  fileName.includes("harden_4dm_tenant_isolation"),
);

const legacyPolicyNames = [
  "dev_select_all",
  "dev_select_all_connector_logs",
  "dev_all",
  "dev_read_all",
  "auth_read_all",
  "auth_write_all",
  "auth_update_all",
  "auth_delete_all",
  "Users can view media for their projects",
  "Authenticated users can insert media",
  "Authenticated users can update their media",
  "Authenticated users can delete their media",
] as const;

const legacyOpenTables = [
  "organizations",
  "projects",
  "sites",
  "data_sources",
  "sensors",
  "observations",
  "indicators",
  "reports",
  "evidence_files",
  "audit_events",
  "actions",
  "impact_units",
  "construction_projects",
  "nature_contexts",
  "runoff_profiles",
  "environmental_risks",
  "mitigation_measures",
  "authority_submissions",
  "connector_fetch_logs",
  "project_media",
] as const;

const protectedFunctionSignatures = [
  "public.is_org_member",
  "public.has_org_role",
  "public.is_project_member",
  "public.has_project_role",
  "public.is_project_admin",
  "public.is_lavbund_projekt_member",
  "public.get_project_geojson",
  "public.get_project_metrics",
] as const;

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");
}

function normalizeSql(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function statementsMentioning(sql: string, fragment: string): string[] {
  const normalizedFragment = fragment.toLowerCase();
  return stripSqlComments(sql)
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((statement) => statement.includes(normalizedFragment));
}

describe("4DM Supabase tenant hardening migration", () => {
  it("loads the complete ordered migration chain plus seed/setup artifacts", () => {
    expect(migrationPaths.length).toBeGreaterThan(0);
    expect(sqlSources.at(-2)?.fileName).toBe("seed.sql");
    expect(sqlSources.at(-1)?.fileName).toBe("setup_complete.sql");
    expect(hardeningSources).toHaveLength(1);
    const hardeningIndex = migrationPaths.findIndex((migrationPath) =>
      migrationPath.includes("harden_4dm_tenant_isolation.sql"),
    );
    const validationIndex = migrationPaths.findIndex((migrationPath) =>
      migrationPath.includes("validate_project_media_metadata.sql"),
    );
    const uploadIntentIndex = migrationPaths.findIndex((migrationPath) =>
      migrationPath.includes("upload_intents_resumable_storage.sql"),
    );
    const orphanReconciliationIndex = migrationPaths.findIndex((migrationPath) =>
      migrationPath.includes("reconcile_upload_intent_orphans.sql"),
    );
    expect(hardeningIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeGreaterThan(hardeningIndex);
    expect(uploadIntentIndex).toBeGreaterThan(validationIndex);
    expect(orphanReconciliationIndex).toBeGreaterThan(uploadIntentIndex);
    expect(migrationPaths.at(-1)).toContain("reconcile_upload_intent_orphans.sql");
  });

  it("removes every known legacy/open policy from every affected table", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain("drop policy");
    for (const policyName of legacyPolicyNames) {
      expect(hardeningSql, `missing legacy policy cleanup for ${policyName}`).toContain(
        policyName.toLowerCase(),
      );
    }
    for (const tableName of legacyOpenTables) {
      expect(hardeningSql, `missing legacy policy cleanup for public.${tableName}`).toContain(
        `public.${tableName}`,
      );
    }
  });

  it("revokes anonymous table access and protects public function execution", () => {
    const hardeningSql = hardeningSources[0]!.sql;
    const normalized = normalizeSql(hardeningSql);

    expect(normalized).toMatch(/revoke (?:all(?: privileges)?|select)[^;]+ from anon/);

    for (const signature of protectedFunctionSignatures) {
      const revokeStatements = statementsMentioning(
        hardeningSql,
        `revoke execute on function ${signature}`,
      );
      expect(revokeStatements, `missing EXECUTE revoke for ${signature}`).not.toHaveLength(0);
      expect(revokeStatements.join(" "), `${signature} must revoke PUBLIC`).toMatch(
        /\bfrom\b[^;]*\bpublic\b/,
      );
      expect(revokeStatements.join(" "), `${signature} must revoke anon`).toMatch(
        /\bfrom\b[^;]*\banon\b/,
      );
    }

    for (const rpc of ["public.get_project_geojson", "public.get_project_metrics"] as const) {
      const grantStatements = statementsMentioning(
        hardeningSql,
        `grant execute on function ${rpc}`,
      );
      expect(grantStatements, `missing authenticated EXECUTE grant for ${rpc}`).not.toHaveLength(0);
      expect(grantStatements.join(" ")).toContain("authenticated");
    }
  });

  it("closes project-members self-enrolment and prevents tenant-key moves", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain(
      'drop policy if exists "project admins can insert project_members" on public.project_members',
    );
    expect(hardeningSql).toMatch(
      /create policy [^;]+ on public\.project_members for insert to authenticated with check \([^;]+\)/,
    );
    expect(hardeningSql).not.toMatch(
      /on public\.project_members for insert[^;]*user_id\s*=\s*(?:\(?select\s+)?auth\.uid\(\)/,
    );

    expect(hardeningSql).toMatch(/new\.organization_id is distinct from old\.organization_id/);
    expect(hardeningSql).toMatch(/before update of organization_id on public\.projects/);
    expect(hardeningSql).toMatch(/new\.project_id is distinct from old\.project_id/);
    for (const tableName of [
      "project_areas",
      "geo_observations",
      "calculated_metrics",
      "project_media",
    ] as const) {
      expect(hardeningSql, `missing immutable project_id trigger for ${tableName}`).toMatch(
        new RegExp(`before update of project_id on public\\.${tableName}`),
      );
    }
  });

  it("prevents organization-owner escalation and preserves safe upload assignment", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain(
      "role <> 'owner' or private.is_organization_owner(organization_id)",
    );
    expect(hardeningSql).toMatch(/before update of user_id on public\.organization_memberships/);
    expect(hardeningSql).toMatch(
      /create or replace function public\.add_creator_as_owner\(\)[^;]+security definer set search_path\s*=\s*''/,
    );

    const genericProjectTriggerBlock = hardeningSql.match(
      /foreach table_name in array array\[[^;]+tenant_project_id_immutable[^;]+/,
    )?.[0];
    expect(genericProjectTriggerBlock).toBeDefined();
    expect(genericProjectTriggerBlock).not.toContain("'uploads'");
    expect(hardeningSql).toMatch(
      /create trigger uploads_scope_once before update of project_id, organization_id on public\.uploads/,
    );
    expect(hardeningSql).toContain(
      "old.project_id is not null and new.project_id is distinct from old.project_id",
    );
    expect(hardeningSql).toContain("create policy upload_import_jobs_read");
    expect(hardeningSql).toContain("create policy upload_import_jobs_insert");
  });

  it("removes email-based founder authorization from the final signup trigger", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);
    const functionStart = hardeningSql.indexOf(
      "create or replace function public.handle_new_user()",
    );
    const functionEnd = hardeningSql.indexOf(
      "revoke all on function public.handle_new_user()",
      functionStart,
    );
    const signupFunction = hardeningSql.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(signupFunction).toContain("'personal'");
    expect(signupFunction).not.toContain("jesper_riel@hotmail.com");
    expect(signupFunction).not.toMatch(/if new\.email\s*=/);
    expect(hardeningSql).toContain(
      "revoke all on function public.handle_new_user() from public, anon, authenticated",
    );
  });

  it("reserves derived upload provenance for trusted backend writers", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain("revoke insert on table public.uploads from authenticated");
    expect(hardeningSql).toContain(
      "grant insert ( organization_id, project_id, zone_id, uploaded_by, file_name, original_file_name, mime_type, file_size, storage_path, upload_type, user_metadata ) on table public.uploads to authenticated",
    );
    expect(hardeningSql).toContain("revoke update on table public.uploads from authenticated");
    expect(hardeningSql).toContain(
      "grant update (project_id, organization_id, zone_id, user_metadata) on table public.uploads to authenticated",
    );
    expect(hardeningSql).toContain("create or replace function private.audit_upload_created()");
    expect(hardeningSql).toContain(
      "create trigger uploads_audit_created after insert on public.uploads",
    );
    expect(hardeningSql).toContain("'database_trigger'");
  });

  it("revokes monitoring objects from former uploaders after tenant scoping", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain(
      "upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid()",
    );
    expect(hardeningSql).toContain(
      "upload.project_id is not null and private.can_read_project(upload.project_id)",
    );
    expect(hardeningSql).toContain(
      "and not exists ( select 1 from public.uploads upload where upload.storage_path = _object_name )",
    );
    expect(hardeningSql).not.toContain(
      "split_part(_object_name, '/', 1) = auth.uid()::text or exists",
    );
  });

  it("binds monitoring object paths to one immutable uploader identity", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain(
      "create or replace function private.require_upload_storage_identity()",
    );
    expect(hardeningSql).toContain(
      "split_part(new.storage_path, '/', 1) is distinct from new.uploaded_by::text",
    );
    expect(hardeningSql).toContain("upload storage_path already belongs to another upload");
    expect(hardeningSql).toContain(
      "create trigger uploads_storage_identity before insert or update of storage_path, uploaded_by on public.uploads",
    );
    expect(hardeningSql).toContain(
      "(select count(*) from public.uploads upload where upload.storage_path = _object_name) = 1",
    );
    expect(hardeningSql).toContain(
      "split_part(upload.storage_path, '/', 1) = upload.uploaded_by::text",
    );
  });

  it("keeps monitoring Storage deletion aligned with tenant manage rights", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain(
      "create or replace function private.can_delete_monitoring_object(_object_name text)",
    );
    expect(hardeningSql).toContain(
      "upload.project_id is not null and private.can_manage_project(upload.project_id)",
    );
    expect(hardeningSql).toContain("and private.can_delete_monitoring_object(name)");
    expect(hardeningSql).toContain("owner_id = (select auth.uid()::text)");
    expect(hardeningSql).toContain("created_at >= now() - interval '15 minutes'");
  });

  it("does not permit private Storage objects to be renamed across scopes", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).not.toContain("create policy monitoring_uploads_update");
    expect(hardeningSql).not.toContain("create policy project_media_update");
    expect(hardeningSql).not.toContain("create policy evidence_files_update");
    expect(hardeningSql).toContain(
      "drop policy if exists monitoring_uploads_update on storage.objects",
    );
    expect(hardeningSql).toContain("drop policy if exists project_media_update on storage.objects");
    expect(hardeningSql).toContain(
      "drop policy if exists evidence_files_update on storage.objects",
    );
  });

  it("enforces the documented monitoring and project-media bucket limits", () => {
    const bucketStatements = statementsMentioning(
      hardeningSources[0]!.sql,
      "insert into storage.buckets",
    );

    expect(bucketStatements).toHaveLength(2);
    const constrainedBuckets = bucketStatements.find((statement) =>
      statement.includes("file_size_limit"),
    );
    const evidenceBucket = bucketStatements.find((statement) =>
      statement.includes("'evidence-files'"),
    );

    expect(constrainedBuckets).toBeDefined();
    expect(constrainedBuckets).toContain("id, name, public, file_size_limit, allowed_mime_types");
    expect(constrainedBuckets).toContain(
      "'monitoring-uploads', 'monitoring-uploads', false, 209715200",
    );
    expect(constrainedBuckets).toContain("'project-media', 'project-media', false, 52428800");
    for (const mimeType of [
      "image/*",
      "video/*",
      "audio/*",
      "application/pdf",
      "application/json",
      "application/geo+json",
      "application/vnd.google-earth.kml+xml",
      "application/gpx+xml",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/zip",
      "application/x-zip-compressed",
      "text/csv",
      "text/plain",
      "text/xml",
      "application/xml",
    ]) {
      expect(constrainedBuckets).toContain(`'${mimeType}'`);
    }
    expect(constrainedBuckets).toContain("file_size_limit = excluded.file_size_limit");
    expect(constrainedBuckets).toContain("allowed_mime_types = excluded.allowed_mime_types");

    expect(evidenceBucket).toContain("id, name, public");
    expect(evidenceBucket).not.toContain("file_size_limit");
    expect(evidenceBucket).not.toContain("allowed_mime_types");
  });

  it("validates canonical Storage organization/project path relationships", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain(
      "create or replace function private.storage_path_matches_project(_object_name text)",
    );
    expect(hardeningSql).toContain("project.organization_id = encoded_organization::uuid");
    expect(hardeningSql).toContain("and private.storage_path_matches_project(name)");
    expect(hardeningSql).toContain(
      "revoke all on function private.storage_path_matches_project(text) from public, anon",
    );
    expect(hardeningSql).toContain("owner_id = (select auth.uid()::text)");
    expect(hardeningSql).toContain("created_at >= now() - interval '15 minutes'");
    expect(hardeningSql).toContain("where media.file_path = storage.objects.name");
    expect(hardeningSql).toContain("where evidence.file_url = storage.objects.name");
    expect(hardeningSql).toContain(
      "create or replace function private.require_private_storage_reference()",
    );
    expect(hardeningSql).toContain(
      "private.storage_project_id(new_path) is distinct from new.project_id",
    );
    expect(hardeningSql).toContain(
      "create trigger project_media_storage_reference before insert or update of file_path on public.project_media",
    );
    expect(hardeningSql).toContain(
      "create trigger evidence_files_storage_reference before insert or update of file_url on public.evidence_files",
    );
    expect(hardeningSql).toContain("old_path is not null and new_path is distinct from old_path");
  });

  it("keeps field users on the collection/evidence whitelist", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);
    const writeHelperStart = hardeningSql.indexOf(
      "create or replace function private.can_write_project",
    );
    const contributeHelperStart = hardeningSql.indexOf(
      "create or replace function private.can_contribute_project",
    );
    const manageHelperStart = hardeningSql.indexOf(
      "create or replace function private.can_manage_project",
    );
    const writeHelper = hardeningSql.slice(writeHelperStart, contributeHelperStart);
    const contributeHelper = hardeningSql.slice(contributeHelperStart, manageHelperStart);

    expect(writeHelper).toContain("member.role in ('admin', 'project_manager', 'editor')");
    expect(writeHelper).not.toContain("'field'");
    expect(contributeHelper).toContain("member.role = 'field'");
    expect(hardeningSql).toContain(
      "'drone_flights', 'evidence_files', 'field_observations', 'geo_observations', 'observations', 'project_media'",
    );
    expect(hardeningSql).toContain("create policy field_contribution_insert");
    expect(hardeningSql).toContain("private.can_contribute_project(project_id)");
  });

  it("fails closed for external members until document sharing has an authoritative relation", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);
    const readHelperStart = hardeningSql.indexOf(
      "create or replace function private.can_read_project",
    );
    const writeHelperStart = hardeningSql.indexOf(
      "create or replace function private.can_write_project",
    );
    const readHelper = hardeningSql.slice(readHelperStart, writeHelperStart);

    expect(readHelper).toContain(
      "member.role in ('admin', 'project_manager', 'editor', 'field', 'viewer')",
    );
    expect(readHelper).not.toContain("member.role = 'external'");
    expect(hardeningSql).toContain("and member.role <> 'external'");
  });

  it("rejects cross-project parent links and indirect provenance swaps", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);

    expect(hardeningSql).toContain(
      "create or replace function private.require_project_parent_match()",
    );
    for (const tableName of [
      "data_sources",
      "sensors",
      "observations",
      "evidence_files",
      "actions",
      "mitigation_measures",
      "documents",
      "project_media",
      "monitoring_devices",
      "integration_runs",
      "field_observations",
      "drone_flights",
      "environmental_analyses",
      "monitoring_alerts",
      "data_quality_rules",
      "data_quality_issues",
      "uploads",
      "indicator_measurements",
    ] as const) {
      expect(hardeningSql, `missing same-project parent trigger for ${tableName}`).toContain(
        `create trigger project_parent_match before insert or update on public.${tableName}`,
      );
    }

    expect(hardeningSql).toContain(
      "create trigger action_evidence_project_match before insert or update on public.action_evidence",
    );
    expect(hardeningSql).toContain(
      "create trigger device_parameter_match before insert or update on public.device_measurements",
    );
    expect(hardeningSql).toContain(
      "create trigger quality_issue_measurement_match before insert or update on public.data_quality_issues",
    );
    expect(hardeningSql).toContain(
      "create trigger quality_assessment_scope_match before insert or update on public.data_quality_assessments",
    );
    expect(hardeningSql).toContain(
      "add constraint data_quality_issues_measurement_id_fkey foreign key (measurement_id) references public.device_measurements (id) on delete set null not valid",
    );

    expect(hardeningSql).toContain("create or replace function private.reject_parent_key_change()");
    for (const [tableName, parentColumn] of [
      ["device_parameters", "device_id"],
      ["device_measurements", "device_id"],
      ["device_maintenance_logs", "device_id"],
      ["observation_media", "observation_id"],
      ["drone_assets", "flight_id"],
      ["alert_comments", "alert_id"],
      ["data_source_mappings", "data_source_id"],
      ["action_evidence", "action_id"],
      ["upload_import_jobs", "upload_id"],
      ["lavbund_maalepunkter", "projekt_id"],
      ["lavbund_readings", "projekt_id"],
      ["lavbund_transekter", "projekt_id"],
      ["lavbund_groefter", "projekt_id"],
      ["lavbund_ledger", "projekt_id"],
      ["lavbund_snapshots", "projekt_id"],
    ] as const) {
      expect(hardeningSql, `missing immutable indirect scope for ${tableName}`).toContain(
        `('${tableName}', '${parentColumn}')`,
      );
    }
    expect(hardeningSql).toContain(
      "create trigger project_members_user_id_immutable before update of user_id on public.project_members",
    );
    expect(hardeningSql).toContain(
      "create trigger uploads_uploader_immutable before update of uploaded_by on public.uploads",
    );
  });

  it("pins privileged function search paths and prevents setup artifacts reopening RLS", () => {
    const hardeningSql = normalizeSql(hardeningSources[0]!.sql);
    const bootstrapSql = normalizeSql(
      sqlSources
        .filter(({ fileName }) => fileName === "seed.sql" || fileName === "setup_complete.sql")
        .map(({ sql }) => sql)
        .join("\n"),
    );

    expect(hardeningSql).toMatch(/security definer set search_path\s*=\s*''/);
    expect(bootstrapSql).not.toMatch(/create policy [^;]*dev_(?:all|select_all|read_all)/);
    expect(bootstrapSql).not.toMatch(/for all using\s*\(true\)\s*with check\s*\(true\)/);
    expect(
      normalizeSql(sqlSources.find(({ fileName }) => fileName === "setup_complete.sql")!.sql),
    ).not.toMatch(/create or replace function (?:public\.)?get_project_(?:geojson|metrics)/);
  });
});
