import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/007_geospatial_mvp.sql"),
  "utf8",
)
  .replace(/--[^\r\n]*/g, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function insertStatement(table: string): string {
  const statements = migration.match(new RegExp(`insert into ${table} \\([^;]+;`, "g"));
  expect(statements, `one historical ${table} seed statement`).toHaveLength(1);
  return statements![0];
}

describe("geospatial migration bootstrap without a pre-existing demo project", () => {
  it.each(["project_areas", "geo_observations", "calculated_metrics"])(
    "%s only inserts child records when their exact parent exists",
    (table) => {
      const statement = insertStatement(table);
      // The real hosted fresh replay failed before projects were seeded. A guard on
      // a different project or an unrelated EXISTS would still permit orphan rows.
      expect(statement).toMatch(/\) select seed\.project_id::uuid,/);
      expect(statement).toContain("from (values");
      expect(statement).toMatch(/as seed\(project_id,/);
      expect(statement).toContain(
        "where exists ( select 1 from public.projects parent where parent.id = seed.project_id::uuid ) on conflict do nothing;",
      );
      expect(statement).not.toMatch(/\) values\s*\(/);
    },
  );

  it("does not fabricate a parent project to make bootstrap replay pass", () => {
    expect(migration).not.toMatch(/insert into (?:public\.)?projects\s*\(/);
    expect(migration).not.toMatch(/update (?:public\.)?projects set/);
  });
});
