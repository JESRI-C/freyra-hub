import type { PublicBaselineManifest } from "./public-baseline-types";

/** PostgreSQL stores jsonb::text with a space after separators and expanded numbers. */
export function jsonbTextBytes(value: unknown): number {
  if (value === null) return 4;
  if (typeof value === "string" || typeof value === "boolean")
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Datagrundlaget indeholder et ugyldigt tal.");
    const raw = JSON.stringify(value);
    if (!raw.includes("e")) return raw.length;
    const [coefficient, exponentText] = raw.split("e");
    const sign = coefficient.startsWith("-") ? 1 : 0;
    const unsigned = coefficient.slice(sign);
    const digits = unsigned.replace(".", "").length;
    const point =
      (unsigned.indexOf(".") < 0 ? unsigned.length : unsigned.indexOf(".")) + Number(exponentText);
    return sign + (point <= 0 ? 2 - point + digits : point >= digits ? point : digits + 1);
  }
  if (Array.isArray(value))
    return (
      2 +
      Math.max(0, value.length - 1) * 2 +
      value.reduce((sum, entry) => sum + jsonbTextBytes(entry), 0)
    );
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      2 +
      Math.max(0, entries.length - 1) * 2 +
      entries.reduce(
        (sum, [key, entry]) => sum + jsonbTextBytes(key) + 2 + jsonbTextBytes(entry),
        0,
      )
    );
  }
  throw new Error("Datagrundlaget skal være gyldig JSON.");
}

export const PUBLIC_BASELINE_SQL_BYTE_LIMIT = 2 * 1024 * 1024;
// Small reserve for any database formatting differences. Historic manifests are untouched.
const COLLECTION_BYTE_BUDGET = PUBLIC_BASELINE_SQL_BYTE_LIMIT - 4096;

/** A large layer must not prevent all the other public sources from being saved. */
export function fitCollectedBaselineBudget(
  manifest: PublicBaselineManifest,
): PublicBaselineManifest {
  let result = manifest;
  while (jsonbTextBytes(result) > COLLECTION_BYTE_BUDGET) {
    const largest = result.sources
      .filter((source) => source.id !== "official-watercourse-reference" && source.payload !== null)
      .sort((a, b) => jsonbTextBytes(b.payload) - jsonbTextBytes(a.payload))[0];
    if (!largest) throw new Error("Datagrundlagets kildeoversigt overstiger lagergrænsen.");
    result = {
      ...result,
      sources: result.sources.map((source) =>
        source.id !== largest.id
          ? source
          : {
              ...source,
              mode: "error",
              status: "failed",
              payload: null,
              payloadSha256: null,
              coverage: {
                ...source.coverage,
                spatial: "unknown",
                temporal: "unknown",
                observedFrom: null,
                observedTo: null,
                paginationComplete: false,
                returnedCount: null,
              },
              error: {
                code: "BASELINE_BYTE_BUDGET",
                message:
                  "Kildens indhold kunne ikke medtages inden for den gemte versions størrelsesgrænse. Afgræns området eller vælg en kortere periode.",
              },
              quality: {
                ...source.quality,
                warnings: [
                  ...source.quality.warnings,
                  "Denne kildes indhold er udeladt fra den gemte version på grund af størrelsen. De øvrige kilder er bevaret.",
                ],
              },
            },
      ),
    };
  }
  return result;
}
