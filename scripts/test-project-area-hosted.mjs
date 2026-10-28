/** Staging-only project setup acceptance. Synthetic fixtures; no invites or mail. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { booleanPointInPolygon, point, bbox } from "@turf/turf";
const BASE = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const dir = "tmp/project-area-qa";
await fs.mkdir(dir, { recursive: true });
const env = Object.fromEntries(
  (await fs.readFile(".env.staging.local", "utf8"))
    .split(/\r?\n/)
    .filter((s) => /^[A-Z_]+=/.test(s))
    .map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i), s.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
assert.equal(env.SUPABASE_URL, "https://xdvqdzdpyceojbdknofi.supabase.co");
const admin = createClient(
  env.SUPABASE_URL,
  (await fs.readFile("tmp/private-release/staging-admin-key.private", "utf8")).trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const ok = (r, l) => {
  if (r.error) throw new Error(l + ": " + r.error.message);
  return r.data;
};
const receiptPath = dir + "/fixture.private.json";
let fixture;
try {
  fixture = JSON.parse(await fs.readFile(receiptPath, "utf8"));
} catch {
  const run = randomUUID().slice(0, 8);
  fixture = {
    run,
    orgId: randomUUID(),
    mediaId: randomUUID(),
    email: "area-" + run + "@freyra.invalid",
    password: randomBytes(32).toString("base64url"),
  };
  await fs.writeFile(receiptPath, JSON.stringify(fixture), { mode: 0o600 });
}
const save = () => fs.writeFile(receiptPath, JSON.stringify(fixture), { mode: 0o600 });
if (!fixture.userId) {
  fixture.userId = ok(
    await admin.auth.admin.createUser({
      email: fixture.email,
      password: fixture.password,
      email_confirm: true,
      user_metadata: { full_name: "SYNTHETIC project area" },
    }),
    "Create no-mail test account",
  ).user.id;
  await save();
}
ok(
  await admin.from("organizations").upsert({
    id: fixture.orgId,
    name: "TEKNISK OMRÅDE " + fixture.run,
    type: "test",
    country: "Denmark",
  }),
  "Fixture organization",
);
ok(
  await admin
    .from("organization_memberships")
    .upsert(
      { user_id: fixture.userId, organization_id: fixture.orgId, role: "owner" },
      { onConflict: "user_id,organization_id" },
    ),
  "Fixture role",
);
const expected = JSON.parse(
  await fs.readFile(
    process.env.FREYRA_BUILD_METADATA_FILE || ".output/public/freyra-build.json",
    "utf8",
  ),
);
const live = await (await fetch(BASE + "/freyra-build.json")).json();
assert.match(expected.sourceRevision, /^[a-f0-9]{40}$/);
assert.equal(live.sourceRevision, expected.sourceRevision);
const result = {
  schema: "freyra.project-area-acceptance/v1",
  sourceRevision: live.sourceRevision,
  checks: [],
  errors: [],
  syntheticOnly: true,
  noMail: true,
  customerAcceptance: false,
};
const pass = async (name) => {
  result.checks.push({ name, passed: true });
  console.log("PASS " + name);
  await fs.writeFile(dir + "/result.json", JSON.stringify(result, null, 2));
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript(
  ({ orgId, projectId }) =>
    localStorage.setItem("freyra-auth-selection-v1", JSON.stringify({ orgId, projectId })),
  { orgId: fixture.orgId, projectId: fixture.projectId ?? null },
);
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.on("pageerror", (e) => result.errors.push(e.message));
const geometryUrl = () => BASE + "/app/projects/geometry/" + fixture.projectId;
async function zoom(lat, lng) {
  await page.getByRole("combobox", { name: "Find sted" }).fill(`${lat}, ${lng}`);
  await page.getByRole("combobox", { name: "Find sted" }).press("Enter");
  await page.waitForTimeout(1200);
}
async function centerClick() {
  const map = page.locator(".leaflet-container");
  await map.scrollIntoViewIfNeeded();
  const b = await map.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
try {
  await page.goto(BASE + "/login");
  await page.locator("input[type=email]").fill(fixture.email);
  await page.locator("input[type=password]").fill(fixture.password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  if (!fixture.projectId) {
    const existing = ok(
      await admin
        .from("projects")
        .select("id")
        .eq("organization_id", fixture.orgId)
        .eq("name", "TEKNISK OMRÅDE " + fixture.run),
      "Find fixture project",
    );
    if (existing.length) fixture.projectId = existing[0].id;
    else {
      await page.goto(BASE + "/app/projects");
      await page.getByRole("button", { name: /Start en ny sag/ }).click();
      const d = page.getByRole("dialog", { name: "Opret ny sag" });
      await d.getByLabel(/Projektnavn/).fill("TEKNISK OMRÅDE " + fixture.run);
      await d.getByRole("button", { name: "Opret projekt", exact: true }).click();
      await page.waitForURL((u) => /\/app\/projects\/[a-f0-9-]+/.test(u.pathname));
      fixture.projectId = page.url().split("/").pop().split("?")[0];
    }
    await save();
  }
  assert.match(fixture.projectId, /^[a-f0-9-]{36}$/);
  const initial = ok(
    await admin
      .from("projects")
      .select("name,organization_id")
      .eq("id", fixture.projectId)
      .single(),
    "Check fixture scope",
  );
  assert.equal(initial.organization_id, fixture.orgId);
  assert.ok(initial.name.startsWith("TEKNISK OMRÅDE "));
  await pass("UI project creation with fresh password login and isolated technical organization");
  ok(
    await admin
      .from("projects")
      .update({
        geometry_polygon: null,
        geometry_area_ha: null,
        geometry_centroid_lat: null,
        geometry_centroid_lng: null,
        geometry_source: "none",
        project_type: "Naturgenopretning",
        location_name: null,
      })
      .eq("id", fixture.projectId),
    "Reset only technical fixture area",
  );
  ok(
    await admin
      .from("project_media")
      .update({ lat: null, lng: null })
      .eq("id", fixture.mediaId)
      .eq("project_id", fixture.projectId),
    "Reset only synthetic GPS fixture",
  );
  await page.goto(geometryUrl());
  await page.locator(".leaflet-container").waitFor();
  await page.getByText("Ingen brugbare billedpositioner registreret på projektet endnu.").waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("img.leaflet-tile")].some((e) => e.src.includes("/tile/6/")),
  );
  await pass("2: unsited project starts with Denmark overview rather than Samsø close-up");
  const input = page.getByRole("combobox", { name: "Find sted" });
  await input.fill("Bøg");
  await page.getByRole("listbox", { name: "Stedforslag" }).waitFor();
  assert.ok((await page.getByRole("option").count()) > 0);
  await input.fill("Stadion Allé 26, 8000 Aarhus C");
  const address = page.getByRole("option").filter({ hasText: "Stadion Allé 26" }).first();
  await address.waitFor();
  await address.click();
  await page
    .locator(".leaflet-popup")
    .getByText("Stadion Allé 26, 8000 Aarhus C", { exact: true })
    .waitFor();
  await page.waitForTimeout(800);
  assert.equal(await input.getAttribute("aria-expanded"), "false");
  await input.fill("Molslaboratoriet");
  const place = page.getByRole("option").filter({ hasText: "OpenStreetMap" }).first();
  await place.waitFor();
  await place.click();
  await page.locator(".leaflet-popup").last().waitFor();
  await pass(
    "1: live official address, partial search and attributed place-name selection move the map",
  );
  await zoom(56.226, 10.575);
  await page.getByRole("button", { name: "Vælg matrikel", exact: true }).click();
  await centerClick();
  await page.getByRole("button", { name: "Brug som projektgrænse", exact: true }).waitFor();
  await page.screenshot({ path: dir + "/parcel-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Brug som projektgrænse", exact: true }).click();
  await page
    .getByRole("button", { name: "Brug som projektgrænse", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Fortsæt til projekt", exact: true }).waitFor();
  const parcel = ok(
    await admin
      .from("projects")
      .select("geometry_polygon,geometry_source")
      .eq("id", fixture.projectId)
      .single(),
    "Read saved parcel",
  );
  assert.equal(parcel.geometry_source, "matrikel");
  assert.equal(parcel.geometry_polygon.type, "Polygon");
  await page.reload();
  await page
    .getByRole("button", { name: "Brug som projektgrænse", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Fortsæt til projekt", exact: true }).waitFor();
  await pass("3a: live cadastral pick is explicitly saved and survives reload");
  await page.getByRole("button", { name: "Vælg matrikel", exact: true }).click(); // enable pick solely to expose low-zoom status
  await page.getByRole("button", { name: "Vælg matrikel", exact: true }).click();
  const fieldUrl = new URL("https://geodata.fvm.dk/geoserver/ows");
  fieldUrl.search = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "Markblokke:Markblokke_2026",
    srsName: "urn:ogc:def:crs:OGC:1.3:CRS84",
    bbox: "10.55,56.21,10.60,56.25,urn:ogc:def:crs:OGC:1.3:CRS84",
    count: "8",
    outputFormat: "application/json",
  }).toString();
  const fields = await (await fetch(fieldUrl, { signal: AbortSignal.timeout(15000) })).json();
  assert.ok(fields.features?.length);
  let fieldLocation;
  for (const f of fields.features) {
    const [w, s, e, n] = bbox(f);
    for (let x = 1; x < 10 && !fieldLocation; x++)
      for (let y = 1; y < 10 && !fieldLocation; y++) {
        const p = [w + ((e - w) * x) / 10, s + ((n - s) * y) / 10];
        if (booleanPointInPolygon(point(p), f, { ignoreBoundary: true })) fieldLocation = p;
      }
    if (fieldLocation) break;
  }
  assert.ok(fieldLocation);
  await zoom(fieldLocation[1], fieldLocation[0]);
  await page.getByRole("button", { name: "Vælg markblok", exact: true }).click();
  await centerClick();
  await page.getByRole("button", { name: "Brug som projektgrænse", exact: true }).waitFor();
  await page.getByRole("button", { name: "Brug som projektgrænse", exact: true }).click();
  await page
    .getByRole("button", { name: "Brug som projektgrænse", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Fortsæt til projekt", exact: true }).waitFor();
  const block = ok(
    await admin
      .from("projects")
      .select("geometry_polygon,geometry_source")
      .eq("id", fixture.projectId)
      .single(),
    "Read saved field block",
  );
  assert.equal(block.geometry_source, "markblok");
  await pass("3b: live 2026 field-block pick saves actual containing polygon");
  for (const name of ["Matrikelskel", "Markblokke", "§3 Beskyttet natur", "Kulstof 2022"]) {
    const cb = page.getByRole("checkbox", { name: new RegExp(name) });
    if (!(await cb.isChecked())) await cb.check();
  }
  await page.getByText("Matrikler hentet fra Datafordeleren.", { exact: true }).waitFor();
  await page
    .getByText(/Kulstof2022 hentet|Ingen registrerede kulstofflader|Kulstofudsnittet er delvist/)
    .waitFor();
  await page
    .getByText("Kortlag hentet. Indhold afhænger af sted og zoom.", { exact: true })
    .first()
    .waitFor();
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll("img.leaflet-tile"));
    return ["geodata.fvm.dk", "arealeditering-dist-geo.miljoeportal.dk"].every((host) =>
      images.some((image) => image.src.includes(host) && image.complete && image.naturalWidth > 0),
    );
  });
  assert.ok(
    await page
      .locator("img.leaflet-tile")
      .evaluateAll((imgs) =>
        imgs.some((i) => i.src.includes("geodata.fvm.dk") && i.complete && i.naturalWidth > 0),
      ),
  );
  assert.ok(
    await page
      .locator("img.leaflet-tile")
      .evaluateAll((imgs) =>
        imgs.some(
          (i) =>
            i.src.includes("arealeditering-dist-geo.miljoeportal.dk") &&
            i.complete &&
            i.naturalWidth > 0,
        ),
      ),
  );
  await page.getByRole("button", { name: /Matrikler.*areal ikke opgjort/ }).waitFor();
  result.lowlandVisiblePolygons = await page.locator('path[stroke="#b45309"]').count();
  assert.ok(result.lowlandVisiblePolygons > 0, "Actual lowland reference polygons rendered");
  await page.getByRole("combobox", { name: "Find sted" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + "/layers-desktop.png", fullPage: true });
  await pass("4: real field/nature tile images and cadastral/lowland vector statuses render");
  const water = page
    .locator("details")
    .filter({ has: page.locator("summary").getByText("4 · Vandløb (valgfrit)", { exact: true }) });
  assert.equal(await water.getAttribute("open"), null);
  await water.locator("summary").click();
  await page.getByRole("textbox", { name: "Vandløbsnavn" }).waitFor();
  await water.locator("summary").click();
  const beforePhotos = ok(
    await admin.from("projects").select("geometry_polygon").eq("id", fixture.projectId).single(),
    "Current boundary",
  );
  const pixels = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const context = canvas.getContext("2d");
    context.fillStyle = "#2563eb";
    context.fillRect(0, 0, 4, 4);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const pixelBytes = Buffer.from(pixels, "base64");
  const pixelPath = fixture.projectId + "/synthetic-gps-" + fixture.mediaId + ".png";
  ok(
    await admin.storage
      .from("project-media")
      .upload(pixelPath, pixelBytes, { upsert: true, contentType: "image/png" }),
    "Synthetic pixel storage fixture",
  );
  ok(
    await admin.from("project_media").upsert({
      id: fixture.mediaId,
      project_id: fixture.projectId,
      title: "SYNTHETIC GPS location hint",
      category: "field_photo",
      source: "field_upload",
      file_path: pixelPath,
      storage_bucket: "project-media",
      mime_type: "image/png",
      url: "",
      lat: 56.23,
      lng: 10.58,
      metadata: {
        synthetic: true,
        fixture: "project-area",
        original_sha256: createHash("sha256").update(pixelBytes).digest("hex"),
      },
    }),
    "Synthetic GPS metadata fixture",
  );
  await page.reload();
  await page.getByRole("button", { name: "Vis 1 billedpositioner", exact: true }).click();
  await page.locator('path[stroke="#2563eb"]').first().waitFor();
  assert.deepEqual(
    ok(
      await admin.from("projects").select("geometry_polygon").eq("id", fixture.projectId).single(),
      "Check boundary after photo positioning",
    ).geometry_polygon,
    beforePhotos.geometry_polygon,
  );
  await pass("6: project photo GPS guides view without changing the saved boundary");
  ok(
    await admin
      .from("projects")
      .update({ project_type: "Vandløbsmonitorering" })
      .eq("id", fixture.projectId),
    "Technical task type",
  );
  await page.reload();
  await page.getByRole("textbox", { name: "Vandløbsnavn" }).waitFor();
  await pass("5: watercourse remains optional for nature tasks and expands for watercourse tasks");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Find sted" }).waitFor();
  await page.getByRole("button", { name: "Vis 1 billedpositioner", exact: true }).waitFor();
  await page.waitForTimeout(1000);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  await page.screenshot({ path: dir + "/mobile.png", fullPage: true });
  const mobileMap = page.locator(".leaflet-container");
  await mobileMap.scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".leaflet-tile-pane img")).some(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.waitForTimeout(500);
  const bounds = await mobileMap.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391);
  await page.screenshot({ path: dir + "/mobile-map.png" });
  const topography = await page
    .getByRole("button", { name: "Topografi", exact: true })
    .boundingBox();
  assert.ok(
    topography &&
      topography.x >= bounds.x &&
      topography.x + topography.width <= bounds.x + bounds.width + 1,
    "All mobile background controls fit",
  );
  const freshContext = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { width: 390, height: 844 },
  });
  const freshPage = await freshContext.newPage();
  freshPage.setDefaultTimeout(45000);
  freshPage.on("pageerror", (error) => result.errors.push(error.message));
  await freshPage.goto(geometryUrl());
  await freshPage.getByRole("button", { name: "Vis 1 billedpositioner", exact: true }).waitFor();
  await freshPage.locator(".leaflet-container").scrollIntoViewIfNeeded();
  await freshPage.waitForFunction(() =>
    Array.from(document.querySelectorAll(".leaflet-tile-pane img")).some(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  const freshBounds = await freshPage.locator(".leaflet-container").boundingBox();
  const freshTopography = await freshPage
    .getByRole("button", { name: "Topografi", exact: true })
    .boundingBox();
  assert.ok(
    freshBounds &&
      freshTopography &&
      freshTopography.x >= freshBounds.x &&
      freshTopography.x + freshTopography.width <= freshBounds.x + freshBounds.width + 1,
    "Fresh mobile controls fit",
  );
  await freshPage.screenshot({ path: dir + "/fresh-mobile.png" });
  await freshContext.close();
  await pass(
    "fresh and resized mobile maps load real tiles and retain every background control without overflow",
  );
  assert.deepEqual(result.errors, []);
  result.passed = true;
} catch (e) {
  result.passed = false;
  result.failure = e.message;
  await page.screenshot({ path: dir + "/failure.private.png", fullPage: true }).catch(() => {});
  await fs.writeFile(
    dir + "/failure.private.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await fs.writeFile(dir + "/result.json", JSON.stringify(result, null, 2));
  await browser.close();
}
