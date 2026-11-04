import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { directory, fixture, pool, check, finish } from "./common.mjs";
import { launch, openSession, taskUrl } from "./browser-session.mjs";

const sessions = JSON.parse(await fs.readFile(`${directory}/sessions.private.json`, "utf8"));
const metadata = await fetch(fixture.app + "/freyra-build.json").then((r) => r.json());
assert.equal(metadata.sourceRevision, fixture.sourceRevision);
const browser = await launch();
try {
  // Fifty fresh browser profiles, with only two active tabs at a time.
  await pool(fixture.users, 2, async (user) => {
    const tenant = fixture.tenants.find((item) => item.number === user.tenant);
    const width = [1280, 390, 320][(user.number - 1) % 3];
    await check("separate-browser-profile-and-role-surface", user, async () => {
      const { context, page } = await openSession(browser, user, sessions[user.id], tenant, width);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.name));
      let foundDeliveryFromOverview = false;
      try {
        if (user.role === "external" || user.role === "unassigned") {
          await page.goto(fixture.app + "/opgaver", { waitUntil: "domcontentloaded" });
          await page.getByRole("heading", { name: "Mine opgaver", exact: true }).waitFor();
          if (user.role === "external" && tenant.approved) {
            const task = page.getByRole("article").filter({
              has: page.getByRole("heading", {
                name: `TEST SaaS50 ${fixture.run} opgave ${tenant.number}`,
                exact: true,
              }),
            });
            await task.getByRole("button", { name: "Åbn opgave", exact: true }).click();
            await task.getByText("Se afleveringsversioner", { exact: true }).click();
            const panel = task.getByRole("region", {
              name: "Opgavens afleveringsgrundlag",
              exact: true,
            });
            await panel.getByText(/Status: Godkendt/).waitFor();
            assert.equal(
              await panel
                .getByRole("button", { name: "Gem afleveringsversion", exact: true })
                .count(),
              0,
            );
            assert.equal(
              await panel
                .getByRole("button", { name: "Godkend denne aflevering", exact: true })
                .count(),
              0,
            );
          }
          if (user.role === "unassigned") {
            await page
              .getByText(/Ingen tildelte opgaver|Ingen opgaver/i)
              .first()
              .waitFor();
            assert.equal(
              await page.getByRole("button", { name: "Åbn opgave", exact: true }).count(),
              0,
            );
          }
        } else {
          if (user.role === "manager") {
            const overview = new URL(taskUrl(tenant, "submission"));
            overview.search = "?tab=overblik&taskList=calendar";
            await page.goto(overview.href, { waitUntil: "domcontentloaded" });
            const shortcut = page.getByRole("button", {
              name: "Åbn opgavens aflevering",
              exact: true,
            });
            await shortcut.focus();
            await page.keyboard.press("Enter");
            await page.waitForURL(
              (url) =>
                url.searchParams.get("tab") === "handlinger" &&
                url.searchParams.get("taskList") === "tasks" &&
                url.searchParams.get("work") === "submission" &&
                !url.searchParams.has("task"),
            );
            await page
              .getByText(
                "Vælg en arbejdsopgave for at åbne dens aflevering og faglige gennemgang.",
                {
                  exact: true,
                },
              )
              .waitFor();
            const title = `TEST SaaS50 ${fixture.run} opgave ${tenant.number}`;
            await page.getByPlaceholder("Søg efter opgavens titel").fill(title);
            await page.getByRole("button", { name: title + " Åbn →", exact: true }).click();
            await page.waitForURL(
              (url) =>
                url.searchParams.get("task") === tenant.actionId &&
                url.searchParams.get("work") === "submission",
            );
            foundDeliveryFromOverview = true;
          } else {
            await page.goto(taskUrl(tenant, "submission"), { waitUntil: "domcontentloaded" });
          }
          await page
            .getByRole("heading", { name: tenant.projectName, exact: true })
            .first()
            .waitFor();
          const panel = page.getByRole("region", {
            name: "Opgavens afleveringsgrundlag",
            exact: true,
          });
          await panel.waitFor();
          if (tenant.approved) await panel.getByText(/Status: Godkendt/).waitFor();
          if (user.role === "viewer") {
            assert.equal(
              await panel
                .getByRole("button", { name: "Gem afleveringsversion", exact: true })
                .count(),
              0,
            );
          }
        }
        const body = await page.locator("body").innerText();
        for (const other of fixture.tenants.filter((item) => item.number !== user.tenant)) {
          assert(
            !body.includes(other.projectName),
            "A foreign project appeared in the role surface",
          );
          assert(
            !body.includes(`TEST SaaS50 ${fixture.run} opgave ${other.number}`),
            "A foreign task appeared in the role surface",
          );
        }
        assert.deepEqual(pageErrors, []);
        const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        assert(pageWidth <= width, `Page overflow: ${pageWidth} for ${width}`);
        if (user.number <= 6 || user.number === 49) {
          await page.screenshot({ path: `${directory}/role-${user.role}-${width}.png` });
        }
        return {
          width,
          projectScope:
            user.role === "external"
              ? "one-task-only"
              : user.role === "unassigned"
                ? "none"
                : "own-project",
          approvedVersionRendered: !!tenant?.approved,
          foundDeliveryFromOverview,
          javascriptErrors: 0,
        };
      } finally {
        await context.close();
      }
    });
  });
} finally {
  await browser.close();
}
await finish("browser");
