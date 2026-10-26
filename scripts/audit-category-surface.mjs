import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Source inventory only. A route file is not evidence of a working user journey.
const root = process.cwd();
const sidebar = fs.readFileSync(path.join(root, "src/components/AppSidebar.tsx"), "utf8");
const ast = ts.createSourceFile(
  "AppSidebar.tsx",
  sidebar,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const categories = [];
function visit(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const values = Object.fromEntries(
      node.properties.flatMap((property) => {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer))
          return [];
        return [[property.name.getText(ast), property.initializer.text]];
      }),
    );
    if (values.to && values.label) categories.push({ route: values.to, label: values.label });
  }
  ts.forEachChild(node, visit);
}
visit(ast);

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}
const routes = filesIn(path.join(root, "src/routes")).flatMap((file) => {
  const text = fs.readFileSync(file, "utf8");
  const route = text.match(/createFileRoute\(["']([^"']+)["']\)/)?.[1];
  return route
    ? [
        {
          route,
          file: path.relative(root, file).split(path.sep).join("/"),
          rendersOutlet: /<Outlet(?:\s|\/>)/.test(text),
          rendersEvidenceStatus: /<ProjectEvidenceStatus(?:\s|\/>)/.test(text),
          importsDemonstrationData:
            /from ["']@\/(?:lib\/(?:decisions-data|ledger-data|impact-data|platform-data|settings-data)|data\/platform-seed)["']/.test(
              text,
            ),
        },
      ]
    : [];
});
const result = categories.map((category) => {
  const entries = routes.filter((entry) => entry.route.replace(/\/$/, "") === category.route);
  const children = routes.filter(
    (entry) => entry.route.startsWith(`${category.route}/`) && entry.route !== `${category.route}/`,
  );
  const blockingLayouts = entries.filter(
    (entry) => children.length && entry.rendersEvidenceStatus && !entry.rendersOutlet,
  );
  return {
    ...category,
    routeFiles: entries.map((entry) => entry.file),
    childRouteCount: children.length,
    childDemonstrationImportCount: children.filter((entry) => entry.importsDemonstrationData)
      .length,
    ownDemonstrationImportCount: entries.filter((entry) => entry.importsDemonstrationData).length,
    blockingLayouts: blockingLayouts.map((entry) => entry.file),
    browserAcceptance: "not_verified",
    findings: [
      ...(!entries.length ? ["missing_route"] : []),
      ...(blockingLayouts.length ? ["children_hidden_by_evidence_status"] : []),
      ...(children.some((entry) => entry.importsDemonstrationData)
        ? ["legacy_demonstration_imports_need_data_binding"]
        : []),
      ...(entries.some((entry) => entry.importsDemonstrationData)
        ? ["category_imports_demonstration_data"]
        : []),
    ],
  };
});
process.stdout.write(
  `${JSON.stringify(
    {
      verification: "source_only_not_functional_acceptance",
      categoryCount: result.length,
      routeCount: routes.length,
      categories: result,
    },
    null,
    2,
  )}\n`,
);
if (!result.length || result.some((category) => category.findings.includes("missing_route")))
  process.exitCode = 1;
