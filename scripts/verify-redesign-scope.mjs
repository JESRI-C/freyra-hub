import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const BASE = "625781906a4f49d120b6b3581261279dd889e6de";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16_000_000 });
const files = git("diff", "--name-only", BASE).trim().split("\n").filter(Boolean);
const allowed = (file) =>
  /^(docs\/|public\/fonts\/|src\/components\/)/.test(file) ||
  (/^src\/routes\/.*\.tsx$/.test(file) && !/\/api\.|\/\[\./.test(file)) ||
  file === "src/routes/[.]lovable.oauth.consent.tsx" ||
  [
    "src/styles.css",
    "src/routeTree.gen.ts",
    "src/lib/__tests__/demo-mode.test.ts",
    "src/lib/__tests__/customer-project-route-integrity.test.ts",
    "e2e/haderslev-delivery.spec.ts",
    "e2e/redesign-ui.spec.ts",
    "scripts/verify-redesign-scope.mjs",
  ].includes(file);
const problems = files.filter((file) => !allowed(file)).map((file) => `Outside UI scope: ${file}`);
const baseFiles = git("ls-tree", "-r", "--name-only", BASE).trim().split("\n");
const printer = ts.createPrinter({ removeComments: true });
function controls(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const signatures = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(ast);
      if (
        /^(input|textarea|select|Input|Textarea|Select|Slider|Switch|Checkbox|RadioGroup|ToggleGroup)$/.test(
          tag,
        )
      ) {
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
        const binding = [
          "value",
          "checked",
          "defaultValue",
          "defaultChecked",
          "onChange",
          "onValueChange",
          "onCheckedChange",
          "type",
          "min",
          "max",
          "step",
          "accept",
        ]
          .map((name) => {
            const value = attributes.find(
              (attribute) => attribute.name.getText(ast) === name,
            )?.initializer;
            return value
              ? `${name}:${printer.printNode(ts.EmitHint.Unspecified, value, ast).replace(/\s/g, "")}`
              : "";
          })
          .join("|");
        signatures.push(`${tag}|${binding}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return signatures;
}
let checked = 0;
for (const file of files.filter(
  (file) =>
    /^src\/(components|routes)\/.+\.tsx$/.test(file) &&
    !/__tests__/.test(file) &&
    baseFiles.includes(file),
)) {
  const original = git("show", `${BASE}:${file}`);
  const current = readFileSync(file, "utf8");
  const remaining = controls(current, file);
  for (const signature of controls(original, file)) {
    const index = remaining.indexOf(signature);
    if (index < 0)
      problems.push(`Existing field binding or handler changed/removed: ${file}: ${signature}`);
    else {
      remaining.splice(index, 1);
      checked++;
    }
  }
}
for (const file of baseFiles.filter(
  (file) => /^src\/routes\/.+\.tsx$/.test(file) && !/__tests__/.test(file),
)) {
  const original = git("show", `${BASE}:${file}`);
  const path = original.match(/createFileRoute\(["']([^"']+)/)?.[1];
  if (!path) continue;
  try {
    const current = readFileSync(file, "utf8");
    if (current.match(/createFileRoute\(["']([^"']+)/)?.[1] !== path)
      problems.push(`Existing route changed: ${file}`);
  } catch {
    problems.push(`Existing route removed: ${file}`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `UI scope PASS: ${files.length} tracked changed files, ${checked} existing field bindings/handlers preserved in edited screens; existing route paths preserved. No engine, API, database, RLS, service, model, dependency or workflow changes.`,
  );
}
