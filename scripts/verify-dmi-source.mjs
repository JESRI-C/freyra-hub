// Run with Node 22.14: node --experimental-strip-types scripts/verify-dmi-source.mjs
// Read-only DMI adapter probe. CLI coordinates/dates are a test region, not a customer identity.
import { fetchDmiHistoricalSource } from "../src/services/baseline/dmi-historical-source.ts";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Required: ${name}`);
  return args[index + 1];
};
const bbox = option("--bbox").split(",").map(Number);
const from = option("--from");
const to = option("--to");
if (
  bbox.length !== 4 ||
  bbox.some((value) => !Number.isFinite(value)) ||
  !Number.isFinite(Date.parse(from)) ||
  !Number.isFinite(Date.parse(to))
) {
  throw new Error("Use --bbox west,south,east,north --from ISO --to ISO");
}
const source = await fetchDmiHistoricalSource({ bbox, dateFrom: from, dateTo: to });
const payload = source.payload ?? {};
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
      warnings: source.quality.warnings,
      payloadSha256: source.payloadSha256,
      station: payload.station ?? null,
      summary: payload.summary ?? null,
      queries: payload.queries ?? [],
      samples: payload.series?.slice(0, 2) ?? [],
    },
    null,
    2,
  ),
);
if (source.mode === "error") process.exitCode = 1;
