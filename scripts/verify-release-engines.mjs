import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import ts from "typescript";

const fallback = "625781906a4f49d120b6b3581261279dd889e6de";
const roots = [
  "src/services/baseline",
  "src/services/planting",
  "src/lib/report-engine.ts",
  "src/services/nature/carbon-engine.ts",
  "src/services/nature/biodiversity-engine.ts",
  "src/services/nature/water-quality-engine.ts",
  "src/services/satellite/ndvi-engine.ts",
  "src/services/monitoring/alert-engine.ts",
  "src/services/monitoring/indicator-aggregation-engine.ts",
  "src/services/monitoring/quality-engine.ts",
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).replace(/\r\n/g, "\n");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const files = git("ls-tree", "-r", "--name-only", fallback, "--", ...roots)
  .trim()
  .split("\n")
  .filter((p) => p && !p.includes("__tests__") && !p.endsWith(".test.ts"));
const checks = [];
for (const file of files) {
  const before = git("show", `${fallback}:${file}`);
  const current = (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
  assert.equal(current, before, `Protected engine changed: ${file}`);
  checks.push({ file, sha256: hash(current), identical: true });
}
const file = "src/services/construction-service.ts";
const functions = (source) => {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return Object.fromEntries(
    ast.statements
      .filter((n) => ts.isFunctionDeclaration(n) && n.name)
      .map((n) => [n.name.text, n.getText(ast)]),
  );
};
const before = functions(git("show", `${fallback}:${file}`));
const current = functions((await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n"));
for (const name of ["getRunoffRiskScore", "getNatureSensitivityScore"]) {
  assert.equal(current[name], before[name], `Protected calculation changed: ${name}`);
  assert.ok(current[name]);
  checks.push({ file, function: name, sha256: hash(current[name]), identical: true });
}
await fs.mkdir("docs/release-1.0", { recursive: true });
await fs.writeFile(
  "docs/release-1.0/engine-preservation.json",
  JSON.stringify({ fallback, checkedAt: new Date().toISOString(), checks, passed: true }, null, 2) +
    "\n",
);
console.log(`PASS: ${checks.length} engine files/functions identical to ${fallback.slice(0, 7)}`);
