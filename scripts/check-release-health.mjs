/** Public uptime probe. Never sends credentials, case data or photos. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
const out = process.argv[2] ?? "tmp/operations/health.json";
const test = process.argv.includes("--test-failure");
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
let fixture;
if (test) {
  fixture = createServer((_req, res) => {
    res.writeHead(503);
    res.end("Controlled release alarm test");
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
}
const target = test ? "http://127.0.0.1:" + fixture.address().port : base;
const checks = [];
try {
  for (const pathname of test ? ["/unavailable"] : ["/login", "/freyra-build.json"]) {
    try {
      const response = await fetch(target + pathname, {
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      const text = await response.text();
      let valid = response.ok;
      if (pathname.endsWith(".json")) {
        const build = JSON.parse(text);
        valid &&=
          build.release === "1.0" &&
          build.customerDataOnly === true &&
          build.municipalDemo === false;
      }
      if (pathname === "/login") valid &&= /Freyra/.test(text);
      checks.push({ path: pathname, status: response.status, ok: valid });
    } catch {
      checks.push({ path: pathname, status: null, ok: false });
    }
  }
} finally {
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
}
const result = {
  schema: "freyra.health/v1",
  checkedAt: new Date().toISOString(),
  environment: "staging",
  test,
  checks,
  ok: checks.every((c) => c.ok),
};
if (!result.ok)
  result.incidentKey = createHash("sha256").update(JSON.stringify(checks)).digest("hex");
await fs.mkdir(out.slice(0, out.lastIndexOf("/")), { recursive: true });
await fs.writeFile(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (test) {
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].status, 503);
} else if (!result.ok) process.exitCode = 1;
