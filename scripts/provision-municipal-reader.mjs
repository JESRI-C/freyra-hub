import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { assertStagingTarget } from "./haderslev-seed-lib.mjs";

const { values } = parseArgs({
  options: {
    project: { type: "string" },
    email: { type: "string" },
    test: { type: "boolean", default: false },
    output: { type: "string", default: "tmp/private-haderslev/reader.json" },
  },
});
const check = (result, step) => {
  if (result.error) throw new Error(`${step} mislykkedes (${result.error.code ?? "forbindelse"}).`);
  return result.data;
};
async function main() {
  if (!values.project || !values.email)
    throw new Error("Angiv --project UUID og --email. Brug --test til en særskilt testkonto.");
  assertStagingTarget(process.env.SUPABASE_URL, "xdvqdzdpyceojbdknofi");
  const output = path.resolve(values.output),
    privateRoot = path.resolve("tmp/private-haderslev");
  if (!output.startsWith(privateRoot + path.sep) || !output.endsWith(".json"))
    throw new Error("Privat kvittering skal ligge under tmp/private-haderslev og være JSON.");
  let previous = null;
  try {
    previous = JSON.parse(await readFile(output, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error("Den private kvittering kunne ikke læses sikkert.");
  }
  if (previous && (previous.projectId !== values.project || previous.email !== values.email))
    throw new Error("Kvitteringsfilen tilhører en anden konto eller sag. Vælg en særskilt fil.");
  await mkdir(privateRoot, { recursive: true });
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    options,
  );
  const project = check(
    await admin
      .from("projects")
      .select("id,organization_id,description")
      .eq("id", values.project)
      .single(),
    "Læs sag",
  );
  if (!project.organization_id) throw new Error("Sagen skal være knyttet til en arbejdsplads.");
  let user;
  for (let page = 1; page <= 100; page++) {
    const data = check(await admin.auth.admin.listUsers({ page, perPage: 100 }), "Find konto");
    user = data.users.find((item) => item.email?.toLowerCase() === values.email.toLowerCase());
    if (user || data.users.length < 100) break;
    if (page === 100) throw new Error("Kontooversigten er for stor; afgræns manuelt.");
  }
  let password = previous?.password ?? null;
  if (user && values.test && !password)
    throw new Error(
      "Eksisterende testkonto mangler privat kvittering; brug en ny særskilt testkonto.",
    );
  if (!user) {
    if (!values.test)
      throw new Error(
        "Opret den rigtige bruger i Supabase Auth først; scriptet sender ingen invitation.",
      );
    if (!values.email.endsWith("@freyra.invalid"))
      throw new Error("Testkonti skal bruge @freyra.invalid.");
    password ??= randomBytes(32).toString("base64url");
    // Persist the recovery receipt before the external action. A lost response must not lose the password.
    if (!previous)
      await writeFile(
        output,
        JSON.stringify({ projectId: values.project, email: values.email, password }, null, 2) +
          "\n",
        { flag: "wx", mode: 0o600 },
      );
    user = check(
      await admin.auth.admin.createUser({
        email: values.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Haderslev kommunal læseprøve" },
      }),
      "Opret testkonto",
    ).user;
  }
  const memberships = check(
    await admin
      .from("organization_memberships")
      .select("organization_id,role")
      .eq("user_id", user.id),
    "Læs organisationsadgang",
  );
  const projectMemberships = check(
    await admin.from("project_members").select("project_id,role").eq("user_id", user.id),
    "Læs sagsadgang",
  );
  const orgMembership = memberships.find((m) => m.organization_id === project.organization_id);
  if (orgMembership && orgMembership.role !== "viewer")
    throw new Error(
      "Kontoen har allerede en bredere organisationsrolle. Brug en særskilt kommunekonto.",
    );
  if (projectMemberships.some((m) => m.project_id === project.id && m.role !== "viewer"))
    throw new Error("Kontoen har allerede skriverettighed til sagen. Rollen ændres ikke skjult.");
  if (values.test && projectMemberships.some((m) => m.project_id !== project.id))
    throw new Error("Testkontoen har adgang til andre sager. Brug en ny særskilt testkonto.");
  if (!orgMembership)
    check(
      await admin
        .from("organization_memberships")
        .insert({ user_id: user.id, organization_id: project.organization_id, role: "viewer" }),
      "Tilknyt arbejdsplads som læser",
    );
  if (!projectMemberships.some((m) => m.project_id === project.id))
    check(
      await admin
        .from("project_members")
        .insert({ user_id: user.id, project_id: project.id, role: "viewer" }),
      "Tilknyt kun den valgte sag",
    );
  const confirmed = check(
    await admin
      .from("project_members")
      .select("project_id,role")
      .eq("user_id", user.id)
      .eq("project_id", project.id)
      .single(),
    "Genlæs rolle",
  );
  if (confirmed.role !== "viewer") throw new Error("Læserrollen kunne ikke verificeres.");
  if (password) {
    const reader = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      options,
    );
    check(await reader.auth.signInWithPassword({ email: values.email, password }), "Test login");
    try {
      const visible = check(await reader.from("projects").select("id"), "Test RLS-læsning");
      if (visible.length !== 1 || visible[0].id !== project.id)
        throw new Error("RLS-prøven viste ikke præcis den tildelte sag.");
      const attempt = await reader
        .from("projects")
        .update({ description: project.description })
        .eq("id", project.id)
        .select("id");
      if (!attempt.error && attempt.data?.length)
        throw new Error("RLS tillod en læser at skrive. Stop kommunal adgang.");
    } finally {
      await reader.auth.signOut();
    }
  }

  // Only update this account's verified recovery receipt; never print credentials.
  await writeFile(
    output,
    JSON.stringify(
      {
        projectId: project.id,
        userId: user.id,
        email: values.email,
        role: "viewer",
        ...(password ? { password } : {}),
      },
      null,
      2,
    ) + "\n",
    { flag: "w", mode: 0o600 },
  );
  console.log(
    "Kommunal læseadgang er genlæst. Privat kvittering er gemt lokalt. Ingen invitation er sendt.",
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Adgang kunne ikke oprettes.");
  process.exitCode = 1;
});
