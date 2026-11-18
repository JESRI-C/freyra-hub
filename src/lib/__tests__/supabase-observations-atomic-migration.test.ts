import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260913151422_ingest_observations_atomically.sql",
);
const rawSql = readFileSync(migrationPath, "utf8");
const sql = rawSql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--.*$/gm, " ")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

describe("atomic observations ingest migration", () => {
  it("defines one locked-path invoker RPC with the stable scalar contract", () => {
    expect(sql).toContain(
      "create or replace function public.ingest_observations_atomic( p_project_id uuid, p_observations jsonb ) returns integer language plpgsql security invoker set search_path = ''",
    );
    expect(sql).not.toContain("security definer");
    expect(sql.match(/insert into public\.observations/g)).toHaveLength(1);
    expect(sql).toContain("from pg_catalog.jsonb_to_recordset(p_observations)");
    expect(sql).toContain("select p_project_id,");
    expect(sql).not.toContain("pg_catalog.coalesce");
  });

  it("is executable only by the trusted service role", () => {
    expect(sql).toContain(
      "revoke all on function public.ingest_observations_atomic(uuid, jsonb) from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.ingest_observations_atomic(uuid, jsonb) to service_role",
    );
    expect(sql).not.toContain(
      "grant execute on function public.ingest_observations_atomic(uuid, jsonb) to authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.ingest_observations_atomic(uuid, jsonb) to anon",
    );
  });

  it("caps the JSONB batch and rejects fields outside the explicit observation envelope", () => {
    expect(sql).toContain("v_requested_count < 1 or v_requested_count > 500");
    expect(sql).toContain("pg_catalog.pg_column_size(p_observations) > 4194304");
    expect(sql).toContain("pg_catalog.jsonb_typeof(element.item) <> 'object'");
    expect(sql).toContain("when data_exception then");
    expect(sql).not.toContain("pg_input_is_valid");

    const allowlist = sql.match(/where item_key\.name not in \(([^)]+)\)/)?.[1];
    expect(allowlist).toBeDefined();
    for (const key of [
      "indicator_key",
      "value",
      "unit",
      "observed_at",
      "observation_type",
      "site_id",
      "source_id",
      "confidence",
      "metadata",
    ]) {
      expect(allowlist).toContain(`'${key}'`);
    }
    expect(allowlist).not.toContain("project_id");
    expect(sql).toContain("using errcode = '22023'");
  });

  it("locks the configured tenant and both optional relation types before inserting", () => {
    const projectLock = sql.indexOf("for share of project");
    const siteLock = sql.indexOf("for share of site");
    const sourceLock = sql.indexOf("for share of source");
    const insert = sql.indexOf("insert into public.observations");

    expect(projectLock).toBeGreaterThanOrEqual(0);
    expect(siteLock).toBeGreaterThan(projectLock);
    expect(sourceLock).toBeGreaterThan(siteLock);
    expect(insert).toBeGreaterThan(sourceLock);
    expect(sql).toContain("project.organization_id is not null");
    expect(sql).toContain("site.project_id = p_project_id");
    expect(sql).toContain("source.project_id = p_project_id");
    expect(sql).toContain("get diagnostics v_locked_relations = row_count");
    expect(sql).toContain("using errcode = 'p0002'");
    expect(sql).toContain("using errcode = '23514'");
  });

  it("uses deterministic defaults and verifies the all-or-nothing row count", () => {
    expect(sql).toContain("coalesce(input_row.observation_type, 'ingest')");
    expect(sql).toContain("coalesce(input_row.observed_at, pg_catalog.statement_timestamp())");
    expect(sql).toContain("coalesce(input_row.metadata, '{}'::jsonb)");
    expect(sql).toContain("get diagnostics v_inserted_count = row_count");
    expect(sql).toContain("v_inserted_count <> v_requested_count");
    expect(sql).toContain("using errcode = '55000'");
  });
});
