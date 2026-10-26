import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/tests/database/drone_original_validation.test.sql"),
  "utf8",
)
  .replace(/--[^\r\n]*/g, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

describe("drone Storage fixture capabilities", () => {
  it("checks the actual unique-name index before inserting a historical duplicate", () => {
    const helper = sql.slice(
      sql.indexOf("create function pg_temp.storage_history_fixture_supported()"),
      sql.indexOf("$history_support$;"),
    );
    expect(helper).toContain("from pg_catalog.pg_index object_index");
    expect(helper).toContain("object_index.indisunique");
    expect(helper).toContain("object_index.indpred is null");
    expect(helper).toContain("object_index.indnkeyatts = 2");
    expect(helper).toContain("array['bucket_id','name']::text[]");
    const setup = sql.slice(sql.indexOf("do $history_setup$"), sql.indexOf("$history_setup$;"));
    expect(setup).toContain("if pg_temp.storage_history_fixture_supported() then");
  });

  it("reports an unsupported history case as skipped and still checks delete markers", () => {
    const historySkip = sql.indexOf(
      "skip('local storage unique name index does not support historical duplicates', 1)",
    );
    expect(historySkip).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("update storage.objects set is_delete_marker = true")).toBeGreaterThan(
      historySkip,
    );
    expect(sql).toContain("'a current delete marker cannot be prepared as an original'");
  });

  it("binds RPC inputs to one current object instead of both historical and current rows", () => {
    const fixture = sql.slice(
      sql.indexOf("create temporary table original_case as"),
      sql.indexOf("grant select on original_case"),
    );
    expect(fixture).toContain("and object.id = 'da500000-0000-4000-8000-000000000001'");
  });

  it("keeps all 19 assertions and fixture writes scoped to one rollback", () => {
    expect(sql).toMatch(/^begin; /);
    expect(sql).toContain("select plan(19);");
    expect(sql).toMatch(/select \* from finish\(\); rollback;$/);
    expect(sql).not.toMatch(/drop index|alter table storage\.objects|commit;/);
  });
});
