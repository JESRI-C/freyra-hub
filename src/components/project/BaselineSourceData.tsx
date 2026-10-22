import { z } from "zod";
import {
  isSafeSentinelThumbnailUrl,
  selectSentinelPreview,
} from "@/services/baseline/sentinel-preview";
import { SavedOrthophotoPreview } from "./SavedOrthophotoPreview";
import type { PublicBaselineSource } from "@/services/baseline/public-baseline-types";
import { parseSavedWaterPlanNatureSource } from "@/services/baseline/water-plan-nature-saved-payload";
import { parseSavedPublicMonitoringStationsSource } from "@/services/baseline/public-monitoring-stations-saved-payload";

const Timestamp = z.string().datetime({ offset: true });
const Coordinates = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const Bbox = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const DmiRow = z
  .object({
    id: z.string().min(1),
    stationId: z.string().min(1),
    coordinates: Coordinates,
    parameterId: z.literal("acc_precip"),
    timeResolution: z.literal("day"),
    from: Timestamp,
    to: Timestamp,
    value: z.number().finite(),
    unit: z.literal("mm"),
    valueKind: z.enum(["amount", "trace", "invalid_negative"]),
    qcStatus: z.string().min(1).max(80),
    validity: z.boolean().nullable(),
  })
  .refine((row) => Date.parse(row.to) > Date.parse(row.from))
  .refine((row) =>
    row.valueKind === "amount"
      ? row.value >= 0
      : row.valueKind === "trace"
        ? row.value === -0.1
        : row.value < 0 && row.value !== -0.1,
  );
const DmiSummary = z
  .object({
    complete: z.boolean(),
    totalMm: z.number().finite().nonnegative().nullable(),
    requestedFrom: Timestamp,
    requestedTo: Timestamp,
    coveredFrom: Timestamp.nullable(),
    coveredTo: Timestamp.nullable(),
    dailyValueCount: z.number().int().nonnegative(),
    reasons: z.array(z.string()).max(30),
  })
  .refine((summary) =>
    summary.complete
      ? summary.totalMm !== null && summary.reasons.length === 0
      : summary.totalMm === null && summary.reasons.length > 0,
  );
const DmiSeries = z
  .object({
    unit: z.literal("mm"),
    station: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      coordinates: Coordinates,
      distanceToProjectCenterKm: z.number().finite().nonnegative(),
      withinProject: z.boolean().nullable(),
      catchmentRelevance: z.literal("not_assessed"),
    }),
    series: z.array(DmiRow).max(600),
    summary: DmiSummary,
  })
  .refine((data) => data.series.length === data.summary.dailyValueCount)
  .refine((data) => data.series.every((row) => row.stationId === data.station.id))
  .refine(
    (data) =>
      !data.summary.complete ||
      (data.series.length > 0 &&
        data.series.every(
          (row) => row.valueKind === "amount" && row.qcStatus === "manual" && row.validity === true,
        ) &&
        Math.abs(data.series.reduce((sum, row) => sum + row.value, 0) - data.summary.totalMm!) <
          0.000000001),
  );
const DmiNoStation = z.object({
  candidateCount: z.literal(0),
  reason: z.string().min(1),
  searchBbox: Bbox,
});
const SentinelCatalog = z.object({
  schema: z.literal("gofreyra.sentinel-scene-catalog/v1"),
  collection: z.literal("sentinel-2-l2a"),
  catalogComplete: z.boolean(),
  localQualityStatus: z.literal("pending"),
  scenes: z
    .array(
      z.object({
        id: z.string().min(1).max(300),
        datetime: Timestamp,
        platform: z.string().max(100).nullable(),
        globalCloudCoverPct: z.number().finite().min(0).max(100).nullable(),
        thumbnail: z
          .object({
            href: z.string().refine(isSafeSentinelThumbnailUrl),
            mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
          })
          .nullable()
          .optional(),
        localQuality: z.object({
          cloud: z.literal("pending"),
          shadow: z.literal("pending"),
          nodata: z.literal("pending"),
          usable: z.null(),
        }),
      }),
    )
    .max(150),
});
const RasterDataset = z.enum(["GeoDKO10cm", "GeoDKO12,5cm", "Terraen"]);
const NativeRasterBbox = Bbox.refine(
  ([minX, minY, maxX, maxY]) =>
    minX >= 100_000 &&
    maxX <= 1_100_000 &&
    minY >= 5_800_000 &&
    maxY <= 6_600_000 &&
    minX < maxX &&
    minY < maxY,
);
const RasterFile = z
  .object({
    id: z.string().uuid(),
    register: z.enum(["geodko", "dhm"]),
    dataset: RasterDataset,
    modelVersion: z.literal(1),
    dataDeliveryNumber: z.number().int().positive(),
    fileName: z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_.,-]+\.tiff?$/i),
    fileFormat: z.literal("tif"),
    fileSizeInBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    fileGeneratedAt: Timestamp,
    catalogBBoxCrs: z.literal("EPSG:25832"),
    nativeBBox: NativeRasterBbox,
    capturedFrom: z.null(),
    capturedTo: z.null(),
    verifiedRasterCrs: z.null(),
    verifiedVerticalCrs: z.null(),
    actualPixelSizeM: z.null(),
    nodata: z.literal("not_checked"),
    pixelCoverage: z.literal("unknown"),
    rasterBytesFetched: z.literal(false),
  })
  .strict();
const RasterProduct = z
  .object({
    register: z.enum(["geodko", "dhm"]),
    dataset: RasterDataset,
    modelVersion: z.literal(1),
    dataDeliveryNumber: z.number().int().positive().nullable(),
    catalogueComplete: z.literal(true),
    files: z.array(RasterFile).max(200),
    nominalPixelSizeM: z.number().finite().positive(),
    nominalSizeIsNotRasterVerified: z.literal(true),
    expectedHorizontalCrs: z.literal("EPSG:25832"),
    expectedVerticalCrs: z.literal("EPSG:5799").nullable(),
    licence: z.string().min(1),
    licenceUrl: z.string().url(),
    attribution: z.string().min(1),
  })
  .strict()
  .refine((product) => {
    const isTerrain = product.dataset === "Terraen";
    return (
      product.register === (isTerrain ? "dhm" : "geodko") &&
      product.expectedVerticalCrs === (isTerrain ? "EPSG:5799" : null) &&
      (product.files.length === 0
        ? product.dataDeliveryNumber === null
        : product.dataDeliveryNumber !== null) &&
      product.files.every(
        (file) =>
          file.dataset === product.dataset &&
          file.register === product.register &&
          file.dataDeliveryNumber === product.dataDeliveryNumber,
      )
    );
  });
const RasterInventory = z
  .object({
    schema: z.literal("gofreyra.datafordeler-raster-inventory/v1"),
    apiVersion: z.literal("v1.0"),
    inventoryOnly: z.literal(true),
    pixelDataNotFetched: z.literal(true),
    rasterAnalysisStatus: z.literal("not_started"),
    generationDatesAreNotCaptureDates: z.literal(true),
    queryProjection: z
      .object({
        sourceCrs: z.literal("EPSG:4326"),
        sourceAxisOrder: z.literal("lng-lat"),
        queryCrs: z.literal("EPSG:25832"),
        queryAxisOrder: z.literal("easting-northing"),
        bbox: NativeRasterBbox,
        method: z.literal("proj4-grs80-catalog-envelope/v1"),
        edgeSampleStepDegrees: z.number().finite().positive(),
        projectedSampleCount: z.number().int().positive().max(20_000),
        queryBufferM: z.number().finite().nonnegative(),
        bboxRounding: z.literal("outward-to-integer-metres"),
        datumAssumption: z.literal("wgs84-treated-as-etrs89-without-epoch-or-grid-shift"),
        surveyAccuracyVerified: z.literal(false),
        heightTransformed: z.literal(false),
      })
      .strict(),
    products: z.array(RasterProduct).length(3),
    pages: z
      .array(
        z
          .object({
            dataset: RasterDataset,
            page: z.number().int().min(1).max(2),
            queryUrl: z
              .string()
              .url()
              .refine((value) => {
                let url: URL;
                try {
                  url = new URL(value);
                } catch {
                  return false;
                }
                return (
                  url.origin === "https://api.datafordeler.dk" &&
                  url.pathname === "/FileDownloads/v1.0/GetAvailableRasterFileDownloads" &&
                  !url.username &&
                  !url.password &&
                  !url.hash &&
                  Array.from(url.searchParams.keys()).every((key) =>
                    [
                      "Register",
                      "DataSetName",
                      "Version",
                      "Pagenumber",
                      "MinX",
                      "MinY",
                      "MaxX",
                      "MaxY",
                      "DataDeliveryNumber",
                    ].includes(key),
                  )
                );
              }),
            responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
            responseBytes: z
              .number()
              .int()
              .positive()
              .max(1024 * 1024),
            pagination: z
              .object({
                currentPage: z.number().int().min(1).max(2),
                pageSize: z.number().int().min(1).max(100),
                totalCount: z.number().int().min(0).max(200),
                totalPages: z.number().int().min(0).max(2),
              })
              .strict(),
          })
          .strict(),
      )
      .min(3)
      .max(6),
  })
  .strict()
  .refine((data) => {
    const files = data.products.flatMap((product) => product.files);
    return (
      new Set(data.products.map((product) => product.dataset)).size === 3 &&
      files.length <= 200 &&
      new Set(files.map((file) => file.id)).size === files.length &&
      data.products.every((product) => {
        const pages = data.pages.filter((page) => page.dataset === product.dataset);
        if (pages.length === 0) return false;
        const first = pages[0].pagination;
        const expectedPages = Math.ceil(product.files.length / first.pageSize);
        return (
          pages.length === Math.max(first.totalPages, 1) &&
          new Set(pages.map((page) => page.page)).size === pages.length &&
          pages.every(
            (page) =>
              page.page === page.pagination.currentPage &&
              page.pagination.totalCount === product.files.length &&
              page.pagination.pageSize === first.pageSize &&
              page.pagination.totalPages === first.totalPages &&
              page.page <= Math.max(first.totalPages, 1),
          ) &&
          (product.files.length === 0
            ? [0, 1].includes(first.totalPages)
            : first.totalPages === expectedPages)
        );
      })
    );
  });

const reasonLabels: Record<string, string> = {
  pagination_incomplete: "Alle sider er ikke hentet.",
  no_daily_values: "Der er ingen døgnværdier.",
  trace: "Spor af nedbør har ingen præcis mængde.",
  invalid_negative: "Serien indeholder en ugyldig negativ værdi.",
  invalid_value: "Serien indeholder en værdi markeret ugyldig.",
  validity_unknown: "Gyldigheden er ikke angivet for alle døgnværdier.",
  quality_control_incomplete: "DMI's kvalitetskontrol er ikke afsluttet for alle værdier.",
  incomplete_daily_interval: "Et interval dækker ikke et helt døgn.",
  incomplete_daily_inputs: "Et døgn har et ufuldstændigt observationsgrundlag.",
  gap_or_overlap: "Døgnintervallerne har huller eller overlap.",
  mixed_stations: "Serien indeholder forskellige stationer.",
  requested_period_not_exact_daily_boundaries: "Periodens grænser følger ikke hele DMI-døgn.",
};
const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});
function dateText(value: string): string {
  return `${dateFormatter.format(new Date(value))} UTC`;
}
function numberText(value: number): string {
  return value.toLocaleString("da-DK", { maximumFractionDigits: 3 });
}
function InvalidPayload() {
  return (
    <p role="alert" className="text-sm text-destructive">
      De gemte kildedata mangler eller har et ugyldigt format. Dataværdier kan ikke vises; hent en
      ny version eller få denne version kontrolleret.
    </p>
  );
}

function DmiData({ source }: { source: PublicBaselineSource }) {
  const parsed = DmiSeries.safeParse(source.payload);
  if (!parsed.success) {
    if (source.status === "no_coverage" && DmiNoStation.safeParse(source.payload).success) {
      return (
        <p className="text-sm text-muted-foreground">
          Der blev ikke fundet en egnet nedbørsstation i søgeområdet. Der er ingen nedbørsserie
          eller periodesum.
        </p>
      );
    }
    return <InvalidPayload />;
  }
  const { station, series, summary } = parsed.data;
  if (
    source.coverage.returnedCount !== series.length ||
    (source.status === "no_coverage" && series.length > 0)
  )
    return <InvalidPayload />;
  if (
    summary.complete &&
    (!source.coverage.paginationComplete || source.coverage.temporal !== "complete")
  )
    return <InvalidPayload />;
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p>
          <strong>{station.name}</strong> · Station {station.id}
        </p>
        <p className="text-xs text-muted-foreground">
          {numberText(station.distanceToProjectCenterKm)} km fra projektets midtpunkt ·{" "}
          {station.withinProject === true
            ? "i projektområdet"
            : station.withinProject === false
              ? "uden for projektområdet"
              : "placering i projektområdet uafklaret"}
        </p>
        <p className="text-xs text-muted-foreground">
          Stationens relevans for oplandet kræver faglig kontrol. Stationsnedbør er ikke lokal
          vandføring.
        </p>
      </div>
      {summary.complete ? (
        <p>
          <strong>Periodesum: {numberText(summary.totalMm!)} mm</strong>
          <br />
          <span className="text-xs text-muted-foreground">
            {dateText(summary.requestedFrom)} – {dateText(summary.requestedTo)} · {series.length}{" "}
            sammenhængende DMI-døgn.
          </span>
        </p>
      ) : (
        <div className="rounded border border-amber-300/50 bg-amber-50/30 p-2 dark:bg-amber-950/10">
          <p className="font-medium">Periodesum kan ikke beregnes på dette grundlag.</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
            {summary.reasons.map((reason) => (
              <li key={reason}>
                {reasonLabels[reason] ?? "Datagrundlaget opfylder ikke kravene til en fuld sum."}
              </li>
            ))}
          </ul>
        </div>
      )}
      {series.length === 0 ? (
        <p className="text-muted-foreground">
          Der er ingen nedbørsværdier for den valgte station og periode.
        </p>
      ) : (
        <div className="max-h-80 overflow-auto rounded border">
          <table className="w-full text-xs">
            <caption className="p-2 text-left text-muted-foreground">
              Officielle døgnværdier. DMI's kvalitetskontrollerede data kan indeholde interpolation;
              tidspunktet nedenfor er døgnintervallet.
            </caption>
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th scope="col" className="p-2">
                  Døgninterval (UTC)
                </th>
                <th scope="col" className="p-2">
                  Nedbør
                </th>
                <th scope="col" className="p-2">
                  Kvalitetskontrol
                </th>
                <th scope="col" className="p-2">
                  Gyldighed
                </th>
              </tr>
            </thead>
            <tbody>
              {series.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-2">
                    <time dateTime={row.from}>{dateText(row.from)}</time>
                    <br />
                    til <time dateTime={row.to}>{dateText(row.to)}</time>
                  </td>
                  <td className="p-2">
                    {row.valueKind === "trace"
                      ? "Spor af nedbør (<0,1 mm)"
                      : row.valueKind === "invalid_negative"
                        ? "Ugyldig negativ værdi"
                        : `${numberText(row.value)} mm`}
                  </td>
                  <td className="p-2">
                    {row.qcStatus === "manual"
                      ? "Manuel kontrol"
                      : row.qcStatus === "none"
                        ? "Ikke kontrolleret"
                        : `Ukendt kontrolstatus (${row.qcStatus})`}
                  </td>
                  <td className="p-2">
                    {row.validity === true
                      ? "Gyldig"
                      : row.validity === false
                        ? "Ugyldig"
                        : "Ikke angivet"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SentinelData({ source }: { source: PublicBaselineSource }) {
  const parsed = SentinelCatalog.safeParse(source.payload);
  if (!parsed.success) return <InvalidPayload />;
  const { scenes, catalogComplete } = parsed.data;
  const preview = selectSentinelPreview(scenes, source.query.requestedFrom);
  if (
    source.coverage.returnedCount !== scenes.length ||
    (source.status === "no_coverage" && scenes.length > 0)
  )
    return <InvalidPayload />;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Scenerne er geografiske kandidater. Lokal kontrol af skyer, skygger og manglende pixels
        afventer; der er ingen godkendt NDVI eller lokal måling.
      </p>
      {preview?.thumbnail ? (
        <figure className="rounded border p-2">
          <img
            src={preview.thumbnail.href}
            alt={`Sentinel-2 oversigtsbillede ${preview.id}`}
            className="max-h-80 w-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <figcaption className="mt-2 text-xs text-muted-foreground">
            {preview.globalCloudCoverPct === 0
              ? "Nærmeste scene med 0 % skyer i kataloget"
              : "Nærmeste scene med højst 10 % skyer i kataloget"}{" "}
            · {dateText(preview.datetime)} · Hele scenen, ikke et udsnit af vandløbet. Lokal
            skyfrihed og pixelkvalitet er ikke verificeret.
            {!catalogComplete && " Udvalgt blandt de hentede scener; en nærmere scene kan mangle."}
          </figcaption>
        </figure>
      ) : (
        <p className="text-xs text-muted-foreground">
          Intet tilgængeligt kildebillede med lav global skydækning i de hentede scener. Skyfri
          scene og NDVI-pixelanalyse afventer.
        </p>
      )}
      {!catalogComplete && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Kun en del af scenekataloget er hentet. Flere scener kan findes i perioden.
        </p>
      )}
      {scenes.length === 0 ? (
        <p className="text-muted-foreground">
          {catalogComplete
            ? "Ingen satellitscener fundet for området og perioden."
            : "Ingen scener i de hentede sider. Kataloget er ufuldstændigt."}
        </p>
      ) : (
        <div className="max-h-80 overflow-auto rounded border">
          <table className="w-full text-xs">
            <caption className="p-2 text-left text-muted-foreground">
              Global skyprocent gælder hele scenen og siger ikke, om projektområdet er skyfrit.
            </caption>
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th scope="col" className="p-2">
                  Scene-ID
                </th>
                <th scope="col" className="p-2">
                  Optagelse (UTC)
                </th>
                <th scope="col" className="p-2">
                  Hele scenens skyer
                </th>
                <th scope="col" className="p-2">
                  Lokal brugbarhed
                </th>
              </tr>
            </thead>
            <tbody>
              {scenes.map((scene) => (
                <tr key={scene.id} className="border-b last:border-0">
                  <td className="p-2 break-all">
                    {scene.id}
                    {scene.platform && (
                      <span className="block text-muted-foreground">{scene.platform}</span>
                    )}
                  </td>
                  <td className="p-2">
                    <time dateTime={scene.datetime}>{dateText(scene.datetime)}</time>
                  </td>
                  <td className="p-2">
                    {scene.globalCloudCoverPct === null
                      ? "Ukendt"
                      : `${numberText(scene.globalCloudCoverPct)} %`}
                  </td>
                  <td className="p-2">Afventer lokal kontrol</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RasterData({ source }: { source: PublicBaselineSource }) {
  const parsed = RasterInventory.safeParse(source.payload);
  if (!parsed.success) return <InvalidPayload />;
  const { products, queryProjection, pages } = parsed.data;
  const count = products.reduce((sum, product) => sum + product.files.length, 0);
  if (
    source.status !== "partial" ||
    source.coverage.returnedCount !== count ||
    !source.coverage.paginationComplete ||
    source.coverage.spatial !== "unknown" ||
    source.coverage.temporal !== "unknown" ||
    source.coverage.observedFrom !== null ||
    source.coverage.observedTo !== null
  )
    return <InvalidPayload />;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-amber-300/50 bg-amber-50/30 p-2 dark:bg-amber-950/10">
        <p className="font-medium">{count} filmetadata · 0 rasterbytes hentet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Kataloget viser kandidatfiler, ikke validerede billeder. Faktisk optagedato, NoData,
          pixeldækning, rasterets opløsning og koordinat-/højdesystem er endnu ukendte. Terrænkoter
          og hældning er ikke beregnet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Filgenerering og dataleverance er ikke optagedato. Der er ingen bekræftet dækning af
          undersøgelsesperioden.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Katalogområde ({queryProjection.queryCrs}, øst/nord i meter):{" "}
        {queryProjection.bbox.map(numberText).join(" · ")}. Buffer{" "}
        {numberText(queryProjection.queryBufferM)} m · {pages.length} metadatasider.
        Koordinatomregningen bruges til filsøgning; opmålingsnøjagtighed og højder er ikke
        valideret.
      </p>
      {products.map((product) => (
        <section key={product.dataset} className="space-y-2">
          <p className="font-medium">
            {product.dataset === "Terraen" ? "DHM Terræn" : product.dataset} ·{" "}
            {product.files.length} filmetadata
          </p>
          <p className="text-xs text-muted-foreground">
            Register {product.register} · Model {product.modelVersion} · Leverance{" "}
            {product.dataDeliveryNumber ?? "ikke angivet"}. Nominel produktopløsning{" "}
            {numberText(product.nominalPixelSizeM)} m; ikke kontrolleret i rasterpixels.
          </p>
          {product.files.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ingen kandidatfiler i katalogforespørgslen. Det dokumenterer ikke manglende data i
              området.
            </p>
          ) : (
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-xs">
                <caption className="p-2 text-left text-muted-foreground">
                  Gemte filmetadata. Filgenereringstidspunktet beskriver ikke billedets optagelse.
                </caption>
                <thead>
                  <tr className="border-b bg-muted/30 text-left">
                    <th scope="col" className="p-2">
                      Kildefil
                    </th>
                    <th scope="col" className="p-2">
                      Katalogets afgrænsning (EPSG:25832)
                    </th>
                    <th scope="col" className="p-2">
                      Filgenerering (UTC)
                    </th>
                    <th scope="col" className="p-2">
                      Faktisk optagedato
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.files.map((file) => (
                    <tr key={file.id} className="border-b last:border-0">
                      <td className="p-2 break-all">
                        {file.fileName}
                        <span className="block text-muted-foreground">Fil-ID {file.id}</span>
                        <span className="block text-muted-foreground">
                          Model {file.modelVersion} · Leverance {file.dataDeliveryNumber}
                        </span>
                      </td>
                      <td className="p-2">{file.nativeBBox.map(numberText).join(" · ")}</td>
                      <td className="p-2">
                        <time dateTime={file.fileGeneratedAt}>
                          {dateText(file.fileGeneratedAt)}
                        </time>
                      </td>
                      <td className="p-2">Ukendt</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function WaterPlanNatureData({ source }: { source: PublicBaselineSource }) {
  const data = parseSavedWaterPlanNatureSource(source);
  if (!data) return <InvalidPayload />;
  const titles = {
    "protected-nature": "Naturregistreringer",
    "protected-watercourses": "Registreringer af beskyttede vandløb",
    "vp3-watercourses": "Vandområder fra vandplanen",
  };
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-amber-300/50 bg-amber-50/30 p-2 dark:bg-amber-950/10">
        <p className="font-medium">{source.coverage.returnedCount} registreringskandidater</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Registreringerne er fundet i søgeområdet. Placering i projektpolygonen og sammenhæng med
          den kommunale delstrækning afventer faglig kontrol. Der er ingen juridisk vurdering eller
          beregnede arealer, længder og scorer.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Dækning af undersøgelsesperioden er ukendt. Registrerings-, system-, plan- og hentetid er
          forskellige tidspunkter og dokumenterer ikke en ny besigtigelse. Manglende registreringer
          betyder ikke ubeskyttet natur eller god tilstand.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Søgeområde ({data.queryProjection.queryCrs}, øst/nord i meter):{" "}
        {data.queryProjection.bbox.map(numberText).join(" · ")}. Buffer{" "}
        {numberText(data.queryProjection.queryBufferM)} m. Native kildegeometrier er bevaret;
        opmålingsnøjagtighed og højder er ikke valideret.
      </p>
      {data.products.map((product) => (
        <section key={product.id} className="space-y-2">
          <p className="font-medium">
            {titles[product.id]} · {product.candidates.length}{" "}
            {product.candidates.length === 1 ? "kandidat" : "kandidater"}
          </p>
          <p className="text-xs text-muted-foreground">
            {product.attribution} ·{" "}
            <a
              href={product.licenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {product.licence}
            </a>
            {product.id === "vp3-watercourses" && (
              <span className="block">
                Planversion {product.datasetVersion} · Offentliggjort{" "}
                <time dateTime={product.planPublishedDate!}>18.12.2025</time> · Gældende fra{" "}
                <time dateTime={product.planEffectiveFrom!}>01.01.2026</time>. Datoen for den
                konkrete tilstandsvurdering er ukendt.
              </span>
            )}
          </p>
          {product.candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ingen kandidater i denne gemte kildeforespørgsel. Det fastslår ikke fravær af
              beskyttet natur eller vandplanforhold.
            </p>
          ) : (
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-xs">
                <caption className="p-2 text-left text-muted-foreground">
                  {product.id === "vp3-watercourses"
                    ? "Miljømål og vurderet tilstand er separate kildeoplysninger, ikke nye lokale målinger. Vandområde-ID er ikke en godkendt kommunal delstrækning."
                    : "Registreringsstatus er kildens egen status. Besigtigelse og registervedligeholdelse er adskilt; ingen ny besigtigelse er verificeret."}
                </caption>
                <thead>
                  <tr className="border-b bg-muted/30 text-left">
                    {product.id === "vp3-watercourses" ? (
                      <>
                        <th scope="col" className="p-2">
                          Vandområde
                        </th>
                        <th scope="col" className="p-2">
                          Økologisk miljømål
                        </th>
                        <th scope="col" className="p-2">
                          Økologisk tilstand
                        </th>
                        <th scope="col" className="p-2">
                          Kemisk miljømål
                        </th>
                        <th scope="col" className="p-2">
                          Kemisk tilstand
                        </th>
                      </>
                    ) : (
                      <>
                        <th scope="col" className="p-2">
                          Registrering
                        </th>
                        <th scope="col" className="p-2">
                          Kildestatus
                        </th>
                        <th scope="col" className="p-2">
                          Registreret / systemversion (UTC)
                        </th>
                        <th scope="col" className="p-2">
                          Besigtigelse
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {product.candidates.map((candidate) => (
                    <tr key={candidate.featureId} className="border-b last:border-0">
                      {candidate.kind === "vp3-watercourses" ? (
                        <>
                          <td className="p-2 break-all">
                            {candidate.waterbodyId}
                            <span className="block text-muted-foreground">
                              {candidate.sourceName ?? "Navn ukendt"}
                            </span>
                            <span className="block text-muted-foreground">
                              Vurderingsdato: Ukendt
                            </span>
                          </td>
                          <td className="p-2">{candidate.planGoals.ecological ?? "Ukendt"}</td>
                          <td className="p-2">{candidate.assessedState.ecological ?? "Ukendt"}</td>
                          <td className="p-2">{candidate.planGoals.chemical ?? "Ukendt"}</td>
                          <td className="p-2">{candidate.assessedState.chemical ?? "Ukendt"}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-2 break-all">
                            {candidate.natureType?.name ?? candidate.themeName ?? "Type ukendt"}
                            <span className="block text-muted-foreground">
                              Objekt {candidate.objectId}
                            </span>
                            <span className="block text-muted-foreground">
                              Version {candidate.versionId}
                            </span>
                          </td>
                          <td className="p-2">
                            {candidate.status.interpretation === "unknown"
                              ? "Ukendt"
                              : candidate.status.name}
                            <span className="block text-muted-foreground">
                              Ingen juridisk godkendelse
                            </span>
                          </td>
                          <td className="p-2">
                            Registreret:{" "}
                            {candidate.rawDates.registeredAt
                              ? dateText(candidate.rawDates.registeredAt)
                              : "Ukendt"}
                            <span className="block text-muted-foreground">
                              Systemversion fra:{" "}
                              {candidate.rawDates.systemValidFrom
                                ? dateText(candidate.rawDates.systemValidFrom)
                                : "Ukendt"}
                            </span>
                          </td>
                          <td className="p-2">
                            {candidate.inspection?.status === "reported_date" &&
                            candidate.inspection.reportedDate
                              ? `Kildens besigtigelsesdato: ${dateText(candidate.inspection.reportedDate)}`
                              : "Besigtigelsesdato: Ukendt"}
                            <span className="block text-muted-foreground">
                              Ny besigtigelse er ikke verificeret
                            </span>
                            {candidate.registryMaintenance && (
                              <span className="block text-muted-foreground">
                                Registervedligeholdelse:{" "}
                                {candidate.registryMaintenance.status ?? "Ukendt"}
                                {candidate.registryMaintenance.rawDate
                                  ? ` · ${dateText(candidate.registryMaintenance.rawDate)}`
                                  : " · Dato ukendt"}
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Kildeproveniens · {data.pages.length} gemte sider
        </summary>
        <p className="mt-1">
          Alle forventede registreringer på de modtagne sider er gemt. Kilden tilbyder ikke en
          transaktionssikker snapshot; registreringer kan være ændret mellem hentningerne.
        </p>
        <ul className="mt-2 space-y-2">
          {data.pages.map((page) => (
            <li key={`${page.productId}-${page.startIndex}`} className="break-all">
              <a
                href={page.queryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {titles[page.productId]} · Fra indeks {page.startIndex} · {page.numberReturned}{" "}
                registreringer
              </a>
              <span className="block">Kildens tidspunkt: {dateText(page.serverTimestamp)}</span>
              <span className="block">SHA-256: {page.responseSha256}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function PublicMonitoringStationsData({ source }: { source: PublicBaselineSource }) {
  const data = parseSavedPublicMonitoringStationsSource(source);
  if (!data)
    return (
      <p role="alert" className="text-sm text-destructive">
        De gemte stedoplysninger mangler eller har et ugyldigt format. Der vises ingen
        stedkandidater.
      </p>
    );
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">
        Offentlige undersøgelsessteder · {data.product.candidates.length} stedkandidater
      </p>
      <p className="text-muted-foreground">
        Stednumrene kan bruges til at finde mulige supplerende kilder. Stedtype og tilknytning til
        vandløbet eller oplandet skal verificeres, før en kilde bruges i vurderingen.
      </p>
      <p className="text-muted-foreground">
        Vandstand og vandføring er ikke hentet. Stederne dokumenterer ingen måledækning i den valgte
        periode.
      </p>
      <p className="text-xs text-muted-foreground">
        Undersøgelsesperiode: {data.requestedPeriod.from}–{data.requestedPeriod.to}. Aktuelt
        register hentet {dateText(source.fetchedAt)}; hentetidspunktet er ikke et måletidspunkt.
      </p>
      {data.product.candidates.length === 0 ? (
        <p className="text-muted-foreground">
          Ingen stedkandidater i denne gemte kildeforespørgsel. Det fastslår ikke fravær af
          målestationer i andre registre eller manglende vandføring.
        </p>
      ) : (
        <div className="max-h-80 overflow-auto rounded border">
          <table className="w-full text-xs">
            <caption className="p-2 text-left text-muted-foreground">
              Stationsnummeret identificerer et offentligt undersøgelsessted. Det bekræfter ikke en
              hydrometrisk station. Navne er udeladt fra dette datagrundlag.
            </caption>
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th scope="col" className="p-2">
                  Stationsnummer
                </th>
                <th scope="col" className="p-2">
                  Sted-ID
                </th>
                <th scope="col" className="p-2">
                  Verifikation
                </th>
              </tr>
            </thead>
            <tbody>
              {data.product.candidates.map((candidate) => (
                <tr key={candidate.siteUuid} className="border-b last:border-0">
                  <td className="p-2">{candidate.stationNumber}</td>
                  <td className="p-2 break-all">{candidate.siteUuid}</td>
                  <td className="p-2">
                    Stedtype: Ukendt
                    <span className="block text-muted-foreground">
                      Vandløb og opland: Afventer kontrol
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Kilde og afgrænsning · {data.pages.length} gemte sider
        </summary>
        <p className="mt-2">
          {data.product.attribution} ·{" "}
          <a
            href={data.product.licenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {data.product.licence}
          </a>
          . Søgeområdet er et bufferet kortudsnit, som ikke bekræfter den kommunale delstrækning
          eller et opland.
        </p>
        <p className="mt-1">
          Native punkter er bevaret i {data.queryProjection.queryCrs}. Forespørgslen anvender en
          erklæret datumantagelse; opmålingsnøjagtighed og højder er ikke verificeret.
        </p>
        <p className="mt-1">
          De modtagne sider er gemt med antal- og ID-kontrol. Registeret kan være ændret mellem
          hentningerne.
        </p>
        <ul className="mt-2 space-y-2">
          {data.pages.map((page) => (
            <li key={page.startIndex} className="break-all">
              <a
                href={page.queryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Kildeside · {page.numberReturned} stedkandidater
              </a>
              <span className="block">
                Kildens katalogtidspunkt: {dateText(page.serverTimestamp)}
              </span>
              <span className="block">SHA-256: {page.responseSha256}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Read only: these values come from the selected immutable source snapshot, never a new fetch. */
export function BaselineSourceData({ source }: { source: PublicBaselineSource }) {
  if (
    ![
      "dmi-historical",
      "sentinel-2-scenes",
      "orthophoto-terrain",
      "water-plan-nature",
      "public-monitoring-stations",
      "orthophoto-preview",
      "planting-markblocks",
      "planting-lowland",
      "planting-woodland",
    ].includes(source.id)
  )
    return null;
  if (
    source.mode === "preview" ||
    source.status === "not_implemented" ||
    source.status === "not_configured"
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        Kilden er endnu ikke hentet eller tilsluttet. Der er ingen anvendelige dataværdier.
      </p>
    );
  }
  if (source.mode === "error" || (source.error && source.retrieval?.mode !== "saved_fallback")) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Kilden kunne ikke hentes. Der vises ingen dataværdier fra denne hentning.
      </p>
    );
  }
  if (source.id === "dmi-historical") return <DmiData source={source} />;
  if (source.id === "sentinel-2-scenes") return <SentinelData source={source} />;
  if (source.id === "orthophoto-preview") return <SavedOrthophotoPreview source={source} />;
  if (source.id.startsWith("planting-"))
    return (
      <p className="text-sm text-muted-foreground">
        {source.coverage.returnedCount ?? "Ukendt antal"} gemte registergeometrier. Se arealerne i
        beplantningsvisningen.{" "}
        {source.coverage.paginationComplete
          ? "Alle poster i det afgrænsede opslag er modtaget."
          : "Registerudsnittet er ufuldstændigt."}
      </p>
    );
  if (source.id === "water-plan-nature") return <WaterPlanNatureData source={source} />;
  if (source.id === "public-monitoring-stations")
    return <PublicMonitoringStationsData source={source} />;
  return <RasterData source={source} />;
}
