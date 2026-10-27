/** Read-only hosted source; recovered bytes remain in an ignored, isolated local target. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import exifr from "exifr";
const [qaPath, envPath] = process.argv.slice(2);
if (!qaPath || !envPath) throw new Error("Private QA and staging config paths required");
const qa = JSON.parse(await fs.readFile(qaPath, "utf8"));
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
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = "7a72d47c9151900ce5cfccecbef0c0a7d9177e337d308d4b1c969a0a7035b0d3";
assert.equal(
  (await client.auth.signInWithPassword({ email: qa.email, password: qa.password })).error,
  null,
);
try {
  const result = await client
    .from("project_media")
    .select("id,project_id,file_path,storage_bucket,sha256,lat,lng,projects!inner(name)")
    .eq("original_role", "drone_original")
    .like("file_path", "%/DJI_0040.JPG")
    .like("projects.name", "TEKNISK E2E%")
    .limit(1)
    .single();
  assert.equal(result.error, null);
  const row = result.data;
  assert.equal(row.storage_bucket, "monitoring-uploads");
  const download = await client.storage.from(row.storage_bucket).download(row.file_path);
  assert.equal(download.error, null);
  const source = Buffer.from(await download.data.arrayBuffer());
  assert.equal(hash(source), expected);
  const root = "tmp/private-release/original-recovery";
  await fs.mkdir(root + "/backup", { recursive: true });
  await fs.mkdir(root + "/restored", { recursive: true });
  await fs.writeFile(root + "/backup/original.bin", source, { mode: 0o600 });
  await fs.writeFile(root + "/backup/manifest.json", JSON.stringify(row, null, 2), { mode: 0o600 });
  // Restore solely from the saved backup, without downloading the source again.
  await fs.copyFile(root + "/backup/original.bin", root + "/restored/DJI_0040.JPG");
  const restored = await fs.readFile(root + "/restored/DJI_0040.JPG");
  assert.equal(hash(restored), expected);
  const gps = await exifr.gps(restored);
  assert.ok(gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude));
  assert.ok(Math.abs(gps.latitude - row.lat) < 0.000001);
  assert.ok(Math.abs(gps.longitude - row.lng) < 0.000001);
  const receipt = {
    schema: "freyra.original-recovery/v1",
    checkedAt: new Date().toISOString(),
    source: "hosted-staging-private-original",
    target: "isolated-local-files",
    sourceProject: row.project_id,
    bytes: restored.length,
    sha256: expected,
    exifGpsPreserved: true,
    sourceModified: false,
    databaseRecovered: false,
    fullHostedRecovery: false,
    passed: true,
  };
  await fs.writeFile(
    "docs/release-1.0/original-recovery.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log("PASS hosted original backed up and restored with identical checksum and EXIF GPS");
} finally {
  await client.auth.signOut({ scope: "local" });
}
