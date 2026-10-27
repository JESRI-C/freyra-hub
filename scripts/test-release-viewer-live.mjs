/** Real viewer JWT + hosted Storage API. Only explicitly labelled staging test cases. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const [qaPath, envPath, adminKeyPath] = process.argv.slice(2);
if (!qaPath || !envPath || !adminKeyPath) throw Error("Supply private QA/config/admin-key paths");
const qa = JSON.parse(await fs.readFile(qaPath, "utf8"));
const env = Object.fromEntries(
  (await fs.readFile(envPath, "utf8"))
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      let i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
assert.equal(env.SUPABASE_URL, "https://xdvqdzdpyceojbdknofi.supabase.co");
const clients = () =>
  createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const owner = clients();
const ok = (r) => {
  if (r.error) throw Error(r.error.message);
  return r.data;
};
ok(await owner.auth.signInWithPassword({ email: qa.email, password: qa.password }));
const fixture = JSON.parse(await fs.readFile("tmp/workspace-acceptance/result.json", "utf8"))
  .projects[0];
const project = ok(
  await owner.from("projects").select("id,name,organization_id").eq("id", fixture.id).single(),
);
assert.ok(project.name.startsWith("TEKNISK FANETEST"));
const adminKey = (await fs.readFile(adminKeyPath, "utf8")).trim();
const provision = spawnSync(
  process.execPath,
  [
    "scripts/provision-municipal-reader.mjs",
    "--project",
    project.id,
    "--email",
    "release-1-0-rls@freyra.invalid",
    "--test",
    "--output",
    "tmp/private-haderslev/release-rls-reader.json",
  ],
  {
    env: {
      ...process.env,
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: adminKey,
    },
    encoding: "utf8",
    windowsHide: true,
  },
);
assert.equal(provision.status, 0, "Provisioning script must pass");
const receipt = JSON.parse(
  await fs.readFile("tmp/private-haderslev/release-rls-reader.json", "utf8"),
);
const viewer = clients();
ok(await viewer.auth.signInWithPassword({ email: receipt.email, password: receipt.password }));
assert.equal(ok(await viewer.from("projects").select("id")).length, 1);
const evidence = {
  environment: "staging",
  freshViewer: true,
  provisionedBy: "scripts/provision-municipal-reader.mjs",
  checks: [],
  errors: [],
};
const check = (label) => {
  evidence.checks.push({ label, pass: true });
  console.log("PASS " + label);
};
const deny = (r, label) => {
  assert.equal(r.error?.code, "42501", label + " must be rejected by database RLS");
  check(label);
};
try {
  const content = {
    schemaVersion: 1,
    title: "TEKNISK RELEASE LÆSEPRØVE",
    scope: "Teknisk adgangstest; ingen faglig rapport",
    audience: "Intern test",
    projectName: project.name,
    organizationName: "Test",
    sections: [
      {
        id: "s",
        title: "Begrænsninger",
        text: "Kun teknisk adgangstest. Ingen faglige resultater.",
        sourceIds: [],
        basis: "not_measured",
        reviewed: false,
      },
    ],
    sources: [],
  };
  const revision = ok(
    await owner.rpc("save_report_revision", {
      _report_id: null,
      _organization_id: project.organization_id,
      _project_id: project.id,
      _expected_version: 0,
      _status: "draft",
      _content: content,
    }),
  );
  check("editor can create report draft");
  const previous = ok(
    await owner
      .from("watercourse_versions")
      .select("version")
      .eq("project_id", project.id)
      .order("version", { ascending: false })
      .limit(1),
  );
  const line = {
    organization_id: project.organization_id,
    project_id: project.id,
    version: (previous[0]?.version ?? 0) + 1,
    geometry: {
      type: "LineString",
      coordinates: [
        [9, 55],
        [9.001, 55],
      ],
    },
    crs: "EPSG:4326",
    direction: "unknown",
    source: "TEKNISK RLS-FIXTURE; ikke et opmålt kundevandløb",
    length_m: 1,
    method: "fixture",
    segments: [],
  };
  ok(await owner.from("watercourse_versions").insert(line));
  check("editor can append a labelled technical watercourse version");
  const flight = ok(
    await owner
      .from("drone_flights")
      .insert({
        project_id: project.id,
        purpose: "TEKNISK RLS; ingen faktisk flyvning",
        status: "planned",
        flown_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
  );
  const hash = createHash("sha256").update(randomUUID()).digest("hex");
  const job = {
    project_id: project.id,
    flight_id: flight.id,
    input_version: hash,
    input_manifest: [],
    status: "blocked",
    progress: 0,
  };
  ok(await owner.from("drone_processing_jobs").insert(job));
  check("editor can request a blocked technical job");
  const bytes = Buffer.from("TEKNISK RLS STORAGE-FIXTURE " + randomUUID());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const object = project.id + "/field/" + sha;
  ok(
    await owner.storage
      .from("project-originals")
      .upload(object, bytes, { contentType: "application/octet-stream", upsert: false }),
  );
  check("editor can upload a private technical object");
  for (const table of [
    "report_documents",
    "watercourse_versions",
    "drone_processing_jobs",
    "project_workspace_entries",
    "project_media",
  ]) {
    const rows = ok(await viewer.from(table).select("id,project_id"));
    assert.ok(rows.every((row) => row.project_id === project.id));
    check("viewer scoped SELECT " + table);
  }
  assert.equal(
    ok(await viewer.from("report_revisions").select("id").eq("id", revision.id)).length,
    1,
  );
  check("viewer can read saved revision");
  deny(
    await viewer
      .from("report_documents")
      .insert({ organization_id: project.organization_id, project_id: project.id }),
    "viewer report document INSERT denied",
  );
  deny(
    await viewer
      .from("report_revisions")
      .insert({
        report_id: revision.report_id,
        version: revision.version + 1,
        status: "draft",
        content,
      }),
    "viewer report revision INSERT denied",
  );
  deny(
    await viewer.rpc("save_report_revision", {
      _report_id: null,
      _organization_id: project.organization_id,
      _project_id: project.id,
      _expected_version: 0,
      _status: "draft",
      _content: content,
    }),
    "viewer report save RPC denied",
  );
  deny(
    await viewer.from("watercourse_versions").insert({ ...line, version: line.version + 1 }),
    "viewer watercourse version INSERT denied",
  );
  deny(
    await viewer.from("drone_processing_jobs").insert({ ...job, input_version: "d".repeat(64) }),
    "viewer dronejob INSERT denied",
  );
  deny(
    await viewer
      .from("drone_flights")
      .insert({
        project_id: project.id,
        purpose: "TEKNISK AFVIST FORSØG",
        status: "planned",
        flown_at: new Date().toISOString(),
      }),
    "viewer flight INSERT denied",
  );
  const failedUpload = await viewer.storage
    .from("project-originals")
    .upload(project.id + "/field/" + "e".repeat(64), bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  assert.ok(failedUpload.error, "viewer upload must fail");
  assert.ok(/row.level|unauthorized|policy|permission/i.test(failedUpload.error.message));
  check("viewer original upload denied by hosted Storage");
  const downloaded = ok(await viewer.storage.from("project-originals").download(object));
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await downloaded.arrayBuffer()))
      .digest("hex"),
    sha,
  );
  check("viewer downloads assigned original bytes");
  const overwrite = await viewer.storage
    .from("project-originals")
    .upload(object, Buffer.from("overwrite"), { upsert: true });
  assert.ok(overwrite.error);
  check("viewer original overwrite denied");
  await viewer.storage.from("project-originals").remove([object]);
  const after = ok(await owner.storage.from("project-originals").download(object));
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await after.arrayBuffer()))
      .digest("hex"),
    sha,
  );
  check("viewer deletion leaves original bytes unchanged");
  evidence.pass = true;
} catch (error) {
  evidence.errors.push(error.message);
  throw error;
} finally {
  await fs.mkdir("docs/release-1.0", { recursive: true });
  await fs.writeFile("docs/release-1.0/viewer-live.json", JSON.stringify(evidence, null, 2));
  await owner.auth.signOut({ scope: "local" });
  await viewer.auth.signOut({ scope: "local" });
}
