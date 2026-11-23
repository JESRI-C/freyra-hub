/** Read-only browser inventory, including retained direct links beyond the 20 workspace tabs. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
const [qaPath, envPath] = process.argv.slice(2);
if (!qaPath || !envPath) throw new Error("Private QA and staging configuration required");
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
const auth = await client.auth.signInWithPassword({ email: qa.email, password: qa.password });
assert.equal(auth.error, null);
const cases = JSON.parse(await fs.readFile("tmp/workspace-acceptance/result.json", "utf8"));
const projectId = cases.projects[0].id;
const routes = [];
for (const name of await fs.readdir("src/routes")) {
  if (!name.startsWith("app.") || !name.endsWith(".tsx")) continue;
  const source = await fs.readFile("src/routes/" + name, "utf8");
  const route = source.match(/createFileRoute\("([^\"]+)"\)/)?.[1];
  if (route && !route.includes("$") && route !== "/app/") routes.push(route);
}
const report = {
  schema: "freyra.route-catalogue/v1",
  base: "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev",
  sourceRevision: null,
  scope: "Read-only render and demo-text check; does not prove every external integration",
  routes: [],
  errors: [],
};
const build = await (await fetch(report.base + "/freyra-build.json")).json();
assert.equal(build.viteMode, "staging");
report.sourceRevision = build.sourceRevision;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60000);
  let current;
  page.on("pageerror", (e) => report.errors.push({ route: current, error: e.message }));
  await page.addInitScript(
    ({ session, orgId, projectId }) => {
      localStorage.setItem("sb-xdvqdzdpyceojbdknofi-auth-token", JSON.stringify(session));
      localStorage.setItem("freyra-auth-selection-v1", JSON.stringify({ orgId, projectId }));
    },
    { session: auth.data.session, orgId: qa.organizationId, projectId },
  );
  for (const route of [...new Set(routes)].sort()) {
    current = route;
    const response = await page.goto(report.base + route + "?project=" + projectId, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    const text = await page.locator("body").innerText();
    const problems = [];
    if (!response || response.status() >= 400) problems.push("HTTP " + response?.status());
    if (/\bdemo(?:data|tilstand|mode)?\b/i.test(text)) problems.push("Demo text remains visible");
    if (/An unexpected error|Internal Server Error|Noget gik galt/.test(text))
      problems.push("Application error visible");
    report.routes.push({ route, pass: problems.length === 0, problems });
    await fs.writeFile(
      "docs/release-1.0/route-catalogue-browser.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      (problems.length ? "FAIL " : "PASS ") +
        route +
        (problems.length ? " " + problems.join(", ") : ""),
    );
  }
  assert.ok(report.routes.length > 60);
  assert.ok(report.routes.every((r) => r.pass));
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await browser.close();
  await client.auth.signOut({ scope: "local" });
  await fs.writeFile(
    "docs/release-1.0/route-catalogue-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log("PASS all " + report.routes.length + " static routes");
