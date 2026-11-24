import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fixture, login } from "./disposable-local-fixture";
import { syntheticPhoto } from "./synthetic-photo";
import { readZip } from "./read-zip";

async function myJob(page: Page, actionId: string) {
  await page.goto(`/opgaver?job=${encodeURIComponent(actionId)}`);
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Syntetisk dokumentationsjob", exact: true }),
  });
  await expect(card).toBeVisible();
  return card;
}

test("employee completes a documented job from the map and a separate manager reviews its report", async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000);
  const data = await fixture();
  const workDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(
    new Date(),
  );
  const { actionId, projectId, cardIds } = data.workflow;
  const photo = syntheticPhoto();
  const sha256 = createHash("sha256").update(photo).digest("hex");
  const worker = createClient(data.api.url, data.api.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await worker.auth.signInWithPassword({
    email: data.field.email,
    password: data.field.password,
  });
  if (signedIn.error) throw new Error("Synthetic worker API login failed.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: photo }),
  );
  await login(page, data.field, data.organization);
  await page.goto("/opgaver");
  await page.getByRole("button", { name: "Kort", exact: true }).click();
  const map = page.getByRole("region", { name: "Kort over mine opgaver", exact: true });
  await expect(map).toContainText("2 af 2 indlæste opgaver har kortposition");
  await expect(map).not.toContainText("Syntetisk opgave A");
  await map
    .getByRole("button", { name: "Åbn opgave: Syntetisk jobstart", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Syntetisk jobstart", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Tilbage til opgavekortet", exact: true }).click();
  await expect(map).toContainText("2 af 2 indlæste opgaver har kortposition");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await mkdir("tmp/planning-e2e/screens", { recursive: true });
  await page.screenshot({ path: "tmp/planning-e2e/screens/employee-map.png", fullPage: false });
  await map
    .getByRole("button", { name: "Åbn opgave: Syntetisk dokumentationsjob", exact: true })
    .click();
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Syntetisk dokumentationsjob", exact: true }),
  });
  try {
    await expect(map).toBeHidden();
    await expect(card).toBeVisible();
  } catch (failure) {
    // This suite uses only the disposable synthetic account. Keep screenshots private,
    // while reporting enough application state to distinguish a runtime error from a locator.
    throw new Error(
      JSON.stringify({
        step: "map-marker-to-job",
        pageErrors: errors,
        mapVisible: await map.isVisible(),
        headings: await page.getByRole("heading").allTextContents(),
        alerts: await page.getByRole("alert").allTextContents(),
      }),
      { cause: failure },
    );
  }
  expect(errors).toEqual([]);
  await expect(
    card.getByRole("link", { name: /Vejvisning til Syntetisk arbejdssted 2/ }),
  ).toHaveAttribute("href", /destination=56\.11.*9\.41/);
  await card.getByRole("button", { name: "Gå til status og logbog", exact: true }).click();
  let status = card.getByRole("region", { name: "Operationel status og logbog", exact: true });
  await status.getByRole("button", { name: "Registrer start", exact: true }).click();
  await status.getByRole("button", { name: "Indsæt tidspunkt nu", exact: true }).click();
  await expect(status.getByLabel("Kilde til starttidspunkt", { exact: true })).not.toHaveValue("");
  await status.getByRole("button", { name: "Gem statusversion", exact: true }).click();
  await expect(status).toContainText("Status: Påbegyndt · version 4");
  console.info("workflow checkpoint: map, keyboard, pointer and server start passed");

  await card.getByRole("link", { name: "Fotos og jobkort på opgaven", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/felt\\?.*task=${actionId}`));
  await page.getByRole("button", { name: "Klargør sagen til offlinebrug", exact: true }).click();
  const photos = page.getByRole("region", { name: "Feltfotos på telefonen", exact: true });
  const jobs = page.getByRole("region", { name: "Jobkort på telefonen", exact: true });
  await expect(photos.getByRole("radio", { name: /Opgaven:/ })).toBeChecked();
  await photos
    .getByLabel("Tag originalfoto til feltkøen", { exact: true })
    .setInputFiles({ name: "syntetisk-arbejdsfoto.png", mimeType: "image/png", buffer: photo });
  await expect(photos.getByRole("status")).toContainText("1 af 1 originaler er gemt på telefonen.");
  console.info("workflow checkpoint: original photo saved locally");
  const selector = jobs.getByLabel("Jobkort i opgavepakken", { exact: true });
  await selector.selectOption(cardIds[0]);
  await jobs
    .getByLabel(/Forhold på stedet.*nødvendigt/)
    .fill("Syntetisk registrering af arbejdsstedets forhold");
  await jobs.getByRole("combobox", { name: /^Status/ }).selectOption("recorded");
  await jobs
    .getByLabel("Begrundelse for registreringen", { exact: true })
    .fill("Syntetisk stedkontrol med originalfoto");
  await jobs.getByRole("button", { name: "Gem registrering på telefonen", exact: true }).click();
  await selector.selectOption(cardIds[1]);
  await jobs.getByLabel(/Antal.*nødvendigt/).fill("0");
  await jobs.getByLabel(/Kontrolleret.*nødvendigt/).selectOption("false");
  await jobs.getByRole("combobox", { name: /^Status/ }).selectOption("recorded");
  await jobs
    .getByLabel("Begrundelse for registreringen", { exact: true })
    .fill("Syntetisk afslutningskontrol med nul og falsk");
  await jobs.getByRole("button", { name: "Gem registrering på telefonen", exact: true }).click();

  await expect
    .poll(
      async () => {
        const response = await worker
          .from("field_photo_uploads")
          .select("id,received_at")
          .eq("project_id", projectId)
          .eq("captured_action_id", actionId);
        if (response.error) throw new Error("Synthetic original lookup failed.");
        return response.data.filter((row) => row.received_at !== null).length;
      },
      { timeout: 90_000 },
    )
    .toBe(1);
  const uploaded = await worker
    .from("field_photo_uploads")
    .select("id")
    .eq("project_id", projectId)
    .eq("captured_action_id", actionId)
    .single();
  if (uploaded.error) throw new Error("Synthetic original identity missing.");
  const uploadId = uploaded.data.id;
  await expect
    .poll(
      async () => {
        const response = await worker
          .from("field_photo_receipts")
          .select("status,sha256")
          .eq("upload_id", uploadId)
          .maybeSingle();
        if (response.error) throw new Error("Synthetic original receipt unavailable.");
        return response.data;
      },
      { timeout: 90_000 },
    )
    .toMatchObject({ status: "verified", sha256 });
  await expect
    .poll(async () => {
      const result = await worker
        .from("field_job_versions")
        .select("id")
        .eq("project_id", projectId)
        .eq("action_id", actionId);
      if (result.error) throw new Error("Synthetic job cards unavailable.");
      return result.data.length;
    })
    .toBe(2);
  const records = await worker
    .from("field_job_versions")
    .select("id,values")
    .eq("project_id", projectId)
    .eq("action_id", actionId);
  if (records.error) throw new Error("Synthetic job card identities unavailable.");
  expect(records.data.some((row) => row.values.count === 0 && row.values.checked === false)).toBe(
    true,
  );

  let task = await myJob(page, actionId);
  await task
    .locator("summary")
    .filter({ hasText: /^Dokumentation$/ })
    .click();
  const originalPopup = page.waitForEvent("popup");
  await task.getByRole("button", { name: /^Åbn optaget original:/ }).click();
  const original = await originalPopup;
  await original.waitForURL(
    (url) => url.origin === data.api.url && url.pathname.startsWith("/storage/v1/object/sign/"),
  );
  const downloadedOriginal = new Uint8Array(
    await (await fetch(original.url(), { redirect: "error" })).arrayBuffer(),
  );
  expect(createHash("sha256").update(downloadedOriginal).digest("hex")).toBe(sha256);
  await original.close();
  await task
    .locator("summary")
    .filter({ hasText: /^Registrér arbejdstid$/ })
    .click();
  const time = task.getByRole("region", { name: "Mine registrerede timer", exact: true });
  await time.getByLabel("Dato for arbejdet", { exact: true }).fill(workDate);
  await time.getByRole("button", { name: "Registrér tid", exact: true }).click();
  await time.getByLabel("Arbejdstid i minutter", { exact: true }).fill("45");
  await time.getByRole("button", { name: "Gem tid", exact: true }).click();
  await expect(time).toContainText("45 min. · Version 1");
  await expect(time).toContainText("Afventer godkendelse");
  await task
    .locator("summary")
    .filter({ hasText: /^Registrér materialeforbrug$/ })
    .click();
  const materials = task.getByRole("region", { name: "Materialeforbrug", exact: true });
  await materials.getByRole("button", { name: "Registrér materiale", exact: true }).click();
  await materials.getByLabel("Materiale", { exact: true }).fill("Syntetiske markeringspæle");
  await materials.getByLabel("Mængde", { exact: true }).fill("2");
  await materials.getByRole("button", { name: "Gem materiale", exact: true }).click();
  await expect(materials).toContainText("Syntetiske markeringspæle");
  await expect(
    materials.getByRole("button", { name: "Registrér materiale", exact: true }),
  ).toBeVisible();

  await task.getByRole("link", { name: "Registrér udført arbejde", exact: true }).click();
  const execution = page.getByRole("region", { name: "Faktisk udførelse", exact: true });
  await execution.getByRole("button", { name: "Åbn udførelsesregistrering", exact: true }).click();
  await execution.getByRole("combobox", { name: /^Registreringstype/ }).selectOption("synthetic");
  await execution.getByRole("combobox", { name: /^Status/ }).selectOption("performed");
  await execution.getByRole("combobox", { name: /^Indsats/ }).selectOption("other");
  await execution.getByLabel("Faktisk startdato", { exact: true }).fill(workDate);
  await execution
    .getByLabel("Faktisk metode – tomt felt betyder uafklaret", { exact: true })
    .fill("Syntetisk softwareprøve");
  await execution
    .getByLabel("Udført delstrækning og stedreference", { exact: true })
    .fill("Syntetisk arbejdssted 2");
  await execution
    .getByLabel("Arbejdslog, feltregistrering eller anden udførelseskilde", { exact: true })
    .fill("Syntetiske jobkort og originalfoto");
  await execution
    .getByRole("combobox", { name: /^Faktisk undersøgelsesdækning/ })
    .selectOption("limited");
  await execution
    .getByLabel("Faktisk dækning, metode og begrænsninger", { exact: true })
    .fill("Softwareprøve med fiktive data; ingen faktisk naturindsats");
  await execution.getByRole("button", { name: "Gem udførelsesversion", exact: true }).click();
  await expect(execution.getByText(/^Udførelsesregistrering gemt som version 1\./)).toBeVisible();
  const bound = await worker
    .from("work_order_execution_bindings")
    .select("workspace_entry_id")
    .eq("project_id", projectId)
    .eq("action_id", actionId)
    .single();
  if (bound.error) throw new Error("Synthetic execution binding missing.");
  task = await myJob(page, actionId);
  const visits = task.getByRole("region", { name: "Besøgsstatus", exact: true });
  await visits.getByRole("button", { name: "Registrér besøg", exact: true }).click();
  await visits.getByRole("combobox").selectOption("visited");
  await visits.getByRole("button", { name: "Gem besøg", exact: true }).click();
  await expect(visits).toContainText("Gennemført · Version 1");
  await task
    .locator("summary")
    .filter({ hasText: /^Dokumentation$/ })
    .click();
  const evidence = task.getByRole("region", { name: "Opgavens dokumentation", exact: true });
  for (const record of records.data) {
    await evidence.getByRole("button", { name: /^Knyt til registrering:/ }).click();
    await evidence
      .getByRole("combobox", { name: /^Gemt feltregistrering/ })
      .selectOption(record.id);
    await expect(evidence.getByRole("combobox", { name: /^Verificeret originalfoto/ })).toHaveValue(
      uploadId,
    );
    await evidence
      .getByRole("combobox", { name: /^Udført arbejde/ })
      .selectOption(bound.data.workspace_entry_id);
    await evidence
      .getByLabel("Begrundelse", { exact: true })
      .fill("Syntetisk registrering underbygget af originalfoto og udførelse");
    await evidence.getByRole("button", { name: "Gem dokumentation", exact: true }).click();
    await expect(evidence.getByRole("heading", { name: "Ny kobling", exact: true })).toHaveCount(0);
  }
  await task.getByRole("button", { name: "Gå til status og logbog", exact: true }).click();
  status = task.getByRole("region", { name: "Operationel status og logbog", exact: true });
  await status.getByRole("button", { name: "Bekræft udført", exact: true }).click();
  await status.getByRole("button", { name: "Gem statusversion", exact: true }).click();
  await expect(status).toContainText("Status: Udført · version 5");
  await task.getByRole("button", { name: "Gå til aflevering", exact: true }).click();
  await task
    .getByLabel("Bemærkning til afleveringen", { exact: true })
    .fill("Syntetisk prøve med to jobkort og originaldokumentation");
  await task.getByRole("button", { name: "Gem afleveringsversion", exact: true }).click();
  await expect(
    task.getByRole("heading", { name: "Afleveringsversion 1", exact: true }),
  ).toBeVisible();
  await task.getByRole("button", { name: "Aflevér til gennemgang", exact: true }).click();
  await task
    .getByLabel("Begrundelse for afleveringshandlingen", { exact: true })
    .fill("Syntetisk afleveringsgrundlag klar til uafhængig gennemgang");
  await task.getByRole("button", { name: "Gem afleveringshandling", exact: true }).click();
  await expect(task).toContainText("Afleveret");
  await expect(
    task.getByRole("button", { name: "Godkend denne aflevering", exact: true }),
  ).toHaveCount(0);

  const leaderContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const leader = await leaderContext.newPage();
    leader.on("pageerror", (error) => errors.push(error.message));
    await login(leader, data.manager, data.organization);
    await leader.goto(`/app/projects/${projectId}?tab=handlinger&task=${actionId}&work=submission`);
    await leader.getByRole("button", { name: "Godkend denne aflevering", exact: true }).click();
    await leader
      .getByLabel("Gennemgået omfang, resultat og eventuelle mangler", { exact: true })
      .fill(
        "Teknisk gennemgang af syntetiske data, originalhash og afleveringsversion; ingen faglig naturgodkendelse",
      );
    await leader.getByRole("button", { name: "Gem afleveringshandling", exact: true }).click();
    await expect
      .poll(async () => {
        const result = await worker.rpc("get_work_order_review_context", {
          p_action_id: actionId,
          p_project_id: projectId,
          p_organization_id: data.workflow.organizationId,
        });
        if (result.error) throw new Error("Synthetic review status unavailable.");
        return {
          status: result.data.state?.status,
          version: result.data.state?.version,
          actor: result.data.state?.created_by,
        };
      })
      .toEqual({ status: "approved", version: 7, actor: data.manager.id });
    await leader.reload();
    await leader
      .getByRole("button", { name: "Klargør rapportkladde for afleveringsversion 1", exact: true })
      .click();
    await leader.getByRole("link", { name: "Åbn den gemte rapport", exact: true }).click();
    await expect(leader).toHaveURL(/\/app\/reports\/preview\?/);
    await expect(
      leader.getByRole("status", { name: "Udførelsens datagrundlag", exact: true }),
    ).toContainText("Syntetiske prøvedata");
    const download = leader.waitForEvent("download");
    await leader.getByRole("button", { name: "PDF", exact: true }).click();
    const pdf = await download;
    const file = await pdf.path();
    if (!file) throw new Error("Synthetic report PDF was not downloaded.");
    const bytes = new Uint8Array(await readFile(file));
    const document = await getDocument({ data: bytes, useSystemFonts: false }).promise;
    let text = "";
    try {
      for (let index = 1; index <= document.numPages; index++) {
        const content = await (await document.getPage(index)).getTextContent();
        text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      }
    } finally {
      await document.destroy();
    }
    expect(text).toContain("Syntetisk dokumentationsjob");
    expect(text).toContain("Syntetisk stedkontrol");
    expect(text).toContain("Syntetisk afslutningskontrol");
    expect(text).toMatch(/Syntetiske prøvedata/i);
    expect(text.replace(/\s/g, "")).toContain(sha256);
    const zipReady = leader.waitForEvent("download");
    await leader
      .getByRole("button", { name: "Hent ZIP med verificerede originalfotos", exact: true })
      .click();
    const zip = await zipReady;
    const zipPath = await zip.path();
    if (!zipPath) throw new Error("Synthetic originals ZIP was not downloaded.");
    const originals = readZip(await readFile(zipPath));
    expect(
      [...originals.values()].some(
        (bytes) => createHash("sha256").update(bytes).digest("hex") === sha256,
      ),
    ).toBe(true);
    await mkdir("tmp/planning-e2e/screens", { recursive: true });
    await leader.screenshot({
      path: "tmp/planning-e2e/screens/workflow-report.png",
      fullPage: false,
    });
  } finally {
    await leaderContext.close();
  }
  await page.reload();
  await expect(page.getByRole("article")).toContainText("Godkendt");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await worker.auth.signOut({ scope: "local" });
});
