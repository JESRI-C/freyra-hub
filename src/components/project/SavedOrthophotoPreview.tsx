import { z } from "zod";
import type { PublicBaselineSource } from "@/services/baseline/public-baseline-types";
import { projectRasterQueryPoint } from "@/services/baseline/raster-query-projection";

const Preview = z.object({
  schema: z.literal("freyra.orthophoto-preview/v1"),
  mediaType: z.literal("image/jpeg"),
  dataUrl: z
    .string()
    .max(400_030)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
  imageSha256: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.number().int().positive().max(640),
  height: z.number().int().positive().max(640),
  bbox: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]),
  crs: z.literal("EPSG:25832"),
  capturedAt: z.null(),
});

/** Render only an already-authorized, checksum-validated frozen source. No live provider calls. */
export function SavedOrthophotoPreview({
  source,
  camera,
}: {
  source: PublicBaselineSource | undefined;
  camera?: { lat: number; lng: number } | null;
}) {
  const parsed = Preview.safeParse(source?.payload);
  if (!source || source.mode === "error" || !source.payloadSha256 || !parsed.success)
    return (
      <p className="text-sm text-muted-foreground">
        Ortofoto er ikke tilgængeligt i denne gemte kildeversion.
      </p>
    );
  const data = parsed.data;
  const [west, south, east, north] = data.bbox;
  if (east <= west || north <= south)
    return (
      <p className="text-sm text-muted-foreground">
        Ortofotoets kortafgrænsning kunne ikke valideres.
      </p>
    );
  let marker: { left: number; top: number } | null = null;
  if (camera) {
    try {
      const [x, y] = projectRasterQueryPoint([camera.lng, camera.lat]);
      if (x >= west && x <= east && y >= south && y <= north)
        marker = {
          left: ((x - west) / (east - west)) * 100,
          top: ((north - y) / (north - south)) * 100,
        };
    } catch {
      /* An invalid camera coordinate never becomes a guessed marker. */
    }
  }
  return (
    <figure className="space-y-2">
      <div className="relative mx-auto w-fit max-w-full">
        <img
          src={data.dataUrl}
          width={data.width}
          height={data.height}
          alt="Gemt officielt ortofoto for projektområdet"
          className="max-h-96 max-w-full object-contain"
        />
        {marker && (
          <span
            title="Kameraposition fra originalfoto; ikke fotoets udsnit"
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow"
            style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
          />
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        GeoDanmark ortofoto · hentet {new Date(source.fetchedAt).toLocaleString("da-DK")}. Præcis
        optagedato og lokal NoData-dækning er ukendt.{" "}
        {marker && "Rød markør er kameraets position, ikke fotoets udsnit. "}Billedet bevares i
        denne kildeversion.
      </figcaption>
    </figure>
  );
}
