// Read-only staging presentation sweep. No business data, files, configuration or providers are written.
// Project-dependent domain pages without an accessible fixture are explicitly marked selectionOnly.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
assert(
  base.startsWith("http://127.0.0.1:") ||
    base === "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev",
);
const dir = "tmp/display-audit";
await fs.mkdir(dir, { recursive: true });
const inventory = JSON.parse(
  await fs.readFile("docs/program-map/inventory-2026-11-02.json", "utf8"),
);
const credentials = JSON.parse(
  await fs.readFile("tmp/private-release/jesper-test-short-login.private.json", "utf8"),
);
const fixture = JSON.parse(await fs.readFile("tmp/review-hosted/fixture.private.json", "utf8"));
const env = loadEnv("staging", process.cwd(), "");
assert.equal(credentials.url, env.SUPABASE_URL);
assert.equal(env.SUPABASE_URL, "https://xdvqdzdpyceojbdknofi.supabase.co");
const sdk = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const auth = await sdk.auth.signInWithPassword({
  email: credentials.email,
  password: credentials.password,
});
assert(!auth.error);
assert.equal(auth.data.user.id, credentials.userId);
const projects = await sdk
  .from("projects")
  .select("id,name,project_type")
  .eq("organization_id", fixture.organizationId);
assert(!projects.error);
const lavbund = await sdk
  .from("lavbund_projekter")
  .select("id,linked_project_id")
  .in(
    "linked_project_id",
    projects.data.map((p) => p.id),
  );
assert(!lavbund.error);
await fs.writeFile(dir + "/projects.private.json", JSON.stringify(projects.data, null, 2));
const meta = await fetch(base + "/freyra-build.json").then((r) => r.json());
assert(process.env.FREYRA_TEST_REVISION, "Set the exact expected staging source revision.");
assert.equal(meta.sourceRevision, process.env.FREYRA_TEST_REVISION);
const result = {
  schema: "freyra.display-audit/v1",
  sourceRevision: meta.sourceRevision,
  syntheticProject: fixture.projectId,
  readOnly: true,
  items: [],
  catalog: null,
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  storageState: "tmp/samling-hosted/operator-storage.private.json",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
let errors = [],
  failedResponses = [];
page.on("pageerror", (e) => errors.push(e.message.replace(/https:\/\/\S+/g, "[URL]")));
page.on("response", (r) => {
  if (r.status() >= 400 && new URL(r.url()).origin === base)
    failedResponses.push({ status: r.status(), path: new URL(r.url()).pathname });
});
const taskUrl = `/app/projects/${fixture.projectId}?tab=handlinger&task=${fixture.actionId}&work=submission`;
try {
  await page.goto(base + taskUrl);
  await Promise.race([
    page.getByRole("heading", { name: "Arbejdsopgaver", exact: true }).waitFor(),
    page.getByPlaceholder("dig@firma.dk", { exact: true }).waitFor(),
  ]);
  if (await page.getByPlaceholder("dig@firma.dk", { exact: true }).isVisible()) {
    await page.getByPlaceholder("dig@firma.dk", { exact: true }).fill(credentials.email);
    await page.getByPlaceholder("••••••••", { exact: true }).fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname != "/login");
    await page.goto(base + taskUrl);
  }
  await page
    .getByRole("region", { name: "Aflevering og faglig gennemgang", exact: true })
    .waitFor();
  await page.goto(base + "/app/program");
  await page.getByRole("heading", { name: "Programoverblik", exact: true }).waitFor();
  const search = page.getByLabel("Søg i programmet", { exact: true });
  await search.fill(" ");
  await page.getByLabel("Vis funktioner", { exact: true }).selectOption("existing");
  const existingCount = await page.locator("main article").count();
  await page.getByLabel("Vis funktioner", { exact: true }).selectOption("all");
  await search.fill("a");
  await search.fill("");
  // Open all catalogue groups before checking their real links and statuses.
  await page.locator("main details").evaluateAll((nodes) => nodes.forEach((n) => (n.open = true)));
  const catalog = await page.locator("main article").evaluateAll((nodes) =>
    nodes.map((n) => ({
      title: n.querySelector("h3,h4,h2")?.textContent?.trim(),
      text: n.innerText,
      links: [...n.querySelectorAll("a")].map((a) => ({
        text: a.textContent,
        href: a.getAttribute("href"),
      })),
    })),
  );
  result.catalog = { count: catalog.length, existingCount, items: catalog };
  await fs.writeFile(dir + "/catalog.private.json", JSON.stringify(result.catalog, null, 2));
  await context.storageState({ path: dir + "/operator-storage.private.json" });
  const checks = inventory.features.filter((f) => f.destination && f.status !== "planned");
  const selected = process.env.FREYRA_AUDIT_IDS?.split("|");
  for (const [i, f] of checks.entries()) {
    if (selected && !selected.includes(f.id)) continue;
    errors = [];
    failedResponses = [];
    const d = f.destination;
    let path,
      selectionOnly = false;
    if (d.kind === "route") {
      path = d.path;
      if (path.includes("$")) {
        const type = path.includes("/lavbund/")
          ? "lavbund"
          : path.includes("/construction/")
            ? "construction"
            : "nature";
        const project =
          type === "nature"
            ? { id: fixture.projectId }
            : type === "lavbund"
              ? lavbund.data[0]
              : projects.data.find(
                  (p) =>
                    ["Parkering", "Erhvervsbyggeri", "Boligbyggeri"].includes(p.project_type) &&
                    /test|prøve|example/i.test(p.name),
                );
        if (project) path = path.replace(/\$[a-zA-Z]+/g, project.id);
        else {
          path = d.selectAt;
          selectionOnly = true;
        }
      }
      if (path === "/felt") path += `?projectId=${fixture.projectId}`;
    } else {
      const q = new URLSearchParams({
        [d.view.kind]: d.view.id,
        task: fixture.actionId,
        ...(d.work ? { work: d.work } : {}),
      });
      path = `/app/projects/${fixture.projectId}?${q}`;
    }
    const item = {
      id: f.id,
      title: f.title,
      path,
      selectionOnly,
      viewports: [],
      errors: [],
      failedResponses: [],
    };
    try {
      const response = await page.goto(base + path, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      item.httpStatus = response?.status();
      const guide =
        f.id === "tab:overblik" || f.id === "/app/projects/$slug"
          ? page.getByRole("heading", {
              name: "Fra naturproblem til dokumenteret indsats",
              exact: true,
            })
          : f.id === "planned:review"
            ? page.getByRole("region", { name: "Aflevering og faglig gennemgang", exact: true })
            : page
                .getByRole("region", { name: "Formål og resultat", exact: true })
                .filter({ hasText: f.question });
      if (!selectionOnly) await guide.first().waitFor({ timeout: 12000 });
      else await page.locator("#workspace-content").waitFor();
      // Wait for short read requests, then capture slow/failed reads explicitly rather than hiding them.
      await page.waitForLoadState("networkidle", { timeout: 3500 }).catch(() => {});
      const filename =
        String(i).padStart(3, "0") +
        "-" +
        f.title
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-");
      item.screenshotPrefix = filename;
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const metrics = await page.evaluate(() => {
          const visible = (e) => {
            const s = getComputedStyle(e),
              r = e.getBoundingClientRect();
            return (
              s.display !== "none" &&
              s.visibility !== "hidden" &&
              r.width > 0 &&
              r.height > 0 &&
              !e.closest("[hidden]")
            );
          };
          const root = document.documentElement;
          const overflow = [...document.querySelectorAll("body *")]
            .filter(
              (e) =>
                visible(e) &&
                e.getBoundingClientRect().right > innerWidth + 2 &&
                getComputedStyle(e).position !== "fixed",
            )
            .slice(0, 12)
            .map((e) => ({
              tag: e.tagName,
              cls: e.className?.toString().slice(0, 180),
              text: e.textContent?.trim().slice(0, 90),
              right: Math.round(e.getBoundingClientRect().right),
            }));
          return {
            width: innerWidth,
            scrollWidth: root.scrollWidth,
            bodyLength: document.body.innerText.length,
            headings: [...document.querySelectorAll("h1,h2,h3")]
              .filter(visible)
              .map((e) => e.innerText)
              .slice(0, 14),
            activeMenu: [
              ...document.querySelectorAll("nav[aria-label=Hovedmenu] [aria-current=page]"),
            ]
              .filter(visible)
              .map((e) => e.innerText),
            alerts: [...document.querySelectorAll('[role="alert"]')]
              .filter(visible)
              .map((e) => e.innerText),
            brokenImages: [...document.images]
              .filter((e) => visible(e) && e.complete && e.naturalWidth === 0)
              .map((e) => e.alt),
            overflow,
          };
        });
        item.viewports.push(metrics);
        for (const name of [
          "Nyt lavbundsprojekt",
          "Ny datakilde",
          "Ny alarmregel",
          "Ny kvalitetsregel",
          "Kør alarmregler nu",
          "Kør regler nu",
        ]) {
          for (const control of await page.getByRole("button", { name, exact: true }).all()) {
            if (!(await control.isVisible())) continue;
            const box = await control.boundingBox();
            assert(
              box && box.x >= -1 && box.x + box.width <= width + 1,
              `${name} is clipped at ${width}px`,
            );
          }
        }
        await page.screenshot({
          path: `${dir}/${filename}-${width}.png`,
          fullPage: true,
          timeout: 20000,
        });
      }
      item.guideVisible = selectionOnly ? null : await guide.first().isVisible();
      item.actualPath = new URL(page.url()).pathname;
      const text = await page.locator("body").innerText();
      if (f.id === "/app/decisions/notes")
        assert(!text.includes('"schema"'), "Structured records are rendered as raw JSON");
      await fs.writeFile(`${dir}/${filename}.private.txt`, text);
      item.states = text
        .split("\n")
        .filter((t) =>
          /fejl|kunne ikke|mangler|ingen |ikke fundet|adgang|indlæser|henter|vælg et|coming soon/i.test(
            t,
          ),
        )
        .slice(-14);
    } catch (e) {
      item.error = e.message.replace(/https:\/\/\S+/g, "[URL]").slice(0, 700);
      await fs.writeFile(
        `${dir}/failure-${i}.private.txt`,
        await page
          .locator("body")
          .innerText()
          .catch(() => ""),
      );
      await page.screenshot({ path: `${dir}/failure-${i}.png`, fullPage: false }).catch(() => {});
    }
    item.errors = [...errors];
    item.failedResponses = [...failedResponses];
    result.items.push(item);
    await fs.writeFile(
      dir + (selected ? "/targeted-receipt.private.json" : "/receipt.private.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        checked: result.items.length,
        id: f.id,
        error: !!item.error,
        overflow: item.viewports.filter((v) => v.scrollWidth > v.width).map((v) => v.width),
        alerts: item.viewports[0]?.alerts,
        errors: item.errors,
      }),
    );
  }
  const faults = result.items.filter(
    (item) =>
      item.error ||
      item.errors.length ||
      item.httpStatus !== 200 ||
      item.failedResponses.length ||
      item.viewports.some(
        (v) => v.scrollWidth > v.width || v.brokenImages.length || v.activeMenu.length > 1,
      ),
  );
  assert.equal(faults.length, 0, "Visible page, image, script or horizontal overflow failure");
  assert.equal(result.catalog.count, inventory.features.length);
  assert.equal(
    result.catalog.items.filter(
      (i) => /Planlagt funktion|Afventer samling/.test(i.text) && i.links.length,
    ).length,
    0,
    "Inactive feature has an active link",
  );
} finally {
  await browser.close();
  await sdk.auth.signOut({ scope: "local" });
}
