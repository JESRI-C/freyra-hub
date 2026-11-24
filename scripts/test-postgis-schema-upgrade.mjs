import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { localPsqlChildEnvironment } from "./database-concurrency/local-database-guard.mjs";
import { assertPostgisProbeTarget, canonicalPostgisDump } from "./postgis-upgrade/guards.mjs";

const args = process.argv.slice(2);
if (process.env.CI !== "true" || args.length !== 1 || args[0] !== "--disposable-local")
  throw new Error("Use this probe only in CI with --disposable-local.");
let local;
try {
  local = parseEnv(
    execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  throw new Error("The disposable local stack is unavailable.");
}
const database = assertPostgisProbeTarget({
  ci: process.env.CI,
  args,
  apiUrl: local.API_URL,
  databaseUrl: local.DB_URL,
});
const root = process.cwd();
const output = resolve(root, "tmp/postgis-upgrade");
await mkdir(output, { recursive: true });
const environment = {
  ...localPsqlChildEnvironment(process.env),
  CI: "true",
  LC_ALL: "C",
  PGCONNECT_TIMEOUT: "5",
  PGAPPNAME: "freyra-disposable-postgis-upgrade",
};
const psql = [
  "--no-psqlrc",
  "--no-password",
  "--set=ON_ERROR_STOP=1",
  "--dbname=" + database,
  "--command=SET lock_timeout='5s'; SET statement_timeout='120s'; SET gofreyra.disposable_postgis_probe='ci-only';",
];
let stageNumber = 0;
async function run(stage, command, parameters, input, expectedError) {
  const childParameters =
    command === "psql" && input !== undefined ? [...parameters, "--file=-"] : parameters;
  const result = spawnSync(command, childParameters, {
    cwd: root,
    env: environment,
    shell: false,
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stem = String(++stageNumber).padStart(2, "0") + "-" + stage;
  await writeFile(resolve(output, stem + ".stdout.log"), result.stdout ?? "");
  await writeFile(resolve(output, stem + ".stderr.log"), result.stderr ?? "");
  if (expectedError) {
    if (!(result.stderr ?? "").includes(expectedError))
      console.error((result.stderr ?? "").split("\n").slice(-15).join("\n"));
    assert.notEqual(result.status, 0, "Expected the guarded migration to be refused.");
    assert.ok(
      (result.stderr ?? "").includes(expectedError),
      "The refused migration must report the intended guard: " + stage,
    );
  } else if (result.status !== 0 || result.error) {
    console.error((result.stderr ?? "").split("\n").slice(-15).join("\n"));
    throw new Error("Disposable PostGIS upgrade stage failed: " + stage);
  }
  return result.stdout ?? "";
}
const migrationFile = "supabase/migrations/20261124030000_isolate_postgis_from_data_api.sql";
const migration = await readFile(resolve(root, migrationFile), "utf8");
await run("fixture", "psql", [...psql, "--file=scripts/postgis-upgrade/before.sql"]);
const tables = ["geo_features", "geo_observations", "project_areas"].map(
  (table) => "--table=public." + table,
);
async function dump(label, kind) {
  const text = await run(label, "pg_dump", [
    "--no-password",
    "--dbname=" + database,
    kind === "schema" ? "--schema-only" : "--data-only",
    ...tables,
  ]);
  return canonicalPostgisDump(text, kind);
}
const schemaBefore = await dump("schema-before", "schema");
const dataBefore = await dump("data-before", "data");
const checkLegacy = "--command=SELECT postgis_upgrade_acceptance.assert_legacy();";
await run(
  "exposed-schema-refused",
  "psql",
  [...psql],
  "BEGIN; SET LOCAL pgrst.db_schemas='public, \"extensions\" ';\n" + migration + "\nROLLBACK;\n",
  "The extensions schema must not be exposed",
);
await run("after-schema-refusal", "psql", [...psql, checkLegacy]);
await run(
  "unknown-dependency-refused",
  "psql",
  [...psql],
  "BEGIN; CREATE TABLE postgis_upgrade_acceptance.unhandled (geom public.geometry);\n" +
    migration +
    "\nROLLBACK;\n",
  "other objects depend on it",
);
await run("after-dependency-refusal", "psql", [...psql, checkLegacy]);
await run(
  "changed-reference-refused",
  "psql",
  [...psql],
  "BEGIN; UPDATE public.spatial_ref_sys SET srtext='SYNTHETIC REFUSAL PROBE' WHERE srid=4326;\n" +
    migration +
    "\nROLLBACK;\n",
  "Spatial reference content or API boundary changed unexpectedly",
);
await run("after-reference-refusal", "psql", [...psql, checkLegacy]);
await run("rollback", "psql", [...psql], "BEGIN;\n" + migration + "\nROLLBACK;\n");
await run("after-rollback", "psql", [...psql, checkLegacy]);
await run("upgrade", "psql", [...psql, "--single-transaction", "--file=" + migrationFile]);
await run("idempotent-replay", "psql", [
  ...psql,
  "--single-transaction",
  "--file=" + migrationFile,
]);
const schemaAfter = await dump("schema-after", "schema");
const dataAfter = await dump("data-after", "data");
if (schemaAfter !== schemaBefore) throw new Error("Original table contracts changed.");
if (dataAfter !== dataBefore) throw new Error("Original table data changed.");
const tap = await run("boundary-and-rpc", "supabase", [
  "test",
  "db",
  "--local",
  "scripts/postgis-upgrade/after.test.sql",
]);
assert.match(tap, /Result:\s*PASS/, "PostGIS boundary and RPC TAP must pass.");
const anonymousRole = JSON.parse(
  Buffer.from(local.ANON_KEY.split(".")[1], "base64url").toString(),
).role;
assert.equal(anonymousRole, "anon", "The API boundary probe must use the anonymous role.");
const headers = { apikey: local.ANON_KEY, Authorization: "Bearer " + local.ANON_KEY };
async function requestBoundary(method, profile = "public") {
  const response = await fetch(
    local.API_URL +
      "/rest/v1/spatial_ref_sys" +
      (method === "GET" ? "?select=srid&limit=1" : method === "POST" ? "" : "?srid=eq.998998"),
    {
      method,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        ...headers,
        [method === "GET" ? "Accept-Profile" : "Content-Profile"]: profile,
        ...(method === "POST" || method === "PATCH" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST"
        ? {
            body: JSON.stringify({
              srid: 998997,
              auth_name: "SYNTHETIC_API_PROBE",
              auth_srid: 998997,
              srtext: "SYNTHETIC API PROBE",
              proj4text: "+proj=longlat +datum=WGS84",
            }),
          }
        : method === "PATCH"
          ? { body: JSON.stringify({ auth_name: "SYNTHETIC_API_PROBE" }) }
          : {}),
    },
  );
  return { status: response.status, code: (await response.json()).code };
}
let publicBoundary;
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  publicBoundary = await requestBoundary("GET");
  if (publicBoundary.status === 404 && publicBoundary.code === "PGRST205") break;
  await pause(250);
}
assert.deepEqual(
  publicBoundary,
  { status: 404, code: "PGRST205" },
  "The public reference endpoint must be absent.",
);
assert.deepEqual(
  await requestBoundary("GET", "extensions"),
  { status: 406, code: "PGRST106" },
  "The extensions schema must be unavailable through the actual Data API.",
);
for (const method of ["POST", "PATCH", "DELETE"]) {
  assert.deepEqual(
    await requestBoundary(method),
    { status: 404, code: "PGRST205" },
    "Anonymous " + method + " must not reach reference data.",
  );
}
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
await writeFile(
  resolve(output, "receipt.json"),
  JSON.stringify(
    {
      schema: "freyra.disposable-postgis-upgrade/v1",
      passed: true,
      migrationSha256: sha256(migration.replaceAll("\r\n", "\n")),
      schemaSha256: sha256(schemaAfter),
      dataSha256: sha256(dataAfter),
      refusedExposedSchema: true,
      refusedUnknownDependency: true,
      refusedChangedStandardReference: true,
      rollbackPreservedOriginalState: true,
      anonymousDataApiReadAndWritesRefused: true,
      extensionsProfileRefused: true,
      idempotentReplayPassed: true,
    },
    null,
    2,
  ) + "\n",
);
console.log("Disposable PostGIS upgrade, rollback, data preservation and API boundary: PASS");
