import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const expectedName = "@gofreyra/picomatch-hardened";
const expectedVersion = "4.0.7+gofreyra.1";
const vendor = join(root, "vendor/picomatch-hardened");
const provenance = JSON.parse(readFileSync(join(vendor, "provenance.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const paths = Object.keys(lock.packages).filter((path) =>
  /(?:^|\/)node_modules\/picomatch$/.test(path),
);
assert(paths.length > 0, "The locked installation must contain the hardened matcher");
for (const packagePath of paths) {
  const installed = join(root, packagePath);
  const metadata = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  assert.equal(metadata.name, expectedName, `Unpatched matcher installed at ${packagePath}`);
  assert.equal(metadata.version, expectedVersion);
  for (const entry of provenance.files) {
    for (const folder of [vendor, installed]) {
      const bytes = readFileSync(join(folder, entry.path));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    }
  }
  assert.deepEqual(
    readdirSync(join(installed, "lib"))
      .filter((name) => name.endsWith(".js"))
      .sort(),
    provenance.files
      .filter((entry) => entry.path.startsWith("lib/"))
      .map((entry) => entry.path.slice(4))
      .sort(),
    "Unexpected matcher source files require review",
  );
}
const entry = require.resolve("picomatch");
const payloads = [
  "+(*)",
  "+(*a)",
  "*(*a)",
  "+(?*a)",
  "+(*?a)",
  "+(*[ab])",
  "+(ab|abab)",
  "+(ab|ABAB)",
  "+(a|aa)",
  "+(+(a))",
];
for (const pattern of payloads) {
  // A separate process gives a real deadline even if RegExp.test blocks the event loop.
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    const match = require(${JSON.stringify(entry)});
    for (const options of [{}, {maxExtglobRecursion:false}, {nocase:true}]) {
      const test = match(${JSON.stringify(pattern)}, options);
      assert.equal(test('a'.repeat(10000)+'!'), false);
      assert.equal(test('ab'.repeat(10000)+'!'), false);
    }
  `,
    ],
    { timeout: 3000, windowsHide: true, encoding: "utf8" },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `Unsafe repeated extglob: ${pattern}\n${result.stderr}`);
}
const matcher = require("picomatch");
for (const [pattern, accepted, rejected] of [
  ["src/**/*.tsx", "src/routes/app.tsx", "src/routes/app.ts"],
  ["**/*.{ts,tsx}", "src/index.ts", "src/index.css"],
  ["**/!(*.test).ts", "src/index.ts", "src/index.test.ts"],
  ["+(src|test)", "srctest", "other"],
  ["+(*(a)|*(b))", "abba", "ab!"],
]) {
  assert.equal(matcher(pattern)(accepted), true, pattern);
  assert.equal(matcher(pattern)(rejected), false, pattern);
}
console.log(
  "Hardened matcher integrity, installed dependency coverage and ReDoS deadlines passed.",
);
