import { buildRasterQueryProjection } from "./raster-query-projection";
import { baselineSha256 } from "./public-baseline-service";
import type { PublicBaselineSource } from "./public-baseline-types";
import { bytesSha256, PublicReadError, readPublicBytes } from "./bounded-public-read.server";
import type { GeoJSONPolygon } from "@/lib/supabase/types";

export const ORTHOPHOTO_WMS = "https://wms.datafordeler.dk/GeoDanmarkOrto/orto_foraar/1.0.0/WMS";

/** A frozen small WMS image. Credential never enters the manifest, URL or browser. */
export async function fetchOrthophotoPreviewSource(
  input: { polygon: GeoJSONPolygon; dateFrom: string; dateTo: string; geometrySha256?: string },
  options: { fetchImpl?: typeof fetch; now?: () => string } = {},
): Promise<PublicBaselineSource> {
  const projection = buildRasterQueryProjection(input.polygon);
  const geometrySha256 = await baselineSha256(input.polygon);
  if (input.geometrySha256 && input.geometrySha256 !== geometrySha256)
    throw new Error("Ortofotoets område matcher ikke sagen.");
  const positions = input.polygon.coordinates.flat();
  const bbox: [number, number, number, number] = [
    Math.min(...positions.map((p) => p[0])),
    Math.min(...positions.map((p) => p[1])),
    Math.max(...positions.map((p) => p[0])),
    Math.max(...positions.map((p) => p[1])),
  ];
  const source: PublicBaselineSource = {
    id: "orthophoto-preview",
    mode: "live",
    status: "partial",
    provider: "Klimadatastyrelsen / GeoDanmark",
    dataset: "Ortofoto forår · gemt oversigtsbillede",
    datasetVersion: null,
    licence: "Vilkår for anvendelse af GeoDanmark grunddata",
    attribution: "GeoDanmark / Klimadatastyrelsen",
    sourceUrl: ORTHOPHOTO_WMS,
    sourceModifiedAt: null,
    fetchedAt: (options.now ?? (() => new Date().toISOString()))(),
    adapterVersion: "orthophoto-wms-preview/v1",
    query: { geometrySha256, bbox, requestedFrom: input.dateFrom, requestedTo: input.dateTo },
    coverage: {
      spatial: "partial",
      temporal: "unknown",
      observedFrom: null,
      observedTo: null,
      paginationComplete: true,
      returnedCount: 1,
    },
    quality: {
      evidenceKind: "official_registration",
      method: "frozen-wms-jpeg-context",
      warnings: [
        "Et ortofoto-oversigtsbillede er gemt. Den præcise optagedato og NoData-dækning er ikke oplyst i WMS-svaret; billedet dokumenterer ikke i sig selv forholdene på flyvedagen.",
        "Koordinatomregningen bruger WGS84 som ETRS89 uden epochkorrektion. Billedet er til visuel sammenligning, ikke opmåling.",
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  const apiKey = process.env.DATAFORDELER_API_KEY?.trim();
  try {
    if (!apiKey) throw new PublicReadError("NOT_CONFIGURED");
    const [minX, minY, maxX, maxY] = projection.bbox;
    const width = 640,
      height = Math.max(64, Math.min(640, Math.round((width * (maxY - minY)) / (maxX - minX))));
    const url = new URL(ORTHOPHOTO_WMS);
    url.search = new URLSearchParams({
      apikey: apiKey,
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetMap",
      BBOX: projection.bbox.join(","),
      CRS: "EPSG:25832",
      WIDTH: String(width),
      HEIGHT: String(height),
      STYLES: "",
      FORMAT: "image/jpeg",
      LAYERS: "orto_foraar",
    }).toString();
    const bytes = await readPublicBytes(url, {
      fetchImpl: options.fetchImpl,
      maxBytes: 300_000,
      mediaType: "image/jpeg",
    });
    if (
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff ||
      bytes[bytes.length - 1] !== 0xd9
    )
      throw new PublicReadError("INVALID_IMAGE");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    source.payload = {
      schema: "freyra.orthophoto-preview/v1",
      mediaType: "image/jpeg",
      dataUrl: `data:image/jpeg;base64,${btoa(binary)}`,
      imageSha256: await bytesSha256(bytes),
      width,
      height,
      bbox: projection.bbox,
      crs: "EPSG:25832",
      capturedAt: null,
      layer: "orto_foraar",
      documentationUrl:
        "https://datafordeler.dk/dataoversigt/geodanmark-ortofoto/ortofoto-foraar-wms/",
    };
    source.payloadSha256 = await baselineSha256(source.payload);
    return source;
  } catch (error) {
    const code = error instanceof PublicReadError ? error.code : "UNAVAILABLE";
    return {
      ...source,
      mode: "error",
      status:
        code === "NOT_CONFIGURED" ? "not_configured" : code === "TIMEOUT" ? "timeout" : "failed",
      coverage: {
        ...source.coverage,
        spatial: "unknown",
        paginationComplete: false,
        returnedCount: null,
      },
      error: {
        code,
        message:
          code === "NOT_CONFIGURED"
            ? "Serveradgang til ortofoto mangler."
            : "Ortofoto kunne ikke hentes. De øvrige kilder er bevaret.",
      },
    };
  }
}
