import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import exifr from "exifr";
const { parse } = exifr;
import { createClient } from "@supabase/supabase-js";
import {
  CORE_POINTS,
  CASE_NAME,
  FLIGHT_DATE,
  stableUuid,
  jpegDimensions,
  validateSeedMetadata,
  assertStagingTarget,
} from "./haderslev-seed-lib.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: "boolean", default: false },
    org: { type: "string" },
    points: { type: "string" },
    output: { type: "string", default: "tmp/haderslev-seed.json" },
  },
});

async function check(result, step) {
  if (result.error)
    throw new Error(
      `${step} mislykkedes (${result.error.code ?? "forbindelse"}). Ingen hemmeligheder eller rå serverfejl udskrives.`,
    );
  return result.data;
}

async function main() {
  if (positionals.length !== 1)
    throw new Error(
      "Brug: node scripts/seed-haderslev-demo.mjs <originalmappe> [--org UUID --apply]",
    );
  const folder = await realpath(positionals[0]);
  const mapping = values.points ? JSON.parse(await readFile(values.points, "utf8")) : CORE_POINTS;
  if (Object.keys(mapping).sort().join() !== Object.keys(CORE_POINTS).sort().join())
    throw new Error("Punktkortet skal indeholde præcis P02, P06, P11, P14, P17 og P20.");
  const photos = [];
  // Validate all six before any database or storage mutation. Originals are never rewritten.
  for (const [point, file] of Object.entries(mapping)) {
    if (typeof file !== "string" || !/\.jpe?g$/i.test(file))
      throw new Error("Kun originale JPEG-fotos accepteres.");
    const resolved = await realpath(path.resolve(folder, file));
    const relative = path.relative(folder, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Fotostien skal ligge i originalmappen.");
    const bytes = await readFile(resolved);
    if (bytes.length > 32 * 1024 * 1024)
      throw new Error("En original overstiger systemets 32 MB-grænse.");
    const metadata = await parse(bytes, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      reviveValues: false,
    });
    const verified = validateSeedMetadata(metadata, jpegDimensions(bytes));
    photos.push({
      point,
      file: path.basename(file),
      resolved,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...verified,
    });
  }
  if (new Set(photos.map((p) => p.sha256)).size !== 6)
    throw new Error("De seks gentagelsespunkter skal have seks forskellige originaler.");
  const receipt = {
    schema: "freyra.haderslev-seed/v1",
    name: CASE_NAME,
    flightDate: FLIGHT_DATE,
    applied: false,
    photos: photos.map(({ point, file, sha256, width, height }) => ({
      point,
      file,
      sha256,
      width,
      height,
    })),
    next: "Servervalider originalerne i Undersøgelse. Bekræft sted/dato, hent kilder, gennemgå punkterne og gem rapporten.",
  };
  if (values.apply) {
    if (!values.org || !/^[0-9a-f-]{36}$/i.test(values.org))
      throw new Error("--org skal være arbejdspladsens UUID.");
    const url = process.env.SUPABASE_URL;
    assertStagingTarget(url, process.env.HADERSLEV_STAGING_PROJECT_REF);
    const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = await check(
      await client.auth.signInWithPassword({
        email: process.env.HADERSLEV_OPERATOR_EMAIL,
        password: process.env.HADERSLEV_OPERATOR_PASSWORD,
      }),
      "Login",
    );
    try {
      const projectId = stableUuid(`haderslev-demo-2710:${values.org}`);
      const existing = await check(
        await client
          .from("projects")
          .select("id,name,organization_id")
          .eq("id", projectId)
          .maybeSingle(),
        "Læs sag",
      );
      if (existing && (existing.name !== CASE_NAME || existing.organization_id !== values.org))
        throw new Error("Den eksisterende sag matcher ikke seed-kontrakten.");
      if (!existing)
        await check(
          await client.from("projects").insert({
            id: projectId,
            organization_id: values.org,
            name: CASE_NAME,
            slug: `bykaer-haderslev-2710-${projectId.slice(0, 8)}`,
            project_type: "Naturgenopretning",
            status: "Aktiv",
            location_name: "Bykær Bæk",
            municipality: "Haderslev",
            country: "Danmark",
            start_date: FLIGHT_DATE,
            description:
              "Baseline fra DJI FC3411-flyvningen 24.08.2026. Kernepunkter P02, P06, P11, P14, P17 og P20. Faglig validering og godkendte A–E-grænser registreres særskilt.",
          }),
          "Opret sag",
        );
      receipt.projectId = projectId;
      for (const photo of photos) {
        const rows = await check(
          await client.rpc("create_upload_intent", {
            p_project_id: projectId,
            p_original_file_name: photo.file,
            p_mime_type: "image/jpeg",
            p_file_size: photo.bytes.length,
            p_client_request_id: stableUuid(
              `${projectId}:${auth.user.id}:${photo.point}:${photo.sha256}`,
            ),
            p_upload_type: "drone_photo",
            p_user_metadata: {
              haderslevPoint: photo.point,
              flightDate: FLIGHT_DATE,
              seedSha256: photo.sha256,
              seedVersion: "2710/v1",
            },
          }),
          "Opret originalhenvisning",
        );
        const intent = rows?.[0];
        if (!intent?.upload_id || !intent?.storage_path)
          throw new Error("Uploadhenvisningen mangler.");
        const row = await check(
          await client.from("uploads").select("received_at").eq("id", intent.upload_id).single(),
          "Kontrollér modtagelse",
        );
        if (!row.received_at) {
          const prior = await client.storage
            .from("monitoring-uploads")
            .download(intent.storage_path);
          if (!prior.error && prior.data) {
            const hash = createHash("sha256")
              .update(Buffer.from(await prior.data.arrayBuffer()))
              .digest("hex");
            if (hash !== photo.sha256)
              throw new Error("En eksisterende upload har en anden SHA-256. Den overskrives ikke.");
          } else {
            // Never overwrite an original. A lost response is recovered by the hash read on the next run.
            await check(
              await client.storage
                .from("monitoring-uploads")
                .upload(intent.storage_path, photo.bytes, {
                  contentType: "image/jpeg",
                  upsert: false,
                }),
              "Upload original",
            );
          }
          await check(
            await client.rpc("finalize_upload_intent", { p_upload_id: intent.upload_id }),
            "Bekræft modtagelse",
          );
        }
        const downloaded = await check(
          await client.storage.from("monitoring-uploads").download(intent.storage_path),
          "Genlæs original",
        );
        if (
          createHash("sha256")
            .update(Buffer.from(await downloaded.arrayBuffer()))
            .digest("hex") !== photo.sha256
        )
          throw new Error("Originalens SHA-256 stemmer ikke efter upload.");
        receipt.photos.find((p) => p.point === photo.point).uploadId = intent.upload_id;
      }
      receipt.applied = true;
    } finally {
      await client.auth.signOut();
    }
  }
  await mkdir(path.dirname(values.output), { recursive: true });
  await writeFile(values.output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(
    `${values.apply ? "Sag og seks originaler er verificeret" : "Seks originaler kontrolleret lokalt; intet uploadet"}. Kvittering gemt i den valgte outputfil.`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed kunne ikke gennemføres.");
  process.exitCode = 1;
});
