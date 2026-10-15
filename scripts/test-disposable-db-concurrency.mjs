/** Node built-ins only. Run after fresh LOCAL migration replay and rollback TAP.
 * Root must establish a physical disposable backend; no hosted/linked command.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDisposableLocalConnection,
  localPsqlChildEnvironment,
} from "./database-concurrency/local-database-guard.mjs";

import { assertResolvedNoteMigration } from "./database-concurrency/survey-round-note-guards.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : undefined;
};
const evidence = resolve(root, option("--evidence") ?? "tmp/database-concurrency");
const relativeEvidence = relative(root, evidence);
assert(
  relativeEvidence && !relativeEvidence.startsWith("..") && !isAbsolute(relativeEvidence),
  "Evidence must remain within this disposable checkout",
);
await mkdir(evidence, { recursive: true });
const receiptPath = resolve(evidence, "run-receipt.json");
const receipt = {
  schema: "gofreyra.disposable-database-concurrency-run/v1",
  startedAt: new Date().toISOString(),
  testedCheckoutSha: option("--checkout-sha") ?? null,
  checkoutIdentityScope:
    "Trusted workflow github.sha; PR merge checkout identity, branch head SHA is not inferred",
  result: "RUNNING",
  physicalDisposableBackendPrecondition: true,
  initializedSyntheticFixture: false,
  positiveAppPixelStorageAcceptance: false,
  stages: [],
  artifacts: [],
  connection: null,
};
const persistReceipt = async () => writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
await persistReceipt();
let activeChild;
let interruptedSignal = null;
const terminateOwnedChild = (signal) => {
  interruptedSignal = signal;
  process.exitCode = 1;
  if (activeChild) activeChild.kill(signal);
};
process.on("SIGINT", () => terminateOwnedChild("SIGINT"));
process.on("SIGTERM", () => terminateOwnedChild("SIGTERM"));
const normalizedSha = (text) =>
  createHash("sha256").update(text.replaceAll("\r\n", "\n"), "utf8").digest("hex");
const rawSha = (data) => createHash("sha256").update(data).digest("hex");
async function processStage(name, command, parameters, input, childEnvironment) {
  assert.equal(
    interruptedSignal,
    null,
    "Cancelled local concurrency run must not start another database stage",
  );
  const stage = {
    name,
    startedAt: new Date().toISOString(),
    exitCode: null,
    signal: null,
    stdoutFile: `${name}.stdout.log`,
    stderrFile: `${name}.stderr.log`,
  };
  receipt.stages.push(stage);
  await persistReceipt();
  let stdout = "",
    stderr = "";
  const result = await new Promise((resolveResult) => {
    activeChild = spawn(command, parameters, {
      cwd: root,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnvironment,
    });
    activeChild.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    activeChild.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    activeChild.once("error", (error) =>
      resolveResult({ exitCode: 127, signal: null, spawnErrorCode: error.code ?? "unknown" }),
    );
    activeChild.once("close", (exitCode, signal) => resolveResult({ exitCode, signal }));
    activeChild.stdin.on("error", (error) => {
      stage.stdinErrorCode = error.code ?? "unknown";
    });
    activeChild.stdin.end(input);
  });
  activeChild = undefined;
  Object.assign(stage, result, { completedAt: new Date().toISOString() });
  await writeFile(resolve(evidence, stage.stdoutFile), stdout);
  await writeFile(resolve(evidence, stage.stderrFile), stderr);
  await persistReceipt();
  assert.equal(stage.stdinErrorCode, undefined, `${name} stdin delivery must succeed`);
  assert.equal(
    stage.exitCode,
    0,
    `${name} must succeed; preserved local stderr/stdout contain diagnostics`,
  );
  const objects = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  return objects;
}

try {
  if (receipt.testedCheckoutSha !== null)
    assert(
      /^[0-9a-f]{40}$/.test(receipt.testedCheckoutSha),
      "Explicit CI checkout SHA must be a commit ID",
    );
  const connection = assertDisposableLocalConnection(option("--database"), {
    disposableLocal: args.includes("--disposable-local"),
    usesTunnel: args.includes("--tunnel"),
  });
  const childEnvironment = localPsqlChildEnvironment(process.env);
  receipt.connection = {
    host: connection.hostname,
    port: Number(connection.port),
    database: connection.pathname.slice(1),
    credentialRecorded: false,
    queryOverrides: false,
  };
  const index = JSON.parse(
    await readFile(
      resolve(root, "supabase/tests/fixtures/database-concurrency/fixture-index.json"),
      "utf8",
    ),
  );
  assert.equal(index.schema, "gofreyra.disposable-database-concurrency-index/v1");
  const noteGenesis = JSON.parse(
    await readFile(
      resolve(root, "supabase/tests/fixtures/database-concurrency/note-fixture-genesis.json"),
      "utf8",
    ),
  );
  const noteMigration = assertResolvedNoteMigration(noteGenesis);
  const allowedArtifacts = new Set([
    "scripts/test-disposable-db-concurrency.mjs",
    "scripts/database-concurrency/stop-disposable-stack.mjs",
    "scripts/database-concurrency/local-database-guard.mjs",
    "scripts/database-concurrency/survey-round-concurrency.test.mjs",
    "scripts/database-concurrency/project-role-snapshot-concurrency.test.mjs",
    "supabase/tests/fixtures/database-concurrency/initialize.sql",
    "supabase/tests/fixtures/database-concurrency/round.json",
    "supabase/tests/fixtures/database-concurrency/role-snapshot.json",
    "supabase/tests/fixtures/database-concurrency/fixture-genesis.json",
    "scripts/database-concurrency/survey-round-media-concurrency.test.mjs",
    "supabase/tests/fixtures/database-concurrency/initialize-media.sql",
    "supabase/tests/fixtures/database-concurrency/round-media.json",
    "supabase/tests/fixtures/database-concurrency/media-fixture-genesis.json",
    "scripts/database-concurrency/survey-round-note-concurrency.test.mjs",
    "scripts/database-concurrency/survey-round-note-guards.mjs",
    "scripts/database-concurrency/municipal-report-concurrency.test.mjs",
    "supabase/migrations/20261015194002_municipal_report_versions.sql",
    "supabase/tests/fixtures/database-concurrency/initialize-note.sql",
    "supabase/tests/fixtures/database-concurrency/round-note.json",
    "supabase/tests/fixtures/database-concurrency/note-fixture-genesis.json",
    noteMigration,
  ]);
  assert.equal(
    index.files.length,
    allowedArtifacts.size,
    "The reviewed fixture/harness set must be complete",
  );
  assert.equal(
    new Set(index.files.map((artifact) => artifact.path)).size,
    allowedArtifacts.size,
    "Pinned artifact paths must be unique",
  );
  for (const artifact of index.files) {
    assert(
      allowedArtifacts.has(artifact.path),
      "An unreviewed or private file path is refused before any read",
    );
    const path = resolve(root, artifact.path);
    const offset = relative(root, path);
    assert(
      offset && !offset.startsWith("..") && !isAbsolute(offset),
      "Fixture artifact must remain within checkout",
    );
    const data = await readFile(path);
    const normalized = normalizedSha(data.toString("utf8"));
    assert.equal(
      normalized,
      artifact.normalizedSha256,
      `Pinned fixture/harness content changed: ${artifact.path}`,
    );
    if (artifact.path === noteMigration)
      assert.equal(
        normalized,
        noteGenesis.migration.normalizedSqlSha256,
        "Installed migration source must equal the reviewed note SQL",
      );
    receipt.artifacts.push({
      path: artifact.path,
      rawSha256: rawSha(data),
      normalizedSha256: normalized,
    });
  }
  await persistReceipt();
  const psql = option("--psql") ?? "psql";
  const psqlArgs = [
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--quiet",
    "--dbname",
    connection.href,
  ];
  // Fresh replay retains the exact three projects/one organization seeded by
  // the historic migration. No users or operational/customer inputs are allowed.
  // Numeric loopback itself is not proof against an undisclosed tunnel.
  const legacyProjectIds = [
    "10000000-0000-0000-0000-000000000001",
    "10000000-0000-0000-0000-000000000002",
    "10000000-0000-0000-0000-000000000003",
  ];
  const legacyOrganizationId = "00000000-0000-0000-0000-000000000001";
  const legacyProjectSql = legacyProjectIds.map((id) => `'${id}'`).join(",");
  const preflightSql = `select jsonb_build_object('database',current_database(),'role',current_user,
    'requiredRoundTablePresent',to_regclass('public.survey_round_versions') is not null,
    'requiredNoteTablePresent',to_regclass('public.survey_round_note_versions') is not null,
    'requiredReportTablePresent',to_regclass('public.municipal_report_versions') is not null,
    'legacyProjectIds',(select jsonb_agg(id order by id) from public.projects),
    'legacyOrganizationIds',(select jsonb_agg(id order by id) from public.organizations),
    'legacyGraphSha256',encode(extensions.digest(jsonb_build_object(
      'projects',(select jsonb_agg(to_jsonb(row) order by row.id) from public.projects row),
      'organizations',(select jsonb_agg(to_jsonb(row) order by row.id) from public.organizations row)
    )::text,'sha256'),'hex'),
    'counts',jsonb_build_object(
    'users',(select count(*) from auth.users),'organizations',(select count(*) from public.organizations),
    'organizationMembers',(select count(*) from public.organization_memberships),'projects',(select count(*) from public.projects),
    'projectMembers',(select count(*) from public.project_members),'baselines',(select count(*) from public.project_baseline_snapshots),
    'plans',(select count(*) from public.verification_plan_versions),'rounds',(select count(*) from public.survey_round_versions),
    'uploads',(select count(*) from public.uploads),'media',(select count(*) from public.project_media),
    'origins',(select count(*) from public.project_media_upload_origins),'promotions',(select count(*) from public.project_media_promotion_requests),
    'storageObjects',(select count(*) from storage.objects),
    'roundMediaBindings',(select count(*) from public.survey_round_media_versions),
    'roundNotes',(select count(*) from public.survey_round_note_versions),
    'inspections',(select count(*) from public.drone_image_inspections),
    'answers',(select count(*) from public.drone_image_inspection_answer_versions),
    'reports',(select count(*) from public.municipal_report_versions)));`;
  const [before] = await processStage("preflight", psql, psqlArgs, preflightSql, childEnvironment);
  await writeFile(resolve(evidence, "preflight.json"), `${JSON.stringify(before, null, 2)}\n`);
  assert.equal(
    before.role,
    "postgres",
    "This physical disposable fixture is initialized by its local postgres owner",
  );
  assert.equal(
    before.requiredRoundTablePresent,
    true,
    "Reviewed Round migration must already have replayed locally",
  );
  assert.equal(
    before.requiredNoteTablePresent,
    true,
    "Reviewed note migration must have replayed locally",
  );
  assert.equal(
    before.requiredReportTablePresent,
    true,
    "Reviewed municipal report migration must have replayed locally",
  );
  assert.deepEqual(
    before.legacyProjectIds,
    legacyProjectIds,
    "Only historical migration seed projects are permitted",
  );
  assert.deepEqual(
    before.legacyOrganizationIds,
    [legacyOrganizationId],
    "Only the historical migration seed organization is permitted",
  );
  assert.match(before.legacyGraphSha256, /^[0-9a-f]{64}$/);
  for (const [name, count] of Object.entries(before.counts))
    assert.equal(
      Number(count),
      name === "projects" ? 3 : name === "organizations" ? 1 : 0,
      `Fresh disposable table must match the historic migration seed before init: ${name}`,
    );
  receipt.legacySeedGraph = {
    projects: 3,
    organizations: 1,
    beforeSha256: before.legacyGraphSha256,
    preserved: false,
  };
  const sql = await readFile(
    resolve(root, "supabase/tests/fixtures/database-concurrency/initialize.sql"),
    "utf8",
  );
  const [initialized] = await processStage("initialize", psql, psqlArgs, sql, childEnvironment);
  await writeFile(
    resolve(evidence, "initialize.json"),
    `${JSON.stringify(initialized, null, 2)}\n`,
  );
  assert.equal(initialized.syntheticOnly, true);
  assert.equal(Number(initialized.projects), 1);
  assert.equal(Number(initialized.baselines), 1);
  assert.equal(Number(initialized.plans), 1);
  assert.equal(Number(initialized.rounds), 0);
  const genesis = JSON.parse(
    await readFile(
      resolve(root, "supabase/tests/fixtures/database-concurrency/fixture-genesis.json"),
      "utf8",
    ),
  );
  assert.equal(genesis.syntheticOnly, true);
  for (const name of ["projectId", "actorId", "organizationId", "baselineId", "planId"])
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(genesis[name]),
      "Synthetic fixture IDs must be UUIDs",
    );
  assert.equal(initialized.baselineSha256, genesis.baselineSha256);
  assert.equal(initialized.planSha256, genesis.planSha256);
  receipt.initializedSyntheticFixture = true;
  await persistReceipt();
  const shared = ["--disposable-local", "--database", connection.href, "--psql", psql];
  const roundObjects = await processStage(
    "round",
    process.execPath,
    [
      resolve(root, "scripts/database-concurrency/survey-round-concurrency.test.mjs"),
      ...shared,
      "--fixture",
      resolve(root, "supabase/tests/fixtures/database-concurrency/round.json"),
    ],
    undefined,
    childEnvironment,
  );
  const roundProof = roundObjects.find((value) => value.result === "PASS");
  await writeFile(
    resolve(evidence, "round-proof.json"),
    `${JSON.stringify(roundProof ?? null, null, 2)}\n`,
  );
  assert.equal(roundProof?.tests, 5);
  assert.equal(roundProof?.rowsAdded, 4);
  assert.equal(roundProof?.exactMembershipRestored, true);
  assert.equal(roundProof?.graphPreserved, true);
  const roleObjects = await processStage(
    "role-snapshot",
    process.execPath,
    [
      resolve(root, "scripts/database-concurrency/project-role-snapshot-concurrency.test.mjs"),
      ...shared,
      "--fixture",
      resolve(root, "supabase/tests/fixtures/database-concurrency/role-snapshot.json"),
    ],
    undefined,
    childEnvironment,
  );
  const roleProof = roleObjects.find((value) => value.result === "PASS");
  await writeFile(
    resolve(evidence, "role-snapshot-proof.json"),
    `${JSON.stringify(roleProof ?? null, null, 2)}\n`,
  );
  assert.equal(roleProof?.tests, 8);
  assert.equal(roleProof?.actualLockWaitsVerified, true);
  assert.equal(roleProof?.exactMembershipRestored, true);
  assert.equal(roleProof?.graphPreserved, true);
  assert.equal(roleProof?.positiveFullDataAcceptance, false);
  // The prior thirteen cases keep their original zero-media fixture contract.
  // Only now seed TWO metadata-only originals: A stays exact; B is deliberately
  // mutated/committed in the fifth media case to test actual changed-pin denial.
  const mediaInitializeSql = await readFile(
    resolve(root, "supabase/tests/fixtures/database-concurrency/initialize-media.sql"),
    "utf8",
  );
  const [mediaInitialized] = await processStage(
    "media-initialize",
    psql,
    psqlArgs,
    mediaInitializeSql,
    childEnvironment,
  );
  await writeFile(
    resolve(evidence, "media-initialize.json"),
    JSON.stringify(mediaInitialized, null, 2) + "\n",
  );
  assert.equal(mediaInitialized.syntheticOnly, true);
  assert.equal(mediaInitialized.metadataOnly, true);
  assert.equal(mediaInitialized.bytesUploadedOrStored, false);
  assert.equal(Number(mediaInitialized.uploads), 2);
  assert.equal(Number(mediaInitialized.storageObjects), 2);
  assert.equal(Number(mediaInitialized.media), 0);
  const mediaGenesis = JSON.parse(
    await readFile(
      resolve(root, "supabase/tests/fixtures/database-concurrency/media-fixture-genesis.json"),
      "utf8",
    ),
  );
  assert.equal(mediaGenesis.syntheticOnly, true);
  assert.equal(mediaGenesis.actualPureMediaBuilder, true);
  assert.equal(mediaGenesis.actualOriginalValidator, true);
  assert.equal(mediaGenesis.metadataOnlyOriginalFixtures, 2);
  assert.equal(mediaGenesis.bytesUploadedOrStored, false);
  assert.equal(mediaGenesis.roundSha256, genesis.roundManifestSha256);
  const mediaObjects = await processStage(
    "round-media",
    process.execPath,
    [
      resolve(root, "scripts/database-concurrency/survey-round-media-concurrency.test.mjs"),
      ...shared,
      "--fixture",
      resolve(root, "supabase/tests/fixtures/database-concurrency/round-media.json"),
    ],
    undefined,
    childEnvironment,
  );
  const mediaProof = mediaObjects.find((value) => value.result === "PASS");
  await writeFile(
    resolve(evidence, "round-media-proof.json"),
    JSON.stringify(mediaProof ?? null, null, 2) + "\n",
  );
  assert.equal(mediaProof?.tests, 5);
  assert.equal(mediaProof?.rowsAdded, 2);
  assert.equal(mediaProof?.actualLockWaitsVerified, true);
  assert.equal(mediaProof?.exactMembershipRestored, true);
  assert.equal(mediaProof?.protectedOriginalStoragePreserved, true);
  assert.equal(mediaProof?.immutableInputGraphPreserved, true);
  assert.equal(mediaProof?.changedStorageMetadataFixtureDeliberatelyNotRestored, true);
  assert.equal(mediaProof?.metadataOnlyOriginalFixtures, 2);
  assert.equal(mediaProof?.originalBytesUploadedOrStored, false);
  assert.equal(mediaProof?.professionalMunicipalOrReportAcceptance, false);
  // All prior eighteen scenarios and their two-original output remain intact.
  // Only now seed C metadata. Prior B stays changed exactly as found; A stays exact.
  const noteInitializeSql = await readFile(
    resolve(root, "supabase/tests/fixtures/database-concurrency/initialize-note.sql"),
    "utf8",
  );
  const [noteInitialized] = await processStage(
    "note-initialize",
    psql,
    psqlArgs,
    noteInitializeSql,
    childEnvironment,
  );
  await writeFile(
    resolve(evidence, "note-initialize.json"),
    JSON.stringify(noteInitialized, null, 2) + "\n",
  );
  assert.equal(noteInitialized.syntheticOnly, true);
  assert.equal(noteInitialized.metadataOnly, true);
  assert.equal(noteInitialized.bytesUploadedOrStored, false);
  assert.equal(Number(noteInitialized.uploads), 3);
  assert.equal(Number(noteInitialized.storageObjects), 3);
  assert.equal(Number(noteInitialized.media), 2);
  assert.equal(Number(noteInitialized.roundMediaBindings), 2);
  assert.equal(Number(noteInitialized.notes), 0);
  assert.equal(noteGenesis.actualPureNoteBuilder, true);
  assert.equal(noteGenesis.actualPureMediaBuilder, true);
  assert.equal(noteGenesis.actualOriginalValidatorInMemory, true);
  assert.equal(noteGenesis.metadataOnlyAdditionalOriginals, 1);
  const noteObjects = await processStage(
    "round-note",
    process.execPath,
    [
      resolve(root, "scripts/database-concurrency/survey-round-note-concurrency.test.mjs"),
      ...shared,
      "--fixture",
      resolve(root, "supabase/tests/fixtures/database-concurrency/round-note.json"),
    ],
    undefined,
    childEnvironment,
  );
  const noteProof = noteObjects.find((value) => value.result === "PASS");
  await writeFile(
    resolve(evidence, "round-note-proof.json"),
    JSON.stringify(noteProof ?? null, null, 2) + "\n",
  );
  assert.equal(noteProof?.tests, 7);
  assert.equal(noteProof?.rowsAdded, 6);
  assert.equal(noteProof?.actualLockWaitsVerified, true);
  assert.equal(noteProof?.exactMembershipRestored, true);
  assert.equal(noteProof?.protectedOriginalAStoragePreserved, true);
  assert.equal(noteProof?.priorChangedOriginalBPreservedAsFound, true);
  assert.equal(
    noteProof?.priorChangedOriginalBSha256,
    mediaProof.cases.at(-1).afterSha256,
    "B's actual committed mutation from the prior media case must stay exact",
  );
  assert.equal(noteProof?.immutablePriorInputGraphPreserved, true);
  assert.equal(noteProof?.allNoteInputGraphPreserved, true);
  assert.equal(noteProof?.actorId, genesis.actorId);
  assert.equal(noteProof?.additionalMetadataOnlyOriginals, 1);
  assert.equal(noteProof?.totalMetadataOnlyOriginalFixtures, 3);
  assert.equal(noteProof?.originalBytesUploadedOrStored, false);
  assert.equal(noteProof?.changedStorageCMetadataDeliberatelyNotRestored, true);
  assert.equal(noteProof?.professionalMunicipalOrReportAcceptance, false);

  // Preserve all twenty-five prior schedules and their deliberate B/C changes.
  // Report schedules reuse their immutable rows; no additional seed is written.
  const reportObjects = await processStage(
    "municipal-report",
    process.execPath,
    [
      resolve(root, "scripts/database-concurrency/municipal-report-concurrency.test.mjs"),
      ...shared,
      "--fixture",
      resolve(root, "supabase/tests/fixtures/database-concurrency/round-note.json"),
    ],
    undefined,
    childEnvironment,
  );
  const reportProof = reportObjects.find((value) => value.result === "PASS");
  await writeFile(
    resolve(evidence, "municipal-report-proof.json"),
    JSON.stringify(reportProof ?? null, null, 2) + "\n",
  );
  assert.equal(reportProof?.tests, 4);
  assert.equal(reportProof?.rowsAdded, 4);
  assert.equal(reportProof?.actualLockWaitsVerified, true);
  assert.equal(reportProof?.actorId, genesis.actorId);
  assert.equal(reportProof?.exactMembershipRestored, true);
  assert.equal(reportProof?.immutableInputGraphPreserved, true);
  assert.equal(reportProof?.priorChangedStorageBAndCPreservedAsFound, true);
  assert.equal(reportProof?.productionReportCompilerExecuted, false);
  assert.equal(reportProof?.pdfGenerated, false);
  assert.equal(reportProof?.metadataOnlyOriginalFixtures, 3);
  assert.equal(reportProof?.originalBytesUploadedOrStored, false);
  assert.equal(reportProof?.professionalMunicipalOrReportAcceptance, false);

  const postflightSql = `select jsonb_build_object(
    'users',(select count(*) from auth.users),'organizations',(select count(*) from public.organizations),
    'organizationMemberships',(select count(*) from public.organization_memberships),
    'personalBootstrapOrganizations',(select count(*) from public.organizations organization
      join public.organization_memberships member on member.organization_id=organization.id
      where member.user_id='${genesis.actorId}'::uuid and member.role='owner'
      and organization.id<>'${genesis.organizationId}'::uuid),
    'legacyGraphSha256',encode(extensions.digest(jsonb_build_object(
      'projects',(select jsonb_agg(to_jsonb(row) order by row.id) from public.projects row where row.id=any(array[${legacyProjectSql}]::uuid[])),
      'organizations',(select jsonb_agg(to_jsonb(row) order by row.id) from public.organizations row where row.id='${legacyOrganizationId}'::uuid)
    )::text,'sha256'),'hex'),
    'projects',(select count(*) from public.projects),'baselines',(select count(*) from public.project_baseline_snapshots),
    'plans',(select count(*) from public.verification_plan_versions),'rounds',(select count(*) from public.survey_round_versions),
    'draftRounds',(select count(*) from public.survey_round_versions where status='draft'),
    'unapprovedRounds',(select count(*) from public.survey_round_versions where manifest->'acceptance'='{"municipalScopeApproved":false,"professionalApproved":false,"reportAccepted":false}'::jsonb),
    'uploads',(select count(*) from public.uploads),'media',(select count(*) from public.project_media),'storageObjects',(select count(*) from storage.objects),
    'origins',(select count(*) from public.project_media_upload_origins),'promotions',(select count(*) from public.project_media_promotion_requests),
    'roundMediaBindings',(select count(*) from public.survey_round_media_versions),
    'roundNotes',(select count(*) from public.survey_round_note_versions),
    'inspections',(select count(*) from public.drone_image_inspections),
    'answers',(select count(*) from public.drone_image_inspection_answer_versions),
    'reports',(select count(*) from public.municipal_report_versions),
    'unreviewedReports',(select count(*) from public.municipal_report_versions where status='draft_unreviewed' and not report_eligible and not professionally_reviewed and not municipal_scope_approved),
    'unreviewedRoundNotes',(select count(*) from public.survey_round_note_versions where status='draft_unreviewed' and note_version_no=1 and supersedes_id is null and not(manifest ?| array['professionalApproved','reportReady','photoViewed','observedAt','objectGeometry'])),
    'unapprovedRoundMediaBindings',(select count(*) from public.survey_round_media_versions where status='draft_assignment' and manifest->'acceptance'='{\"municipalScopeApproved\":false,\"professionalApproved\":false,\"pixelDecoded\":false,\"georeferenced\":false,\"reportEligible\":false,\"reportAccepted\":false}'::jsonb),
    'editorRole',(select role::text from public.project_members where project_id='${genesis.projectId}'::uuid and user_id='${genesis.actorId}'::uuid),
    'organizationRole',(select role::text from public.organization_memberships where organization_id='${genesis.organizationId}'::uuid and user_id='${genesis.actorId}'::uuid));`;
  const [after] = await processStage("postflight", psql, psqlArgs, postflightSql, childEnvironment);
  await writeFile(resolve(evidence, "postflight.json"), `${JSON.stringify(after, null, 2)}\n`);
  for (const name of ["users", "organizations", "projects", "baselines", "plans"])
    assert.equal(
      Number(after[name]),
      Number(before.counts[name]) + (name === "organizations" ? 2 : 1),
      `Only fixture rows and the real Auth bootstrap may be added: ${name}`,
    );
  assert.equal(
    Number(after.personalBootstrapOrganizations),
    1,
    "The real Auth trigger creates one personal organization",
  );
  assert.equal(
    Number(after.organizationMemberships),
    2,
    "Only fixture-viewer and personal-owner memberships exist",
  );
  assert.equal(
    after.legacyGraphSha256,
    before.legacyGraphSha256,
    "Historical migration seed projects and organization remain byte-for-byte unchanged",
  );
  receipt.legacySeedGraph.afterSha256 = after.legacyGraphSha256;
  receipt.legacySeedGraph.preserved = true;
  receipt.authBootstrapOrganizations = 1;
  for (const name of ["rounds", "draftRounds", "unapprovedRounds"])
    assert.equal(
      Number(after[name]),
      4,
      `Only four initial unapproved Round versions exist: ${name}`,
    );
  for (const name of ["uploads", "media", "storageObjects", "origins", "promotions"])
    assert.equal(
      Number(after[name]),
      3,
      `Only three separate metadata-only original fixtures exist after note stage: ${name}`,
    );
  for (const name of ["roundMediaBindings", "unapprovedRoundMediaBindings"])
    assert.equal(
      Number(after[name]),
      3,
      `Only the three authorized immutable draft assignments exist: ${name}`,
    );
  for (const name of ["roundNotes", "unreviewedRoundNotes"])
    assert.equal(Number(after[name]), 6, `Exactly six immutable manual notes exist: ${name}`);
  for (const name of ["reports", "unreviewedReports"])
    assert.equal(
      Number(after[name]),
      4,
      `Exactly four immutable unapproved report versions exist: ${name}`,
    );
  for (const name of ["inspections", "answers"])
    assert.equal(
      Number(after[name]),
      0,
      `No inspection or answer rows added by report SQL schedules: ${name}`,
    );
  assert.equal(after.editorRole, "editor");
  assert.equal(after.organizationRole, "viewer");
  assert.equal(interruptedSignal, null, "Cancelled local concurrency run cannot claim PASS");
  receipt.result = "PASS";
  receipt.roundScenarios = 5;
  receipt.roleSnapshotScenarios = 8;
  receipt.roundMediaScenarios = 5;
  receipt.roundNoteScenarios = 7;
  receipt.municipalReportScenarios = 4;
  receipt.metadataOnlyOriginalFixtures = 3;
  receipt.changedStorageCMetadataFixtureDeliberatelyNotRestored = true;
  receipt.priorChangedStorageBPreservedAsFound = true;
  receipt.originalBytesUploadedOrStored = false;
  receipt.changedStorageMetadataFixtureDeliberatelyNotRestored = true;
  receipt.totalConcurrencyScenarios = 29;
} catch (error) {
  receipt.result = "FAIL";
  // These scripts/fixtures contain synthetic diagnostics only. Never serialize
  // the connection object, process parameters, environment or credential values.
  receipt.failure = {
    message: error instanceof Error ? error.message : "Unknown local concurrency failure",
  };
  process.exitCode = 1;
} finally {
  if (activeChild) activeChild.kill();
  receipt.completedAt = new Date().toISOString();
  receipt.stackCleanup =
    "Separate workflow step must run stop-disposable-stack.mjs with always(), then upload all receipts/logs with always()";
  await persistReceipt();
  console.log(
    JSON.stringify({
      result: receipt.result,
      concurrencyScenarios: receipt.totalConcurrencyScenarios ?? null,
      evidence: relativeEvidence,
      databaseCleanupDelegated: true,
    }),
  );
}
