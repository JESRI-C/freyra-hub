import { z } from "zod";
import type { PublicBaselineSource } from "@/services/baseline/public-baseline-types";

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
          (row) =>
            row.valueKind === "amount" && row.qcStatus === "manual" && row.validity !== false,
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

const reasonLabels: Record<string, string> = {
  pagination_incomplete: "Alle sider er ikke hentet.",
  no_daily_values: "Der er ingen døgnværdier.",
  trace: "Spor af nedbør har ingen præcis mængde.",
  invalid_negative: "Serien indeholder en ugyldig negativ værdi.",
  invalid_value: "Serien indeholder en værdi markeret ugyldig.",
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

/** Read only: these values come from the selected immutable source snapshot, never a new fetch. */
export function BaselineSourceData({ source }: { source: PublicBaselineSource }) {
  if (source.id !== "dmi-historical" && source.id !== "sentinel-2-scenes") return null;
  if (source.mode === "error" || source.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Kilden kunne ikke hentes. Der vises ingen dataværdier fra denne hentning.
      </p>
    );
  }
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
  return source.id === "dmi-historical" ? (
    <DmiData source={source} />
  ) : (
    <SentinelData source={source} />
  );
}
