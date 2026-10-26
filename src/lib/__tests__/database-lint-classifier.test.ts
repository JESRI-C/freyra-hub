import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Result = { ok: boolean; vendorLimitations: unknown[]; blockingIssues: unknown[] };
const scriptPath = resolve(process.cwd(), "scripts/check-database-lint.mjs");
const scriptUrl = pathToFileURL(scriptPath).href;
const { classifyDatabaseLint } = (await import(scriptUrl)) as {
  classifyDatabaseLint: (lintText: string, catalogText: string) => Result;
};

const cases = [
  ["public.st_findextent", "55000", 'record "myrec" is not assigned yet'],
  ["public.st_findextent", "55000", 'record "myrec" is not assigned yet'],
  ["public.populate_geometry_columns", "55000", 'record "gc" is not assigned yet'],
  ["public.postgis_full_version", "42883", "function public.postgis_gdal_version() does not exist"],
  ["public.lockrow", "42P01", 'relation "authorization_table" does not exist'],
  ["public.addauth", "42P01", 'relation "temp_lock_have_table" does not exist'],
];
const findings = cases.map(([name, sqlState, message]) => ({
  function: name,
  issues: [{ level: "error", sqlState, message }],
}));
const catalog = [...new Set(cases.map(([name]) => name))].flatMap((qualifiedName, index) =>
  [0, 1].map((overload) => ({
    qualifiedName,
    oid: String(100 + index * 2 + overload),
    identityArguments: overload ? "schema_name text, table_name text" : "table_name text",
    extensionName: "postgis" as string | null,
    dependencyType: "e" as string | null,
    dependencyRefClass: "pg_extension" as string | null,
  })),
);
const classify = (lint = findings, ownership = catalog) =>
  classifyDatabaseLint(JSON.stringify(lint), JSON.stringify(ownership));

describe("database lint classification with actual extension ownership evidence", () => {
  it("accepts only the six known issues when every overload is extension-owned", () => {
    const result = classify();
    expect(result.ok).toBe(true);
    expect(result.vendorLimitations).toHaveLength(6);
    expect(result.blockingIssues).toEqual([]);
  });

  it("accepts an empty error report with a valid catalog", () => {
    expect(classify([], catalog)).toEqual({ ok: true, vendorLimitations: [], blockingIssues: [] });
  });

  it("rejects an app-owned routine even if its lint issue resembles a vendor limitation", () => {
    const ownership = catalog.map((row) =>
      row.qualifiedName === "public.st_findextent"
        ? { ...row, extensionName: null, dependencyType: null, dependencyRefClass: null }
        : row,
    );
    expect(classify(findings, ownership).ok).toBe(false);
  });

  it("rejects one unowned overload sharing a name with valid PostGIS overloads", () => {
    const ownership = [
      ...catalog,
      {
        qualifiedName: "public.st_findextent",
        oid: "999",
        identityArguments: "custom_argument integer",
        extensionName: null,
        dependencyType: null,
        dependencyRefClass: null,
      },
    ];
    expect(classify(findings, ownership).ok).toBe(false);
  });

  it.each([
    ["extensionName", "postgis_raster"],
    ["dependencyType", "n"],
    ["dependencyRefClass", "pg_proc"],
  ])("rejects ownership with incorrect %s evidence", (key, value) => {
    const ownership = catalog.map((row) =>
      row.qualifiedName === "public.lockrow" ? { ...row, [key]: value } : row,
    );
    expect(classify(findings, ownership).ok).toBe(false);
  });

  it("rejects missing ownership rows for a finding", () => {
    expect(
      classify(
        findings,
        catalog.filter((row) => row.qualifiedName !== "public.addauth"),
      ).ok,
    ).toBe(false);
  });

  it("rejects unknown routines, including app routines in the private schema", () => {
    expect(
      classify([
        {
          function: "private.can_read_project",
          issues: [
            {
              level: "error",
              sqlState: "42P01",
              message: 'relation "authorization_table" does not exist',
            },
          ],
        },
      ]).ok,
    ).toBe(false);
  });

  it.each([
    ["55000", 'record "another_record" is not assigned yet'],
    ["42883", 'record "myrec" is not assigned yet'],
  ])("rejects a known name with an unrecognized state/message (%s)", (sqlState, message) => {
    expect(
      classify([
        { function: "public.st_findextent", issues: [{ level: "error", sqlState, message }] },
      ]).ok,
    ).toBe(false);
  });

  it("rejects another error appended to an otherwise known finding", () => {
    const lint = structuredClone(findings);
    lint[0].issues.push({ level: "error", sqlState: "42501", message: "permission denied" });
    expect(classify(lint).ok).toBe(false);
  });

  it("rejects more instances than the six documented limitations", () => {
    expect(classify([...findings, findings[0]]).ok).toBe(false);
  });

  it.each(["{", "null", "{}", '[{"function":"public.lockrow","issues":[]}]'])(
    "fails closed for malformed or incomplete lint JSON (%s)",
    (input) => expect(() => classifyDatabaseLint(input, JSON.stringify(catalog))).toThrow(),
  );

  it.each(["", "{}", "[]", '[{"qualifiedName":"public.lockrow"}]'])(
    "fails closed for missing or malformed ownership JSON (%s)",
    (input) => expect(() => classifyDatabaseLint("[]", input)).toThrow(),
  );

  it("rejects duplicate catalog OIDs rather than claiming complete overload evidence", () => {
    expect(() => classify(findings, [...catalog, catalog[0]])).toThrow(/duplicate/);
  });
});

describe("database lint command exit status and evidence", () => {
  function run(lint: unknown, ownership: unknown) {
    const directory = mkdtempSync(join(tmpdir(), "freyra-database-lint-test-"));
    try {
      const lintPath = join(directory, "lint.json");
      const ownershipPath = join(directory, "ownership.json");
      writeFileSync(lintPath, JSON.stringify(lint));
      writeFileSync(ownershipPath, JSON.stringify(ownership));
      return spawnSync(process.execPath, [scriptPath, lintPath, ownershipPath], {
        encoding: "utf8",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  it("prints classified JSON and vendor limitations separately with exit zero", () => {
    const result = run(findings, catalog);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).vendorLimitations).toHaveLength(6);
    expect(result.stderr).toContain("Known PostGIS static lint limitation:");
  });

  it("returns a nonzero exit when any app error remains", () => {
    const result = run(
      [
        {
          function: "private.some_app_function",
          issues: [{ level: "error", sqlState: "42P01", message: "missing table" }],
        },
      ],
      catalog,
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).ok).toBe(false);
    expect(result.stderr).toContain("Blocking database lint:");
  });

  it("returns a nonzero exit and fatal evidence for invalid catalogs", () => {
    const result = run([], null);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).fatalError).toContain("catalog");
  });

  it("fails rather than interpreting missing tooling output as a clean report", () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).fatalError).toContain("Usage:");
  });
});
