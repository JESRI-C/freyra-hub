import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const categories = ["Tables", "Views", "Functions", "Enums", "CompositeTypes"];
const propertyName = (node) => node.name?.text ?? node.name?.getText();
function canonical(node, source, context = "") {
  if (node.kind === ts.SyntaxKind.UnknownKeyword) return "unknown";
  if (node.kind === ts.SyntaxKind.AnyKeyword) return "any";
  if (ts.isParenthesizedTypeNode(node)) return canonical(node.type, source, context);
  if (ts.isTypeLiteralNode(node))
    return JSON.stringify([
      "object",
      node.members
        .map((member) => [
          propertyName(member),
          !!member.questionToken,
          member.type
            ? canonical(member.type, source, propertyName(member))
            : member.getText(source),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ]);
  if (ts.isUnionTypeNode(node)) {
    if (node.types.some((type) => type.kind === ts.SyntaxKind.UnknownKeyword)) return "unknown";
    if (node.types.some((type) => type.kind === ts.SyntaxKind.AnyKeyword)) return "any";
    return JSON.stringify(["union", node.types.map((type) => canonical(type, source)).sort()]);
  }
  if (ts.isIntersectionTypeNode(node))
    return JSON.stringify([
      "intersection",
      node.types.map((type) => canonical(type, source)).sort(),
    ]);
  if (ts.isArrayTypeNode(node))
    return JSON.stringify(["array", canonical(node.elementType, source)]);
  if (ts.isTupleTypeNode(node)) {
    const values = node.elements.map((element) => canonical(element, source));
    return JSON.stringify(["tuple", context === "Relationships" ? values.sort() : values]);
  }
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    node.getText(source),
  );
  const tokens = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan())
    tokens.push([
      token,
      token === ts.SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText(),
    ]);
  return JSON.stringify(tokens);
}
function publicApi(sourceText) {
  const source = ts.createSourceFile(
    "schema.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (source.parseDiagnostics.length) throw new Error("The schema types are invalid TypeScript.");
  const alias = source.statements.find(
    (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "Database",
  );
  const schema =
    alias && ts.isTypeLiteralNode(alias.type)
      ? alias.type.members.find((member) => propertyName(member) === "public")?.type
      : null;
  if (!schema || !ts.isTypeLiteralNode(schema))
    throw new Error("The public schema types are missing.");
  return Object.fromEntries(
    categories.map((name) => {
      const category = schema.members.find((member) => propertyName(member) === name)?.type;
      if (!category) throw new Error("The public API category is missing: " + name);
      if (
        ts.isMappedTypeNode(category) &&
        category.typeParameter.constraint?.kind === ts.SyntaxKind.NeverKeyword
      )
        return [name, new Map()];
      if (!ts.isTypeLiteralNode(category))
        throw new Error("Unsupported public API category: " + name);
      return [
        name,
        new Map(
          category.members.map((member) => {
            if (!ts.isPropertySignature(member) || !member.type)
              throw new Error("Unsupported public API declaration.");
            return [propertyName(member), canonical(member.type, source)];
          }),
        ),
      ];
    }),
  );
}

/** Check removed API objects and the app declarations affected by the geometry move. */
export function checkPostgisApiTypes(checkedSource, generatedSource) {
  const checked = publicApi(checkedSource);
  const generated = publicApi(generatedSource);
  const differences = [];
  for (const category of categories) {
    const declared = [...checked[category].keys()].sort();
    const actual = [...generated[category].keys()].sort();
    if (JSON.stringify(declared) !== JSON.stringify(actual))
      differences.push(
        category +
          " API members differ: " +
          [...new Set([...declared, ...actual])]
            .filter((name) => checked[category].has(name) !== generated[category].has(name))
            .join(", "),
      );
  }
  for (const name of ["geo_features", "geo_observations", "project_areas"]) {
    if (!generated.Tables.has(name) || checked.Tables.get(name) !== generated.Tables.get(name))
      differences.push("Tables." + name + " does not match the migrated database.");
  }
  const rpc = "get_project_geojson";
  if (!generated.Functions.has(rpc) || checked.Functions.get(rpc) !== generated.Functions.get(rpc))
    differences.push("Functions." + rpc + " does not match the migrated database.");
  return differences;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (paths.length !== 2)
    throw new Error("Usage: check-postgis-api-types.mjs CHECKED_TYPES GENERATED_TYPES");
  const differences = checkPostgisApiTypes(
    await readFile(paths[0], "utf8"),
    await readFile(paths[1], "utf8"),
  );
  if (differences.length) throw new Error(differences.join("\n"));
  console.log("Migrated public API members, geometry tables and GeoJSON RPC types: PASS");
}
