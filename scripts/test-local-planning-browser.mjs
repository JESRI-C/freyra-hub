import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

// Never point browser fixtures or an admin client at an existing workspace.
if (process.env.CI !== "true" || process.argv.slice(2).join(" ") !== "--disposable-local")
  throw new Error("Use this runner only in CI with --disposable-local.");
let status;
try {
  status = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  throw new Error("The disposable local stack is unavailable.");
}
const local = parseEnv(status);
if (
  local.API_URL !== "http://127.0.0.1:54321" ||
  local.DB_URL !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ||
  !local.SERVICE_ROLE_KEY ||
  !local.ANON_KEY
)
  throw new Error("Refusing a database other than the disposable local stack.");

const output = resolve("tmp/planning-e2e");
await mkdir(output, { recursive: true });
console.log(`::add-mask::${local.SERVICE_ROLE_KEY}`);
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function checked(result, operation) {
  if (result.error) throw new Error(`Disposable planning fixture failed: ${operation}.`);
  return result.data;
}
async function user(name) {
  const credentials = {
    email: `planning-${randomUUID()}@example.test`,
    password: randomBytes(24).toString("base64url") + "!Aa1",
  };
  console.log(`::add-mask::${credentials.password}`);
  const created = await checked(
    await admin.auth.admin.createUser({
      ...credentials,
      email_confirm: true,
      user_metadata: { full_name: name },
    }),
    "create synthetic account",
  );
  return { ...credentials, id: created.user.id };
}
const manager = await user("Syntetisk planlægger");
const field = await user("Syntetisk medarbejder");
const organizationId = randomUUID();
const projectIds = [randomUUID(), randomUUID(), randomUUID()];
const actionIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const organization = "Syntetisk planprøve";
await checked(
  await admin
    .from("organizations")
    .insert({ id: organizationId, name: organization, type: "test" }),
  "create organization",
);
await checked(
  await admin.from("organization_memberships").insert(
    [manager, field].map(({ id }) => ({
      organization_id: organizationId,
      user_id: id,
      role: "viewer",
    })),
  ),
  "create organization membership",
);
await checked(
  await admin.from("projects").insert(
    projectIds.map((id, index) => ({
      id,
      organization_id: organizationId,
      name: index < 2 ? `Syntetisk sag ${index === 0 ? "A" : "B"}` : "Skjult syntetisk sag",
    })),
  ),
  "create cases",
);
await checked(
  await admin.from("project_members").insert([
    ...projectIds.slice(0, 2).map((project_id) => ({
      project_id,
      user_id: manager.id,
      role: "project_manager",
    })),
    { project_id: projectIds[0], user_id: field.id, role: "field" },
  ]),
  "create project capabilities",
);
await checked(
  await admin.from("actions").insert([
    { id: actionIds[0], project_id: projectIds[0], title: "Syntetisk opgave A" },
    { id: actionIds[1], project_id: projectIds[1], title: "Syntetisk opgave B" },
    {
      id: actionIds[2],
      project_id: projectIds[0],
      title: "Syntetisk opgave uden datoer",
      due_date: "2026-11-24",
    },
    { id: actionIds[3], project_id: projectIds[2], title: "Skjult syntetisk opgave" },
    { id: actionIds[4], project_id: projectIds[0], title: "Syntetisk jobstart" },
  ]),
  "create jobs",
);
const actor = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await checked(
  await actor.auth.signInWithPassword({ email: manager.email, password: manager.password }),
  "authenticate planner",
);
for (const index of [0, 1, 4]) {
  const projectId = projectIds[index === 4 ? 0 : index];
  const plans = await checked(
    await actor.rpc("save_work_order_plan", {
      p_action_id: actionIds[index],
      p_organization_id: organizationId,
      p_project_id: projectId,
      p_expected_version: 0,
      p_plan: {
        schema: "freyra.work-order-plan/v1",
        title: index === 4 ? "Syntetisk jobstart" : `Syntetisk opgave ${index === 0 ? "A" : "B"}`,
        description: "",
        instructions: "Syntetisk arbejdsinstruktion",
        profile: "general",
        responsibleId: manager.id,
        siteId: null,
        watercourseVersionId: null,
        locationNote: "Fiktivt sted",
        plannedStart: index === 4 ? null : index === 0 ? "2026-11-23" : "2026-11-24",
        plannedEnd: index === 4 ? null : "2026-11-24",
        priority: null,
        plannedMethod: null,
        watercourse: null,
      },
      p_correction_reason: "",
      p_request_id: randomUUID(),
    }),
    "save initial plan as the actual planner",
  );
  if (index === 4) {
    const planId = plans[0].id;
    const assignments = await checked(
      await actor.rpc("configure_work_order_assignment", {
        p_action_id: actionIds[index],
        p_organization_id: organizationId,
        p_project_id: projectId,
        p_expected_version: 0,
        p_plan_version_id: planId,
        p_mode: "person",
        p_candidate_user_ids: [field.id],
        p_source_group_version_id: null,
        p_reason: "Syntetisk navngiven tildeling",
        p_request_id: randomUUID(),
      }),
      "assign the disposable start task",
    );
    for (const [version, targetStatus] of ["draft", "planned", "assigned"].entries()) {
      await checked(
        await actor.rpc("mutate_work_order_lifecycle", {
          p_action_id: actionIds[index],
          p_organization_id: organizationId,
          p_project_id: projectId,
          p_expected_version: version,
          p_values: {
            operation: "transition",
            targetStatus,
            planVersionId: planId,
            assignmentVersionId: assignments[0].id,
            executionRevisionId: null,
          },
          p_request_id: randomUUID(),
        }),
        "prepare the assigned lifecycle through the real planner API",
      );
    }
  }
}
await actor.auth.signOut();
await writeFile(
  resolve(output, "fixture.private.json"),
  JSON.stringify({ organization, manager, field, startActionId: actionIds[4] }),
  { mode: 0o600 },
);
const log = await open(resolve(output, "server.private.log"), "a");
const server = spawn(
  process.execPath,
  [
    "--max-old-space-size=3072",
    "node_modules/vite/bin/vite.js",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "4179",
    "--strictPort",
  ],
  {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: local.API_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
      VITE_SUPABASE_PROJECT_ID: "disposable-local",
      SUPABASE_URL: local.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    },
    stdio: ["ignore", log.fd, log.fd],
    windowsHide: true,
  },
);
let browserExitCode = null;
try {
  const deadline = Date.now() + 300_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Disposable browser server exited early.");
    try {
      const response = await fetch("http://127.0.0.1:4179/login", {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Vite compiles the real server on the first request.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Disposable browser server did not become ready.");
  const browser = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.planning.config.ts"],
    {
      env: { ...process.env, FREYRA_PLANNING_E2E: "disposable-local" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  browserExitCode = await new Promise((resolve, reject) => {
    browser.once("error", reject);
    browser.once("exit", (code) => resolve(code ?? 1));
  });
  if (browserExitCode !== 0) throw new Error("Disposable planning browser acceptance failed.");
} finally {
  server.kill("SIGTERM");
  await log.close();
  if (browserExitCode !== 0) {
    let diagnostic = await readFile(resolve(output, "server.private.log"), "utf8");
    for (const secret of [local.SERVICE_ROLE_KEY, local.ANON_KEY, manager.password, field.password])
      diagnostic = diagnostic.split(secret).join("[REDACTED]");
    diagnostic = diagnostic.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[REDACTED JWT]");
    console.error(diagnostic.slice(-8000));
  }
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify({
      schema: "freyra.planning-browser-acceptance/v1",
      synthetic: true,
      disposableLocal: true,
      sourceSha: process.env.GITHUB_SHA ?? null,
      browserExitCode,
      passed: browserExitCode === 0,
    }),
  );
}
