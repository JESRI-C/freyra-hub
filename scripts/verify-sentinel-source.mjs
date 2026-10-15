// Read-only public catalog probe; no account, download, database or customer data.
import { resolve } from "node:path";
import { createServer } from "vite";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Required: ${name}`);
  return args[index + 1];
};
const bbox = option("--bbox").split(",").map(Number);
if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value)))
  throw new Error("Invalid test bbox");
const [west, south, east, north] = bbox;
const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
};
const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  css: { postcss: { plugins: [] } },
  resolve: { alias: { "@": resolve("src") } },
  optimizeDeps: { noDiscovery: true },
});
try {
  const { fetchSentinelSceneSource } = await server.ssrLoadModule(
    "/src/services/baseline/sentinel-scene-source.ts",
  );
  const source = await fetchSentinelSceneSource({
    polygon,
    dateFrom: option("--from"),
    dateTo: option("--to"),
  });
  const payload = source.payload;
  console.log(
    JSON.stringify(
      {
        source: source.dataset,
        adapterVersion: source.adapterVersion,
        status: source.status,
        mode: source.mode,
        error: source.error,
        fetchedAt: source.fetchedAt,
        query: source.query,
        coverage: source.coverage,
        payloadSha256: source.payloadSha256,
        warnings: source.quality.warnings,
        catalogComplete: payload?.catalogComplete ?? null,
        localQualityStatus: payload?.localQualityStatus ?? null,
        candidateCount: payload?.scenes?.length ?? null,
        samples: payload?.scenes?.slice(0, 2) ?? [],
      },
      null,
      2,
    ),
  );
  if (source.mode === "error") process.exitCode = 1;
} finally {
  await server.close();
}
