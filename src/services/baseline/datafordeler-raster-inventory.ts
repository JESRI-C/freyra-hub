import { z } from "zod";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { RasterQueryProjection } from "./raster-query-projection";

export const DATAFORDELER_RASTER_METADATA_ENDPOINT =
  "https://api.datafordeler.dk/FileDownloads/v1.0/GetAvailableRasterFileDownloads";
export const DATAFORDELER_RASTER_INVENTORY_SCHEMA =
  "gofreyra.datafordeler-raster-inventory/v1" as const;
export const DATAFORDELER_RASTER_ADAPTER = "datafordeler-raster-inventory/v1" as const;
export const DATAFORDELER_RASTER_DOCS =
  "https://confluence.kds.dk/display/DML/Rasterbaserede%2Bfildownload";
export const MAX_RASTER_INVENTORY_REQUESTS = 6;
export const MAX_RASTER_PAGE_BYTES = 1024 * 1024;
export const MAX_RASTER_TOTAL_BYTES = 2 * 1024 * 1024;
export const MAX_RASTER_INVENTORY_FILES = 200;
export const MAX_RASTER_PAGES_PER_PRODUCT = 2;
export const MAX_RASTER_TIMEOUT_MS = 20_000;
export const RASTER_PRODUCTS = [
  {
    register: "geodko",
    dataset: "GeoDKO10cm",
    modelVersion: 1,
    nominalPixelSizeM: 0.1,
    licence: "CC BY 4.0",
    attribution: "Klimadatastyrelsen og @geodanmark",
    licenceUrl: "https://www.geodanmark.dk/home/vejledninger/vilkaar-for-data-anvendelse/",
  },
  {
    register: "geodko",
    dataset: "GeoDKO12,5cm",
    modelVersion: 1,
    nominalPixelSizeM: 0.125,
    licence: "CC BY 4.0",
    attribution: "Klimadatastyrelsen og @geodanmark",
    licenceUrl: "https://www.geodanmark.dk/home/vejledninger/vilkaar-for-data-anvendelse/",
  },
  {
    register: "dhm",
    dataset: "Terraen",
    modelVersion: 1,
    nominalPixelSizeM: 0.4,
    licence: "CC BY 4.0",
    attribution: "Klimadatastyrelsen",
    licenceUrl: "https://datafordeler.dk/vejledning/brugervilkaar/kds-geografiske-data/",
  },
] as const;
export type RasterProduct = (typeof RASTER_PRODUCTS)[number];
export type RasterDataset = RasterProduct["dataset"];
export interface RasterInventoryInput {
  polygon: GeoJSONPolygon;
  dateFrom: string;
  dateTo: string;
  geometrySha256?: string;
}
export class RasterInventoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RasterInventoryError";
  }
}
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const NativeBox = z
  .object({
    minX: z.number().finite().min(100_000).max(1_100_000),
    maxX: z.number().finite().min(100_000).max(1_100_000),
    minY: z.number().finite().min(5_800_000).max(6_600_000),
    maxY: z.number().finite().min(5_800_000).max(6_600_000),
  })
  .strict();
const FileSchema = z
  .object({
    fileFormat: z.literal("tif"),
    id: Uuid,
    dataSetName: z.enum(["GeoDKO10cm", "GeoDKO12,5cm", "Terraen"]),
    register: z
      .string()
      .min(1)
      .max(20)
      .transform((value) => value.toLowerCase()),
    version: z.literal("1"),
    dataDeliveryNumber: z.number().int().positive(),
    fileName: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_.,-]+\.tiff?$/i),
    generationTime: z.string().datetime({ offset: true }),
    boundingBox: NativeBox,
    fileSizeInBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const PageSchema = z
  .object({
    paginationMetadata: z
      .object({
        currentPage: z.number().int().positive(),
        pageSize: z.number().int().min(1).max(100),
        totalCount: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
    availableFileDownloads: z.array(FileSchema).max(100),
  })
  .strict();

export interface RasterFileCandidate {
  id: string;
  register: string;
  dataset: RasterDataset;
  modelVersion: 1;
  dataDeliveryNumber: number;
  fileName: string;
  fileFormat: "tif";
  fileSizeInBytes: number;
  fileGeneratedAt: string;
  catalogBBoxCrs: "EPSG:25832";
  nativeBBox: [number, number, number, number];
  capturedFrom: null;
  capturedTo: null;
  verifiedRasterCrs: null;
  verifiedVerticalCrs: null;
  actualPixelSizeM: null;
  nodata: "not_checked";
  pixelCoverage: "unknown";
  rasterBytesFetched: false;
}
export interface RasterInventoryPage {
  pagination: { currentPage: number; pageSize: number; totalCount: number; totalPages: number };
  files: RasterFileCandidate[];
  delivery: number | null;
}

export function rasterProduct(dataset: RasterDataset): RasterProduct {
  const product = RASTER_PRODUCTS.find((item) => item.dataset === dataset);
  if (!product)
    throw new RasterInventoryError("UNSUPPORTED_DATASET", "Rasterdatasættet er ikke tilladt.");
  return product;
}
export function buildRasterInventoryUrl(
  dataset: RasterDataset,
  bbox: [number, number, number, number],
  page: number,
  delivery?: number,
): string {
  const product = rasterProduct(dataset);
  if (
    !bbox.every(Number.isFinite) ||
    bbox[0] >= bbox[2] ||
    bbox[1] >= bbox[3] ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > MAX_RASTER_PAGES_PER_PRODUCT ||
    (delivery !== undefined && (!Number.isInteger(delivery) || delivery < 1))
  )
    throw new RasterInventoryError("INVALID_QUERY", "Rasterkatalogets forespørgsel er ugyldig.");
  const url = new URL(DATAFORDELER_RASTER_METADATA_ENDPOINT);
  for (const [name, value] of Object.entries({
    Register: product.register,
    DataSetName: product.dataset,
    Version: "1",
    Pagenumber: page,
    MinX: bbox[0],
    MinY: bbox[1],
    MaxX: bbox[2],
    MaxY: bbox[3],
  }))
    url.searchParams.set(name, String(value));
  if (delivery !== undefined) url.searchParams.set("DataDeliveryNumber", String(delivery));
  return url.toString();
}

/** Only the observed modern camelCase DTO is accepted; no filename/date inference. */
export function parseRasterInventoryPage(
  value: unknown,
  dataset: RasterDataset,
  bbox: [number, number, number, number],
  pageNumber: number,
  expectedDelivery?: number,
): RasterInventoryPage {
  const product = rasterProduct(dataset);
  let parsed: z.infer<typeof PageSchema>;
  try {
    parsed = PageSchema.parse(value);
  } catch {
    throw new RasterInventoryError(
      "INVALID_METADATA_SCHEMA",
      "Rasterkataloget returnerede ukendte eller ugyldige metadata.",
    );
  }
  const meta = parsed.paginationMetadata;
  const expectedPages = Math.ceil(meta.totalCount / meta.pageSize);
  const expectedLength = Math.min(
    meta.pageSize,
    Math.max(0, meta.totalCount - (pageNumber - 1) * meta.pageSize),
  );
  if (
    meta.currentPage !== pageNumber ||
    (meta.totalCount > 0 ? meta.totalPages !== expectedPages : ![0, 1].includes(meta.totalPages)) ||
    parsed.availableFileDownloads.length !== expectedLength
  )
    throw new RasterInventoryError(
      "INVALID_PAGINATION",
      "Rasterkatalogets sidetal og antal filer stemmer ikke overens.",
    );
  const files = parsed.availableFileDownloads.map((file) => {
    const box = file.boundingBox;
    if (
      file.register !== product.register ||
      file.dataSetName !== product.dataset ||
      (expectedDelivery !== undefined && file.dataDeliveryNumber !== expectedDelivery) ||
      box.minX >= box.maxX ||
      box.minY >= box.maxY ||
      box.maxX < bbox[0] ||
      box.minX > bbox[2] ||
      box.maxY < bbox[1] ||
      box.minY > bbox[3]
    )
      throw new RasterInventoryError(
        "UNBOUND_FILE_METADATA",
        "En rasterfil matcher ikke datasæt, leverance eller forespørgselsområde.",
      );
    return {
      id: file.id.toLowerCase(),
      register: product.register,
      dataset: product.dataset,
      modelVersion: 1 as const,
      dataDeliveryNumber: file.dataDeliveryNumber,
      fileName: file.fileName,
      fileFormat: file.fileFormat,
      fileSizeInBytes: file.fileSizeInBytes,
      fileGeneratedAt: file.generationTime,
      catalogBBoxCrs: "EPSG:25832" as const,
      nativeBBox: [box.minX, box.minY, box.maxX, box.maxY] as [number, number, number, number],
      capturedFrom: null,
      capturedTo: null,
      verifiedRasterCrs: null,
      verifiedVerticalCrs: null,
      actualPixelSizeM: null,
      nodata: "not_checked" as const,
      pixelCoverage: "unknown" as const,
      rasterBytesFetched: false as const,
    };
  });
  const deliveries = new Set(files.map((file) => file.dataDeliveryNumber));
  if (deliveries.size > 1)
    throw new RasterInventoryError(
      "MIXED_DELIVERIES",
      "Rasterkataloget blander flere dataleverancer i samme forespørgsel.",
    );
  if (new Set(files.map((file) => file.id)).size !== files.length)
    throw new RasterInventoryError("DUPLICATE_FILE_ID", "Rasterkataloget gentager et fil-ID.");
  return { pagination: { ...meta }, files, delivery: files[0]?.dataDeliveryNumber ?? null };
}

export interface RasterProductInventory {
  register: string;
  dataset: RasterDataset;
  modelVersion: 1;
  dataDeliveryNumber: number | null;
  catalogueComplete: true;
  files: RasterFileCandidate[];
  nominalPixelSizeM: number;
  nominalSizeIsNotRasterVerified: true;
  expectedHorizontalCrs: "EPSG:25832";
  expectedVerticalCrs: "EPSG:5799" | null;
  licence: string;
  licenceUrl: string;
  attribution: string;
}
export interface RasterInventoryPayload {
  schema: typeof DATAFORDELER_RASTER_INVENTORY_SCHEMA;
  apiVersion: "v1.0";
  inventoryOnly: true;
  pixelDataNotFetched: true;
  rasterAnalysisStatus: "not_started";
  generationDatesAreNotCaptureDates: true;
  queryProjection: RasterQueryProjection;
  products: RasterProductInventory[];
  pages: {
    dataset: RasterDataset;
    page: number;
    pagination: RasterInventoryPage["pagination"];
    queryUrl: string;
    responseSha256: string;
    responseBytes: number;
  }[];
}
