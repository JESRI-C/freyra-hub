import { booleanPointInPolygon, point } from "@turf/turf";
import { z } from "zod";
import { fetchCadastralSource } from "./baseline/cadastral-source.server";
import { fetchPlantingPolygonSource } from "./baseline/planting-polygon-sources.server";
import { computeAreaHa, validateProjectPolygon } from "./geo-service";
import type { AreaFeature } from "./geo-lookup-transform";

const position = z.tuple([z.number().min(7).max(16), z.number().min(54).max(58)]);
const coordinates = z.array(z.array(position).min(4)).min(1);
const geometry = z.union([
  z.object({ type: z.literal("Polygon"), coordinates }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(coordinates).min(1) }),
]);

export async function lookupProjectArea(
  source: "matrikel" | "markblok" | "lowland",
  ring: [number, number][],
) {
  const checked = validateProjectPolygon({ type: "Polygon", coordinates: [ring] });
  if (!checked.valid) throw new Error("Vælg et gyldigt område på kortet.");
  const input = { polygon: checked.polygon, dateFrom: "", dateTo: "" };
  const result =
    source === "matrikel"
      ? await fetchCadastralSource(input)
      : await fetchPlantingPolygonSource(
          source === "lowland" ? "planting-lowland" : "planting-markblocks",
          input,
        );
  if (result.mode === "error" || !result.payload)
    throw new Error(
      source === "matrikel"
        ? "Matrikeltjenesten kunne ikke hentes. Prøv igen; du kan også tegne grænsen manuelt."
        : "Markbloktjenesten kunne ikke hentes. Prøv igen; du kan også tegne grænsen manuelt.",
    );
  let items: AreaFeature[];
  if (source === "matrikel") {
    const payload = z
      .object({
        parcels: z.array(
          z.object({
            id: z.string(),
            parcelNumber: z.string(),
            landRegisterAreaCode: z.string(),
            geometry,
          }),
        ),
      })
      .parse(result.payload);
    items = payload.parcels.map((parcel) => ({
      id: parcel.id,
      label: `Matr.nr. ${parcel.parcelNumber} · ejerlav ${parcel.landRegisterAreaCode}`,
      geometry: parcel.geometry,
      areaHa: null,
    }));
  } else {
    const payload = z
      .object({ geometries: z.array(geometry), featureIds: z.array(z.string()) })
      .parse(result.payload);
    items = payload.geometries.map((shape, i) => ({
      id: payload.featureIds[i],
      label:
        source === "lowland"
          ? "Kulstof2022 · registreret kulstofrig jord (uden klasseinddeling)"
          : `Markblok ${payload.featureIds[i]} · 2026`,
      geometry: shape,
      areaHa: null,
    }));
  }
  return {
    items,
    truncated: !result.coverage.paginationComplete || result.coverage.spatial !== "complete",
  };
}

export async function pickProjectArea(source: "matrikel" | "markblok", lat: number, lng: number) {
  const d = 0.00001;
  const result = await lookupProjectArea(source, [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ]);
  const selected = result.items.filter(
    (item) =>
      item.geometry && booleanPointInPolygon(point([lng, lat]), geometry.parse(item.geometry)),
  );
  if (selected.length > 1)
    throw new Error("Punktet ligger på flere flader. Zoom ind og vælg inde i den ønskede flade.");
  if (!selected.length) {
    if (result.truncated) throw new Error("Kortudtrækket er ufuldstændigt. Zoom ind og prøv igen.");
    return null;
  }
  const item = selected[0];
  const candidate =
    item.geometry?.type === "MultiPolygon" && item.geometry.coordinates.length === 1
      ? { type: "Polygon" as const, coordinates: item.geometry.coordinates[0] }
      : item.geometry;
  if (candidate?.type !== "Polygon")
    throw new Error(
      "Fladen består af flere dele. Upload den fulde afgrænsning eller tegn det ønskede projektområde manuelt.",
    );
  const shape = validateProjectPolygon(candidate);
  if (!shape.valid)
    throw new Error(
      "Den valgte flade kan ikke bruges som projektgrænse. Tegn eller upload en afgrænsning.",
    );
  return {
    source,
    label: item.label,
    geometry: shape.polygon,
    properties: {
      source_id: item.id,
      dataset: source === "markblok" ? "Markblokke 2026, laglukning 4. maj" : "Matriklen2",
    },
    areaHa: computeAreaHa(shape.polygon),
    attribution:
      source === "matrikel"
        ? "Geodatastyrelsen / Datafordeleren"
        : "Landbrugs- og Fiskeristyrelsen",
    disclaimer:
      source === "matrikel"
        ? "Digital matrikelreference; præcis grænse kræver landinspektørfaglig vurdering."
        : "Markblokke 2026 er en arealreference fra laglukning 4. maj 2026, ikke en juridisk ejendomsgrænse.",
  };
}
