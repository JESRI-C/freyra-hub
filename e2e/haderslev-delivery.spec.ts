import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} mangler. Se README: Haderslev browserprøve.`);
  return value;
};

test("originalupload → offentlige data → gennemgang → PDF og ZIP", async ({
  page,
  baseURL,
}, testInfo) => {
  // Keep a credential-free checkpoint even if a local browser worker is interrupted.
  const checkpoint = async (stage: string) => {
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(
      testInfo.outputPath("last-stage.json"),
      JSON.stringify({ stage, at: new Date().toISOString() }),
    );
  };
  // Fail instead of silently skipping the acceptance test when configuration is missing.
  const email = required("HADERSLEV_OPERATOR_EMAIL"),
    password = required("HADERSLEV_OPERATOR_PASSWORD");
  const url = required("SUPABASE_URL"),
    key = required("SUPABASE_PUBLISHABLE_KEY");
  expect(new URL(url).hostname).toBe("xdvqdzdpyceojbdknofi.supabase.co");
  expect([
    "localhost",
    "127.0.0.1",
    "gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev",
  ]).toContain(new URL(baseURL!).hostname);
  const originals = required("HADERSLEV_ORIGINALS_DIR");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await client.auth.signInWithPassword({ email, password });
  expect(auth.error).toBeNull();
  const orgId = required("HADERSLEV_E2E_ORG_ID");
  const id = randomUUID(),
    slug = `haderslev-e2e-${id.slice(0, 8)}`;
  const created = await client.from("projects").insert({
    id,
    organization_id: orgId,
    name: `TEKNISK E2E – Bykær ${id.slice(0, 8)}`,
    slug,
    municipality: "Haderslev",
    start_date: "2026-08-24",
    description:
      "Isoleret browserprøve. Ingen faglig godkendelse; må ikke afleveres som kommunens sag.",
  });
  expect(created.error).toBeNull();
  await checkpoint("testcase_created");
  await page.addInitScript(
    ({ orgId, id }) =>
      localStorage.setItem("freyra-auth-selection-v1", JSON.stringify({ orgId, projectId: id })),
    { orgId, id },
  );
  await page.goto(`/login?next=${encodeURIComponent(`/app/projects/${slug}`)}`);
  await checkpoint("login_email");
  await page.locator('input[type="email"]').fill(email);
  await checkpoint("login_password");
  await page.locator('input[type="password"]').fill(password);
  await checkpoint("login_submit");
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await checkpoint("login_navigation");
  await expect(page.getByRole("navigation", { name: "Sagens fem trin" })).toBeVisible();
  await checkpoint("upload_original");
  await expect(page.getByText("Finansiering og effekt", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Tilføj dronebilleder", exact: true }).click();
  await page
    .locator('input[type="file"][multiple]')
    .setInputFiles(path.join(originals, "DJI_0040.JPG"));
  const upload = page.getByRole("button", { name: "Upload valgte billeder", exact: true });
  await expect(upload).toBeEnabled();
  await upload.click();
  await expect(page.getByRole("button", { name: "Luk", exact: true })).toHaveCount(0, {
    timeout: 180_000,
  });
  await checkpoint("localization");
  await page
    .getByRole("navigation", { name: "Sagens fem trin" })
    .getByRole("button", { name: /Datagrundlag/ })
    .click();
  // The label also contains explanatory text about the date and its timezone.
  await expect(page.getByLabel(/^Optagedato/)).toHaveValue("2026-08-24");
  const watercourse = page.getByRole("combobox", { name: /^Vandløb/ });
  await expect(watercourse.locator("option")).not.toHaveCount(1);
  const candidates = await watercourse.locator("option").evaluateAll((options) =>
    options.map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: option.textContent ?? "",
    })),
  );
  const bykaer = candidates.filter((option) => /byk[æa]r/i.test(option.label));
  expect(
    bykaer.length,
    "En entydig officiel Bykær-reference kræves; testen gætter ikke en geometri.",
  ).toBe(1);
  await watercourse.selectOption(bykaer[0].value);
  const prepare = page.getByRole("button", {
    name: /^Bekræft sted.*hent data og tilknyt billeder$/,
  });
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await checkpoint("public_data_and_round");
  await expect(page).toHaveURL(/round=[0-9a-f-]{36}/, { timeout: 240_000 });
  const roundId = new URL(page.url()).searchParams.get("round");
  await checkpoint("manual_image_review_in_demo");
  // The municipal release explicitly withholds unstable image automation. Wait
  // for real photo binding, then prove this new case has made no AI attempts.
  await expect(
    page.getByText(
      "Automatisk billedvurdering er ikke frigivet til kommunal brug. Sammenhold originalfoto og offentlige kilder i Gennemgang.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/1 fotos er tilknyttet den gemte undersøgelse.*Gennemgang/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Fortsæt billedanalysen|Analyser de næste|Spring dette foto over og fortsæt/,
    }),
  ).toHaveCount(0);
  const assertNoAiAttempts = async () => {
    const inspections = await client
      .from("drone_image_inspections")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id);
    expect(inspections.error).toBeNull();
    expect(inspections.count, "DEMO_MODE must not start image-model attempts").toBe(0);
  };
  await assertNoAiAttempts();
  await testInfo.attach("billedvurdering-status", {
    body: JSON.stringify({
      status: "manual_review_in_demo",
      aiAttempts: 0,
    }),
    contentType: "application/json",
  });
  await checkpoint("photo_review");
  await page
    .getByRole("navigation", { name: "Sagens fem trin" })
    .getByRole("button", { name: /Gennemgang/ })
    .click();
  const review = page.getByRole("region", { name: "Verifikation pr. fotopunkt" });
  await expect(review.getByText("Originalt dronefoto", { exact: true })).toBeVisible();
  await expect(
    review.getByText(/Ingen gyldig gemt AI-vurdering.*Punktet kan gennemgås manuelt/),
  ).toBeVisible();
  await review.getByRole("button", { name: "Vis originalfoto", exact: true }).click();
  const originalPhoto = review.getByRole("img", { name: /Originalfoto/ });
  await expect(originalPhoto).toBeVisible();
  await expect
    .poll(() =>
      originalPhoto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await review
    .getByLabel("Navn og faglig rolle")
    .fill("Automatisk teknisk prøve – ingen faglig godkendelse");
  await review.getByRole("combobox", { name: "Beslutning", exact: true }).selectOption("rejected");
  await review
    .getByLabel("Begrundelse og manglende data")
    .fill(
      "Teknisk E2E-prøve. Afvist som faglig godkendelse; ingen person har valideret naturtilstanden i denne testsag.",
    );
  await review.getByRole("button", { name: "Gem faglig vurdering i revisionssporet" }).click();
  await expect(
    review.getByRole("status").filter({ hasText: "Faglig afvisning gemt" }),
  ).toBeVisible();
  await checkpoint("audit_and_planting");
  // Utility navigation must preserve the exact reviewed round.
  await page.getByRole("link", { name: "Revisionsspor", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`round=${roundId}`));
  await page.getByRole("button", { name: "Tilbage til sagsforløbet" }).click();
  await expect(review.getByText("Originalt dronefoto", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Sagens fem trin" })
    .getByRole("button", { name: /Beplantning/ })
    .click();
  await expect(page.getByText("Skitse – kræver faglig validering", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Sagens fem trin" })
    .getByRole("button", { name: /Rapport og aflevering/ })
    .click();
  const downloading = page.waitForEvent("download", { timeout: 180_000 });
  await checkpoint("report_and_zip");
  await page.getByRole("button", { name: "Dan rapport og hent afleveringspakke" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const target = testInfo.outputPath("afleveringspakke.zip");
  await download.saveAs(target);
  const zip = await readFile(target),
    entries = new Map<string, Buffer>();
  let at = 0;
  while (at + 30 <= zip.length && zip.readUInt32LE(at) === 0x04034b50) {
    expect(zip.readUInt16LE(at + 8)).toBe(0);
    const size = zip.readUInt32LE(at + 18),
      nameSize = zip.readUInt16LE(at + 26),
      extra = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + 30, at + 30 + nameSize).toString("utf8"),
      start = at + 30 + nameSize + extra;
    entries.set(name, zip.subarray(start, start + size));
    at = start + size;
  }
  expect(entries.get("rapport.pdf")?.subarray(0, 5).toString()).toBe("%PDF-");
  const manifest = JSON.parse(entries.get("manifest.json")!.toString());
  for (const file of manifest.files) {
    const bytes = entries.get(file.name);
    expect(bytes?.length).toBe(file.sizeBytes);
    expect(createHash("sha256").update(bytes!).digest("hex")).toBe(file.sha256);
  }
  const report = JSON.parse(entries.get("rapportgrundlag.json")!.toString());
  expect(report.manifest.photos).toHaveLength(1);
  expect(report.manifest.photos[0].inspections).toEqual([]);
  expect(report.manifest.projectId).toBe(id);
  expect(report.manifest.photoPointReviews).toHaveLength(1);
  expect(report.manifest.photoPointReviews[0].review.decision).toBe("rejected");
  expect(entries.has("faglig-fotogennemgang.json")).toBe(true);
  expect(entries.has("beplantningsskitse.json")).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Hent samlet PDF" })).toBeEnabled();
  await assertNoAiAttempts();
  await testInfo.attach("kontrol", {
    body: JSON.stringify({
      projectId: id,
      reportId: report.id,
      zipSha256: createHash("sha256").update(zip).digest("hex"),
      files: manifest.files.length,
    }),
    contentType: "application/json",
  });
  await client.auth.signOut({ scope: "local" });
  await checkpoint("completed");
});
