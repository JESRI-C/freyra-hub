/** Always-run CI cleanup with preserved evidence, even when tests failed. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { localPsqlChildEnvironment } from "./local-database-guard.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : undefined;
};
assert(
  args.includes("--disposable-local"),
  "Explicit physical disposable LOCAL cleanup flag required",
);
const evidence = resolve(root, option("--evidence") ?? "tmp/database-concurrency");
const offset = relative(root, evidence);
assert(
  offset && !offset.startsWith("..") && !isAbsolute(offset),
  "Cleanup evidence must remain within the checkout",
);
await mkdir(evidence, { recursive: true });
const receipt = {
  schema: "gofreyra.disposable-database-stack-cleanup/v1",
  startedAt: new Date().toISOString(),
  command: "supabase stop --no-backup",
  localOnly: true,
  noLinkedOrHostedCommand: true,
  exitCode: null,
  result: "RUNNING",
};
const path = resolve(evidence, "cleanup-receipt.json");
await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
let stdout = "",
  stderr = "";
const status = await new Promise((resolveStatus) => {
  const child = spawn(option("--supabase") ?? "supabase", ["stop", "--no-backup"], {
    cwd: root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: localPsqlChildEnvironment(process.env),
  });
  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  child.once("error", (error) =>
    resolveStatus({ exitCode: 127, spawnErrorCode: error.code ?? "unknown" }),
  );
  child.once("close", (exitCode, signal) => resolveStatus({ exitCode, signal }));
});
Object.assign(receipt, status, {
  completedAt: new Date().toISOString(),
  result: status.exitCode === 0 ? "PASS" : "FAIL",
});
await writeFile(resolve(evidence, "cleanup.stdout.log"), stdout);
await writeFile(resolve(evidence, "cleanup.stderr.log"), stderr);
await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  JSON.stringify({ cleanup: receipt.result, exitCode: receipt.exitCode, evidence: offset }),
);
process.exitCode = receipt.exitCode === 0 ? 0 : 1;
