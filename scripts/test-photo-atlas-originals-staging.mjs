/** Staging-only original -> metadata -> atlas browser proof. Inputs remain private. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
const [qaPath, envPath, originalPath] = process.argv.slice(2);
assert.ok(qaPath && envPath && originalPath);
const qa = JSON.parse(await fs.readFile(qaPath, "utf8"));
const project = JSON.parse(await fs.readFile("tmp/photo-atlas-acceptance/project.json", "utf8"));
const env = Object.fromEntries(
  (await fs.readFile(envPath, "utf8"))
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, "xdvqdzdpyceojbdknofi.supabase.co");
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = await client.auth.signInWithPassword({ email: qa.email, password: qa.password });
assert.equal(auth.error, null);
const sha256 = createHash("sha256")
  .update(await fs.readFile(originalPath))
  .digest("hex");
const result = { base, projectId: project.id, sha256, steps: [], passed: false, errors: [] };
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  await context.addInitScript(
    ({ session, org, project }) => {
      localStorage.setItem("sb-xdvqdzdpyceojbdknofi-auth-token", JSON.stringify(session));
      localStorage.setItem(
        "freyra-auth-selection-v1",
        JSON.stringify({ orgId: org, projectId: project }),
      );
    },
    { session: auth.data.session, org: qa.organizationId, project: project.id },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => result.errors.push(e.message));
  await page.goto(base + "/app/projects/" + project.id, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Fotoatlas", exact: true }).click();
  const media = await client
    .from("project_media")
    .select("id")
    .eq("project_id", project.id)
    .eq("sha256", sha256);
  assert.equal(media.error, null);
  if (!media.data.length) {
    await page.getByText("Andet foto eller bilag", { exact: true }).click();
    await page.getByLabel("Vælg andet foto eller bilag").setInputFiles(path.resolve(originalPath));
    await page.getByRole("button", { name: "Gem foto eller bilag", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /er uploadet og afventer gennemgang/i })
      .last()
      .waitFor();
  }
  const atlas = page.getByRole("region", { name: "Projektets fotoatlas og baseline" });
  const build = atlas.getByRole("button", {
    name: "Byg fotoatlas fra sagens originaler",
    exact: true,
  });
  await build.waitFor();
  await build.click();
  await atlas.getByRole("status").filter({ hasText: "1 af 1 fotos" }).waitFor({ timeout: 180000 });
  const download = page.waitForEvent("download");
  await atlas.getByRole("button", { name: "Hent fotobaseline som JSON" }).click();
  const file = await download;
  const target = path.resolve("tmp/photo-atlas-acceptance/original-baseline.json");
  await file.saveAs(target);
  const data = JSON.parse(await fs.readFile(target, "utf8"));
  assert.equal(data.image_count, 1);
  const photo = data.observations[0];
  assert.equal(photo.sha256, sha256);
  assert.equal(photo.filename, path.basename(originalPath));
  assert.equal(photo.date, "2026-08-24");
  assert.ok(photo.lat > 54 && photo.lat < 57);
  assert.ok(photo.lon > 8 && photo.lon < 11);
  assert.equal(photo.watercourse, "");
  assert.equal(photo.section_id, "");
  assert.deepEqual(photo.species, []);
  assert.ok(!photo.source.includes("token="));
  assert.ok(!photo.source.includes("supabase"));
  await atlas.getByRole("button", { name: new RegExp(photo.id) }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: new RegExp(photo.id) }).waitFor();
  await page.screenshot({ path: "docs/screens/photo-atlas/08-originalatlas.png" });
  await page.keyboard.press("Escape");
  result.steps.push(
    "Real original uploaded through UI; fresh authorized original download; same SHA-256; EXIF date and camera GPS; no invented watercourse, reach or species; persisted atlas export without signed URLs",
  );
  const sources = await client
    .from("evidence_files")
    .select("id")
    .eq("project_id", project.id)
    .eq("evidence_type", "freyra_photo_atlas_v1")
    .order("created_at", { ascending: false })
    .limit(1);
  assert.equal(sources.error, null);
  assert.ok(sources.data[0]);
  await atlas.getByLabel("Gemte fotoatlas og baselines").selectOption(sources.data[0].id);
  await atlas.getByRole("status").filter({ hasText: "274 af 274 fotos" }).waitFor();
  assert.deepEqual(result.errors, []);
  result.passed = true;
  await context.close();
} finally {
  await browser.close();
  await client.auth.signOut({ scope: "local" });
  await fs.writeFile(
    "docs/release-1.0/photo-atlas-originals-browser.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
console.log("PASS original-to-atlas browser proof");
