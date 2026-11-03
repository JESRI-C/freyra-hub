import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { directory, fixture, getUser, pool, check, finish } from "./common.mjs";
import { launch, openSession, taskUrl } from "./browser-session.mjs";

const sessions = JSON.parse(await fs.readFile(`${directory}/sessions.private.json`, "utf8"));
const metadata = await fetch(fixture.app + "/freyra-build.json", { cache: "no-store" }).then(
  (response) => response.json(),
);
assert.equal(metadata.sourceRevision, fixture.sourceRevision);

const browser = await launch();
try {
  await pool(fixture.tenants, 2, async (tenant, index) => {
    const manager = getUser(tenant.number, "manager");
    await check("approved-task-report-reopen-and-pdf", manager, async () => {
      assert(tenant.approved, "Expected the task to have an independent approval");
      const width = [1280, 390, 320][index % 3];
      const { context, page } = await openSession(
        browser,
        manager,
        sessions[manager.id],
        tenant,
        width,
      );
      try {
        const target = taskUrl(tenant, "submission");
        const create = page
          .getByRole("button", { name: /^Hent rapport for afleveringsversion / })
          .first();
        const open = page.getByRole("link", { name: "Åbn den gemte rapport", exact: true }).first();
        await page.goto(target);
        const label = await create.innerText();
        const submissionVersion = Number(label.match(/afleveringsversion (\d+)/)?.[1]);
        assert(submissionVersion > 0);
        await create.click();
        await open.waitFor();
        const savedHref = await open.getAttribute("href");
        assert.equal(new URL(savedHref, fixture.app).searchParams.get("version"), "1");
        await page.goto(target);
        await create.click();
        await open.waitFor();
        assert.equal(await open.getAttribute("href"), savedHref);
        await open.click();
        await page.getByText("Godkendt afleveringsgrundlag", { exact: true }).first().waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const [pdf] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "PDF", exact: true }).click(),
        ]);
        const bytes = await fs.readFile(await pdf.path());
        assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
        assert(bytes.length > 1000);
        const back = page.getByRole("link", { name: "Åbn opgavens aflevering og originalfotos" });
        const backUrl = new URL(await back.getAttribute("href"), fixture.app);
        assert.equal(backUrl.searchParams.get("task"), tenant.actionId);
        assert.equal(backUrl.searchParams.get("work"), "submission");
        return {
          width,
          submissionVersion,
          reopenedSameReport: true,
          validPdf: true,
          exactTaskLink: true,
        };
      } finally {
        await context.close();
      }
    });
  });
} finally {
  await browser.close();
}
await finish("reports");
