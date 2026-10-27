import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LineString } from "geojson";
import { Card } from "@/components/ui-bits";
import { parseGeoJson, parseKml, parseGpx } from "@/services/monitoring/upload-import-service";
import { getWatercourseVersions, saveWatercourseVersion } from "@/services/watercourse-service";
import {
  centerlineLength,
  importCenterline,
  validateCenterline,
  watercourseGeoJSON,
  type WatercourseVersion,
} from "@/services/watercourse-geometry";
import { downloadGeoJSON } from "@/services/export-service";

export function WatercoursePanel({
  projectId,
  organizationId,
  draft,
  onDraftChange,
}: {
  projectId: string;
  organizationId: string;
  draft: LineString | null;
  onDraftChange: (line: LineString | null) => void;
}) {
  const client = useQueryClient();
  const key = ["watercourse-versions", organizationId, projectId];
  const versions = useQuery({
    queryKey: key,
    queryFn: () => getWatercourseVersions(projectId, organizationId),
  });
  const latest = versions.data?.[0];
  const [source, setSource] = useState("Manuel kortdigitalisering");
  const [direction, setDirection] = useState<WatercourseVersion["direction"]>("unknown");
  const [segmentSize, setSegmentSize] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Tegn eller importér en centerlinje.");
      const geometry = validateCenterline(draft),
        total = centerlineLength(geometry);
      if (!Number.isFinite(segmentSize) || segmentSize < 1)
        throw new Error("Delstrækning skal være mindst 1 meter.");
      const segments = Array.from({ length: Math.ceil(total / segmentSize) }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `Delstrækning ${i + 1}`,
        fromM: i * segmentSize,
        toM: Math.min((i + 1) * segmentSize, total),
      }));
      if (segments.length > 1000) throw new Error("Vælg længere delstrækninger (højst 1000).");
      return saveWatercourseVersion({
        projectId,
        organizationId,
        geometry,
        version: (latest?.version ?? 0) + 1,
        direction,
        source,
        segments,
      });
    },
    onSuccess: () => {
      onDraftChange(null);
      setError(null);
      void client.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError(e.message),
  });
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const parsed = file.name.toLowerCase().endsWith(".kml")
        ? await parseKml(file)
        : file.name.toLowerCase().endsWith(".gpx")
          ? await parseGpx(file)
          : await parseGeoJson(file);
      if (parsed.errors.length) throw new Error(parsed.errors.join("; "));
      onDraftChange(importCenterline(parsed.geojson));
      setSource(file.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fejlede");
    }
  }
  return (
    <Card className="p-4 space-y-3">
      <h2 className="font-semibold">Vandløb og delstrækninger</h2>
      <p className="text-xs text-muted-foreground">
        Centerlinjen gemmes særskilt fra projektgrænse, brinkkanter, analysepolygoner og
        fotopositioner. Station 0 er linjens første punkt. Længde er kortberegnet, ikke feltopmålt.
      </p>
      {versions.isError && (
        <p role="alert" className="text-sm text-destructive">
          Centerlinjer kunne ikke hentes: {versions.error.message}
        </p>
      )}
      {latest && (
        <div className="text-sm">
          Version {latest.version}: {latest.length_m.toFixed(1)} m · {latest.segments.length}{" "}
          delstrækninger · EPSG:4326
          <br />
          <button
            className="underline"
            onClick={() =>
              downloadGeoJSON(watercourseGeoJSON(latest) as never, `vandloeb-v${latest.version}`)
            }
          >
            Hent linje og stationering (GeoJSON)
          </button>
          <br />
          <button
            className="underline"
            onClick={() => {
              onDraftChange(latest.geometry);
              setDirection(latest.direction);
              setSource(latest.source);
            }}
          >
            Brug seneste som ny version
          </button>
        </div>
      )}
      <label className="block text-sm">
        Importér GeoJSON, KML eller GPX
        <input
          type="file"
          accept=".geojson,.json,.kml,.gpx"
          onChange={(e) => void importFile(e.target.files?.[0])}
          className="block w-full text-xs mt-1"
        />
      </label>
      {draft && (
        <>
          <p className="text-sm">Ny linje: {centerlineLength(draft).toFixed(1)} m</p>
          <label className="block text-sm">
            Kilde
            <input
              className="block border rounded p-2 w-full"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Tegneretning
            <select
              className="block border rounded p-2 w-full"
              value={direction}
              onChange={(e) => setDirection(e.target.value as WatercourseVersion["direction"])}
            >
              <option value="unknown">Strømretning ukendt</option>
              <option value="downstream">Med strømmen</option>
              <option value="upstream">Mod strømmen</option>
            </select>
          </label>
          <label className="block text-sm">
            Delstrækninger, meter
            <input
              type="number"
              min="1"
              className="block border rounded p-2 w-full"
              value={segmentSize}
              onChange={(e) => setSegmentSize(e.target.valueAsNumber)}
            />
          </label>
          <button
            className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
            disabled={save.isPending || versions.isError || versions.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Gemmer…" : "Gem ny linjeversion"}
          </button>
        </>
      )}
      {(error || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? save.error?.message}
        </p>
      )}
    </Card>
  );
}
