import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

// Local static inventory only. No credentials, database, network or feature activation.
const bundle = await build({
  entryPoints: ["src/lib/program-map.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const catalog = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const { PROGRAM_FEATURES, PROGRAM_PAGES, SKYHOST_JOB_AREAS, programPageGuide } = catalog;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const files = walk("src").filter((f) => /\.[cm]?[jt]sx?$/.test(f));
const texts = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const test = (f) => /__tests__|\.(test|spec)\./.test(f);
const code = files.filter((f) => !test(f) && !f.endsWith("routeTree.gen.ts"));
const routes = code
  .filter((f) => f.startsWith("src/routes/"))
  .flatMap((file) => {
    const s = texts.get(file),
      route = s.match(/createFileRoute\(["']([^"']+)["']\)/)?.[1];
    if (!route) return [];
    const product = route.startsWith("/app/") || ["/felt", "/opgaver"].includes(route);
    const guide = programPageGuide(route);
    return [
      {
        route,
        file,
        kind:
          route === "/app/program"
            ? "program-map"
            : product
              ? "product"
              : route === "/app"
                ? "app-layout"
                : ["/", "/select", "/login", "/reset-password", "/.lovable/oauth/consent"].includes(
                      route,
                    )
                  ? "entry-or-auth"
                  : "technical-endpoint",
        layout: /<Outlet/.test(s),
        featureId: guide?.id ?? null,
      },
    ];
  });
const unmapped = routes.filter((r) => r.kind === "product" && !r.featureId);
if (unmapped.length)
  throw Error("Unmapped product routes: " + unmapped.map((r) => r.route).join(", "));
const featureById = new Map(PROGRAM_FEATURES.map((f) => [f.id, f]));
const target = {
  "ORG-01": ["tab:overblik", "tab:roller"],
  "ORG-02": ["tab:roller"],
  "ORG-03": ["/opgaver", "work:evidence"],
  "ORG-04": ["/opgaver", "tab:rapporter"],
  "JOB-01": ["work:plan"],
  "JOB-02": ["work:plan"],
  "JOB-03": ["work:execution"],
  "JOB-04": ["work:plan", "/opgaver"],
  "JOB-05": ["work:plan", "work:submission"],
  "JOB-06": ["tab:handlinger", "tab:livekort"],
  "JOB-07": ["planned:recurrence"],
  "JOB-08": ["planned:calendar"],
  "JOB-09": ["work:plan", "tab:audit"],
  "JOB-10": ["planned:recurrence"],
  LOC: ["tab:sites", "planned:routes"],
  OBS: ["work:field", "work:evidence", "/felt"],
  MAP: ["tab:livekort", "/app/connect/map"],
  FORM: ["work:field", "planned:requirements", "planned:category-settings"],
  QA: ["work:submission", "planned:review", "step:sammenligning"],
  "OPS-01": ["planned:time"],
  "OPS-02": ["planned:materials"],
  "OPS-03": ["planned:booking"],
  "OPS-04": ["planned:routes"],
  "OPS-05": ["planned:recurrence"],
  "OPS-06": ["planned:job-notifications"],
  "OPS-07": ["planned:billing"],
  REP: ["tab:rapporter", "/app/reports"],
  IMP: ["planned:migration", "/app/connect/upload"],
  SYS: ["/app/system-test", "/app/settings/security"],
};
const register = JSON.parse(fs.readFileSync("docs/jobs-geotag-requirements.json", "utf8"));
const requirements = register.requirements.map((r) => {
  const featureIds = target[r.id] ?? target[r.id.split("-")[0]];
  if (!featureIds?.length || featureIds.some((id) => !featureById.has(id)))
    throw Error("Unmapped requirement " + r.id);
  return {
    id: r.id,
    title: r.title,
    priority: r.priority,
    package: r.package,
    featureIds,
    code: r.code,
    tests: r.tests,
    migrations: r.migrations,
    existingRegisterCoverage: r.coverage,
    existingRegisterRemaining: r.remaining,
    evidenceNote:
      "Historical register text retained, not promoted to current acceptance. See current delivery receipts and actual code.",
  };
});
const deps = new Map(
  code.map((file) => [
    file,
    [...texts.get(file).matchAll(/(?:from\s*|import\s*\(|import\s*)["']([^"']+)["']/g)].flatMap(
      (m) => {
        const spec = m[1],
          base = spec.startsWith("@/")
            ? "src/" + spec.slice(2)
            : spec.startsWith(".")
              ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))
              : null;
        if (!base) return [];
        const resolved = [
          base,
          ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"].map((ext) => base + ext),
        ].find((f) => texts.has(f));
        return resolved ? [resolved] : [];
      },
    ),
  ]),
);
const reachedFrom = new Map(code.map((f) => [f, []]));
for (const route of routes) {
  const visited = new Set();
  function visit(f) {
    if (visited.has(f)) return;
    visited.add(f);
    reachedFrom.get(f)?.push(route.route);
    for (const dep of deps.get(f) ?? []) visit(dep);
  }
  visit(route.file);
}
const sourceFiles = files.map((file) => ({
  file,
  sha256: sha(texts.get(file)),
  kind: test(file) ? "test" : file.endsWith("routeTree.gen.ts") ? "generated" : "source",
  reachedFromRoutes: reachedFrom.get(file) ?? [],
}));
const sourceTreeSha256 = sha(JSON.stringify(sourceFiles.map(({ file, sha256 }) => [file, sha256])));
const legacyRoots = [
  "src",
  "udvikling/freyra-hub/src",
  "arbejde/freyra-hub-demo-2710/src",
  "arbejde/freyra-hub-redesign-2710/src",
];
const activeRelative = new Map(sourceFiles.map((f) => [f.file.slice(4), f.sha256]));
const legacyComparison = legacyRoots.flatMap((relativeRoot) => {
  const root = path.resolve("../..", relativeRoot);
  if (!fs.existsSync(root)) return [{ root: relativeRoot, available: false }];
  const previous = walk(root)
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f))
    .map((file) => ({
      file: path.relative(root, file).replaceAll("\\", "/"),
      sha256: sha(fs.readFileSync(file)),
    }));
  return [
    {
      root: relativeRoot,
      available: true,
      sourceFiles: previous.length,
      onlyInLegacy: previous.filter((f) => !activeRelative.has(f.file)).map((f) => f.file),
      differentContent: previous
        .filter((f) => activeRelative.has(f.file) && activeRelative.get(f.file) !== f.sha256)
        .map((f) => f.file),
      note: "Path/content comparison only. Existing historical trees remain untouched; differing content is not automatically merged or deleted.",
    },
  ];
});
const reference =
  "tmp/jobs-geotag-reference/Skyhost_Jobs_Geotag_funktionskortlaegning_2026-10-29.html";
if (
  fs.existsSync(reference) &&
  sha(fs.readFileSync(reference)) !==
    "ba23c8dfab5270d30824c4ba3c93b8e38dd533e38e3636d8baa8c13cb15437a1"
)
  throw Error("Skyhost source fingerprint changed");
const result = {
  schema: "freyra.program-map/v1",
  date: "2026-11-02",
  baselineCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceTreeSha256,
  method:
    "All current src JS/TS files, route declarations, local static imports, project destinations and 68 existing requirement IDs. Static mapping is not functional, hosted, security or customer acceptance. A route-unreachable file is a review candidate, never a deletion recommendation.",
  source: {
    name: "Skyhost_Jobs_Geotag_funktionskortlaegning_2026-10-29.html",
    sha256: "ba23c8dfab5270d30824c4ba3c93b8e38dd533e38e3636d8baa8c13cb15437a1",
    url: "https://drive.google.com/file/d/1hDgbtkI4Zh7fHE4FLqfUQFuvH3bcjlBx/view",
  },
  counts: {
    sourceFiles: files.length,
    productionFiles: code.length,
    tests: files.filter(test).length,
    routeDeclarations: routes.length,
    canonicalProductPages: PROGRAM_PAGES.length,
    projectDestinations: catalog.PROJECT_FEATURES.length,
    taskParts: catalog.TASK_FEATURES.length,
    plannedCapabilities: catalog.PLANNED_FEATURES.length,
    requirementIds: requirements.length,
    unmappedProductRoutes: unmapped.length,
    staticUnreachedProductionFiles: code.filter((f) => !reachedFrom.get(f)?.length).length,
  },
  areas: catalog.PROGRAM_AREAS,
  features: PROGRAM_FEATURES,
  skyhostJobAreas: SKYHOST_JOB_AREAS,
  integrationCandidates: [
    {
      featureId: "integration:watercourse",
      files: ["src/components/maps/WatercoursePanel.tsx", "src/services/watercourse-service.ts"],
      gate: "Draft protection, actor-scoped cache, shared geometry and task relation before integration.",
    },
    {
      featureId: "integration:watercourse-observations",
      files: [
        "src/components/maps/WatercourseObservationPanel.tsx",
        "src/services/watercourse-observations.ts",
      ],
      gate: "Review role, frozen evidence and actor-scoped cache before integration.",
    },
    {
      featureId: "integration:species",
      files: ["src/components/monitoring/SpeciesRecognitionFlow.tsx"],
      gate: "Actual provider and professional acceptance; no automatic activation.",
    },
    {
      featureId: "integration:report-draft",
      files: ["src/components/ai/AiReportDraft.tsx"],
      gate: "Project-scoped input, frozen sources and provider acceptance before integration.",
    },
    {
      featureId: "integration:drone-processing",
      files: [
        "src/services/monitoring/drone-jobs-service.ts",
        "src/services/monitoring/drone-processing.ts",
      ],
      gate: "Existing manifest-bound blocked jobs are not a functioning production worker/provider.",
    },
  ],
  legacyComparison,
  requirements,
  supplementalSkyhostSetup: [
    "planned:customers",
    "planned:job-settings",
    "planned:category-settings",
    "planned:job-notifications",
    "planned:materials",
    "planned:billing",
  ].map((id) => ({
    featureId: id,
    requirementRegistration:
      "Supplemental scope from Skyhost settings; not a false completed requirement in the 68-ID register.",
  })),
  routes,
  sourceFiles,
};
fs.mkdirSync("docs/program-map", { recursive: true });
fs.writeFileSync(
  "docs/program-map/inventory-2026-11-02.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify({ ...result.counts, sourceTreeSha256 }));
