import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnv } from "vite";

const STAGING_REF = "xdvqdzdpyceojbdknofi";
const LEGACY_REF = "ikrmcetjutqcjtwfhzfv";
const EXPECTED_URL = `https://${STAGING_REF}.supabase.co`;
// Supabase project refs are 20 lowercase alphanumeric characters. Restricting
// the match avoids flagging example hostnames embedded in the Supabase SDK.
const SUPABASE_HOST_PATTERN = /https:\/\/([a-z0-9]{20})\.supabase\.co/g;
const env = loadEnv("staging", process.cwd(), "");

const errors = [];
const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
];

for (const name of required) {
  if (!env[name]?.trim()) errors.push(`${name} mangler`);
}

if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL !== EXPECTED_URL) {
  errors.push("VITE_SUPABASE_URL peger ikke på GoFreyra staging");
}
if (env.SUPABASE_URL && env.SUPABASE_URL !== EXPECTED_URL) {
  errors.push("SUPABASE_URL peger ikke på GoFreyra staging");
}
if (env.VITE_SUPABASE_PROJECT_ID && env.VITE_SUPABASE_PROJECT_ID !== STAGING_REF) {
  errors.push("VITE_SUPABASE_PROJECT_ID er ikke GoFreyra staging-ref");
}
if (
  env.VITE_SUPABASE_PUBLISHABLE_KEY &&
  env.SUPABASE_PUBLISHABLE_KEY &&
  env.VITE_SUPABASE_PUBLISHABLE_KEY !== env.SUPABASE_PUBLISHABLE_KEY
) {
  errors.push("browser- og server-publishable key er ikke ens");
}
if (env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  errors.push("service-role key må aldrig have VITE_-prefix");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(filePath)));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

async function verifyBundle() {
  const outputDirectory = path.resolve(".output");
  try {
    if (!(await stat(outputDirectory)).isDirectory()) throw new Error();
  } catch {
    errors.push(".output mangler; staging-build er ikke oprettet");
    return;
  }

  let stagingRefFound = false;
  const serverOnlyValues = [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OBSERVATIONS_INGEST_API_SECRET",
    "MONITORING_CRON_API_SECRET",
    "DMI_API_KEY",
  ]
    .map((name) => [name, env[name]])
    .filter(([, value]) => value?.trim());

  for (const filePath of await listFiles(outputDirectory)) {
    let contents;
    try {
      contents = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const relativePath = path.relative(process.cwd(), filePath);
    if (contents.includes(LEGACY_REF)) {
      errors.push(`legacy Supabase-ref fundet i build: ${relativePath}`);
    }
    for (const match of contents.matchAll(SUPABASE_HOST_PATTERN)) {
      if (match[1] === STAGING_REF) stagingRefFound = true;
      else errors.push(`fremmed Supabase-ref ${match[1]} fundet i build: ${relativePath}`);
    }
    if (relativePath.startsWith(`.output${path.sep}public${path.sep}`)) {
      for (const [name, value] of serverOnlyValues) {
        if (contents.includes(value))
          errors.push(`${name} er lækket til browser-build: ${relativePath}`);
      }
    }
  }
  if (!stagingRefFound) errors.push("staging-ref blev ikke fundet i build-output");
}

async function preparePreviewBindings() {
  const previewVarsPath = path.resolve(".output/server/.dev.vars.staging");
  try {
    if (!(await stat(path.dirname(previewVarsPath))).isDirectory()) throw new Error();
  } catch {
    errors.push(".output/server mangler; kør build:staging før preview:staging");
    return;
  }

  const contents = [
    `SUPABASE_URL=${env.SUPABASE_URL}`,
    `SUPABASE_PUBLISHABLE_KEY=${env.SUPABASE_PUBLISHABLE_KEY}`,
    "",
  ].join("\n");
  await writeFile(previewVarsPath, contents, { encoding: "utf8", mode: 0o600 });
}

if (process.argv.includes("--check-bundle") && errors.length === 0) {
  await verifyBundle();
}
if (process.argv.includes("--prepare-preview") && errors.length === 0) {
  await preparePreviewBindings();
}

if (errors.length > 0) {
  console.error("Staging-preflight fejlede:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Staging-preflight OK for Supabase ${STAGING_REF}. Ingen nøgler blev vist.`);
