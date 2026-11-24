import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
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
const registryAdmin = await user("Syntetisk kundeadministrator");
const organizationId = randomUUID();
const projectIds = [randomUUID(), randomUUID(), randomUUID()];
const actionIds = Array.from({ length: 6 }, () => randomUUID());
const siteIds = [randomUUID(), randomUUID()];
const organization = "Syntetisk planprøve";
await checked(
  await admin
    .from("organizations")
    .insert({ id: organizationId, name: organization, type: "test" }),
  "create organization",
);
await checked(
  await admin.from("organization_memberships").insert([
    ...[manager, field].map(({ id }) => ({
      organization_id: organizationId,
      user_id: id,
      role: "viewer",
    })),
    { organization_id: organizationId, user_id: registryAdmin.id, role: "owner" },
  ]),
  "create organization membership",
);
await checked(
  await admin.from("projects").insert(
    projectIds.map((id, index) => ({
      id,
      organization_id: organizationId,
      name: index < 2 ? `Syntetisk sag ${index === 0 ? "A" : "B"}` : "Skjult syntetisk sag",
      slug: `synthetic-planning-${id}`,
      project_type: "nature_restoration",
      status: "planning",
      description: "Syntetisk softwareprøve; ingen faktisk naturindsats.",
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
  await admin.from("sites").insert(
    siteIds.map((id, index) => ({
      id,
      project_id: projectIds[0],
      name: `Syntetisk arbejdssted ${index + 1}`,
      status: "active",
      centroid_lng: 9.4 + index / 100,
      centroid_lat: 56.1 + index / 100,
      geometry_geojson: { type: "Point", coordinates: [9.4 + index / 100, 56.1 + index / 100] },
    })),
  ),
  "create synthetic job locations",
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
    { id: actionIds[5], project_id: projectIds[0], title: "Syntetisk dokumentationsjob" },
  ]),
  "create jobs",
);
const actor = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await checked(
  await actor.auth.signInWithPassword({
    email: registryAdmin.email,
    password: registryAdmin.password,
  }),
  "authenticate registry administrator",
);
async function customerCommand(actorId, operation, payload) {
  return checked(
    await actor.rpc("command_work_customers", {
      p_organization_id: organizationId,
      p_expected_actor_id: actorId,
      p_request_id: randomUUID(),
      p_operation: operation,
      p_payload: payload,
    }),
    "save synthetic customer context",
  );
}
const workflowCustomer = await customerCommand(registryAdmin.id, "save_customer", {
  customerId: null,
  expectedVersion: 0,
  data: {
    name: "Fiktiv feltkunde",
    registrationNumber: "",
    address: "",
    postalCode: "",
    city: "",
    country: "Danmark",
    archived: false,
  },
});
const workflowContact = await customerCommand(registryAdmin.id, "save_contact", {
  customerId: workflowCustomer.id,
  contactId: null,
  expectedVersion: 0,
  data: {
    name: "Fiktiv feltkontakt",
    title: "Kontakt",
    phone: "FIKTIV-TELEFON",
    email: "field-contact@example.test",
    archived: false,
  },
});
await customerCommand(registryAdmin.id, "grant_planner", {
  customerId: workflowCustomer.id,
  userId: manager.id,
  expectedVersion: 0,
  enabled: true,
});
await actor.auth.signOut();
await checked(
  await actor.auth.signInWithPassword({ email: manager.email, password: manager.password }),
  "authenticate planner",
);
await customerCommand(manager.id, "bind_case", {
  projectId: projectIds[0],
  customerId: workflowCustomer.id,
  contactId: workflowContact.id,
  expectedVersion: 0,
  customerReference: "FIKTIV-FELT-REF",
});
const cards = [];
for (const definition of [
  {
    schema: "freyra.field-job-template/v1",
    title: "Syntetisk stedkontrol",
    domain: "nature",
    fields: [{ key: "condition", label: "Forhold på stedet", type: "text", required: true }],
  },
  {
    schema: "freyra.field-job-template/v1",
    title: "Syntetisk afslutningskontrol",
    domain: "nature",
    fields: [
      { key: "count", label: "Antal", type: "number", required: true },
      { key: "checked", label: "Kontrolleret", type: "boolean", required: true },
    ],
  },
]) {
  const rows = await checked(
    await actor.rpc("save_field_job_template_version", {
      p_organization_id: organizationId,
      p_project_id: projectIds[0],
      p_template_id: randomUUID(),
      p_expected_version: 0,
      p_definition: definition,
      p_request_id: randomUUID(),
    }),
    "create required synthetic job card",
  );
  const row = rows[0];
  cards.push({
    templateVersionId: row.id,
    templateId: row.template_id,
    version: row.version,
    definition: row.definition,
  });
}
let workflow;
for (const index of [0, 1, 4, 5]) {
  const projectId = projectIds[index >= 4 ? 0 : index];
  const plans = await checked(
    await actor.rpc("save_work_order_plan", {
      p_action_id: actionIds[index],
      p_organization_id: organizationId,
      p_project_id: projectId,
      p_expected_version: 0,
      p_plan: {
        schema: "freyra.work-order-plan/v1",
        title:
          index === 5
            ? "Syntetisk dokumentationsjob"
            : index === 4
              ? "Syntetisk jobstart"
              : `Syntetisk opgave ${index === 0 ? "A" : "B"}`,
        description: "",
        instructions: "Syntetisk arbejdsinstruktion",
        profile: index === 5 ? "nature" : "general",
        responsibleId: manager.id,
        siteId: index >= 4 ? siteIds[index - 4] : null,
        watercourseVersionId: null,
        locationNote: "Fiktivt sted",
        plannedStart: index >= 4 ? null : index === 0 ? "2026-11-23" : "2026-11-24",
        plannedEnd: index >= 4 ? null : "2026-11-24",
        priority: null,
        plannedMethod: null,
        watercourse: null,
        ...(index === 5 ? { requiredJobCards: cards } : {}),
      },
      p_correction_reason: "",
      p_request_id: randomUUID(),
    }),
    "save initial plan as the actual planner",
  );
  if (index >= 4) {
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
    if (index === 5) {
      await checked(
        await actor.rpc("save_work_order_access", {
          p_action_id: actionIds[index],
          p_organization_id: organizationId,
          p_project_id: projectId,
          p_user_id: manager.id,
          p_expected_version: 0,
          p_active: true,
          p_can_execute: false,
          p_can_review: true,
          p_reason: "Syntetisk uafhængig gennemgang",
          p_request_id: randomUUID(),
        }),
        "grant independent review of the synthetic job",
      );
      workflow = {
        actionId: actionIds[index],
        organizationId,
        projectId,
        planId,
        cardIds: cards.map((card) => card.templateVersionId),
      };
    }
  }
}
await actor.auth.signOut();
await writeFile(
  resolve(output, "fixture.private.json"),
  JSON.stringify({
    organization,
    manager,
    field,
    registryAdmin,
    startActionId: actionIds[4],
    workflow,
    api: { url: local.API_URL, anonKey: local.ANON_KEY },
  }),
  { mode: 0o600 },
);
const log = await open(resolve(output, "server.private.log"), "a");
const runtimeEnv = {
  ...process.env,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
  VITE_SUPABASE_PROJECT_ID: "disposable-local",
  SUPABASE_URL: local.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
};
const workerSecrets = resolve(".output/server/.dev.vars");
let secretsCreated = false;
let server;
let browserExitCode = null;
try {
  // Offline program files are emitted only by a real build. A Vite development
  // server cannot establish the same service-worker readiness contract.
  const build = spawn(
    process.execPath,
    ["--max-old-space-size=3072", "node_modules/vite/bin/vite.js", "build"],
    { env: runtimeEnv, stdio: ["ignore", log.fd, log.fd], windowsHide: true },
  );
  const buildCode = await new Promise((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", (code) => resolve(code ?? 1));
  });
  if (buildCode !== 0) throw new Error("Disposable application build failed.");
  const manifest = JSON.parse(
    await readFile(resolve(".output/public/field-offline-manifest.json"), "utf8"),
  );
  if (
    manifest.schema !== "freyra.field-offline-assets/v1" ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0
  )
    throw new Error("Built offline program files are missing.");
  for (const asset of manifest.assets) {
    if (typeof asset !== "string" || !asset.startsWith("/") || asset.includes(".."))
      throw new Error("Unexpected offline asset path.");
    if (!/\.(?:js|css)$/.test(asset)) continue;
    const content = await readFile(resolve(".output/public", asset.slice(1)), "utf8");
    if (content.includes(local.SERVICE_ROLE_KEY))
      throw new Error("A server credential reached a client asset.");
  }
  // Bind only the disposable stack. Never inherit a production .env or put
  // secret values in command arguments, tracked configuration or browser files.
  execFileSync("git", ["check-ignore", "--quiet", "--", workerSecrets], { stdio: "ignore" });
  await writeFile(
    workerSecrets,
    Object.entries({
      SUPABASE_URL: local.API_URL,
      SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
      SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    })
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  secretsCreated = true;
  server = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--config",
      ".output/server/wrangler.json",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      "4179",
      "--persist-to",
      resolve(output, "worker-state"),
    ],
    { env: runtimeEnv, stdio: ["ignore", log.fd, log.fd], windowsHide: true },
  );
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
      // Wait for the built local Worker to start.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Disposable browser server did not become ready.");
  const workerResponse = await fetch("http://127.0.0.1:4179/field-sw.js", {
    signal: AbortSignal.timeout(10_000),
  });
  if (
    !workerResponse.ok ||
    !/javascript|ecmascript/.test(workerResponse.headers.get("content-type") ?? "") ||
    (await workerResponse.text()).includes("const manifest = __FREYRA_FIELD_PRECACHE__;")
  )
    throw new Error("The built field service worker is unavailable.");
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
  server?.kill("SIGTERM");
  await log.close();
  if (secretsCreated) await unlink(workerSecrets);
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
