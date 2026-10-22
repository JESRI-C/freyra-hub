import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap } from "leaflet";
import { useAuth } from "@/lib/auth";
import { getProjectBaseline, listProjectBaselines } from "@/lib/public-baseline.functions";
import { getSurveyRound } from "@/lib/survey-round.functions";
import { buildPlantingFromBaseline } from "@/services/planting/planting-baseline";
import { PLANTING_LITERATURE } from "@/services/planting/planting-literature";
import {
  PLANTING_NOTICE,
  type PlantingResult,
  type Suitability,
} from "@/services/planting/planting-suitability";
import { Card, CardHeader } from "@/components/ui-bits";
import { loadPlantingContext } from "./planting-context";
import "leaflet/dist/leaflet.css";

const COLORS: Record<Suitability, string> = {
  egnet: "#16803c",
  betinget: "#b77905",
  uegnet: "#b91c1c",
};
const STATUS = { complete: "hentet", partial: "delvist", unavailable: "ikke tilgængelig" } as const;
const formatHa = (value: number | null) =>
  value === null
    ? "Ukendt"
    : value.toLocaleString("da-DK", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function PlantingSuitabilityPanel({
  projectId,
  selectedRoundId,
}: {
  projectId: string | null;
  selectedRoundId?: string;
}) {
  const { user } = useAuth();
  const getBaseline = useServerFn(getProjectBaseline);
  const listBaselines = useServerFn(listProjectBaselines);
  const getRound = useServerFn(getSurveyRound);
  const [bufferM, setBufferM] = useState<10 | 20>(10);
  const [showLayer, setShowLayer] = useState(true);
  const query = useQuery({
    queryKey: ["planting-suitability", user?.id, projectId, selectedRoundId ?? "latest"],
    enabled: !!user && !!projectId,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      if (!user || !projectId) return null;
      const snapshot = await loadPlantingContext(projectId, selectedRoundId, {
        listBaselines: (id) => listBaselines({ data: { projectId: id } }),
        getBaseline: (id, snapshotId) => getBaseline({ data: { projectId: id, snapshotId } }),
        getRound: (id, roundVersionId) => getRound({ data: { projectId: id, roundVersionId } }),
      });
      if (!snapshot) return null;
      return { snapshot, result: buildPlantingFromBaseline(snapshot) };
    },
  });
  // React Query retains cached data after a failed refetch. Never display it after access fails.
  const visible = user && projectId && !query.isError ? query.data : undefined;
  const result = visible?.result;
  const snapshot = visible?.snapshot;

  return (
    <Card>
      <CardHeader title="Beplantningsegnethed" subtitle={PLANTING_NOTICE} />
      <div className="px-5 pb-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Skitsen undersøger markblokke inden for 10 eller 20 m fra den officielle vandløbslinje.
          Registreret §3-natur og eksisterende skov/trædække trækkes fra. Lavbund og kulstofrig jord
          kræver særskilt vurdering.
        </p>
        {!projectId && (
          <p role="status">
            Kobl lavbundsprojektet til kommunens sag for at bruge dens gemte offentlige data.
          </p>
        )}
        {!user && <p role="status">Log ind for at se sagens beplantningsskitse.</p>}
        {query.isLoading && <p role="status">Indlæser gemt datagrundlag…</p>}
        {query.isError && (
          <p role="status">
            Beplantningsskitsen kunne ikke åbnes. Det gemte datagrundlag bevares. Prøv igen fra
            sagen.
          </p>
        )}
        {user && projectId && query.isSuccess && !result && (
          <p role="status">
            Der er endnu ingen gemt kildeversion. Hent først offentlige data i kommunens sag.
          </p>
        )}
        {result && snapshot && (
          <>
            <p className="text-xs text-muted-foreground">
              {selectedRoundId !== undefined
                ? "Den valgte undersøgelses datagrundlag"
                : "Seneste gemte kildeversion, uafhængigt af en valgt undersøgelse"}{" "}
              · v{snapshot.version} · gemt {new Date(snapshot.createdAt).toLocaleString("da-DK")} ·
              skitsens kildedækning: {STATUS[result.status]}. Registerlag er ikke verificeret som
              tilstanden på flyvedagen.
            </p>
            <div className="flex flex-wrap gap-4 items-center">
              <label className="inline-flex gap-2 items-center text-sm">
                <input
                  type="checkbox"
                  checked={showLayer}
                  onChange={(event) => setShowLayer(event.target.checked)}
                />
                Vis beplantningslag
              </label>
              <label className="inline-flex gap-2 items-center text-sm">
                Afstand fra vandløbslinje
                <select
                  className="rounded border bg-background p-1.5"
                  value={bufferM}
                  onChange={(event) => setBufferM(Number(event.target.value) as 10 | 20)}
                >
                  <option value={10}>10 m</option>
                  <option value={20}>20 m</option>
                </select>
              </label>
            </div>
            <PlantingMap
              result={result}
              boundary={snapshot.manifest.project.polygon}
              watercourse={snapshot.manifest.reference.geometry}
              bufferM={bufferM}
              showLayer={showLayer}
            />
            <div className="flex flex-wrap gap-4 text-xs">
              {(["egnet", "betinget", "uegnet"] as const).map((classification) => (
                <span key={classification} className="inline-flex gap-1.5 items-center">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: COLORS[classification] }}
                  />
                  {classification}
                </span>
              ))}
              <span>Stiplet kant: registreret lavbund/kulstofrig jord</span>
            </div>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <caption className="text-left font-medium mb-2">
                  Delstrækninger A–E · {bufferM} m · areal i ha
                </caption>
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Delstrækning</th>
                    <th>Egnet</th>
                    <th>Betinget</th>
                    <th>Uegnet</th>
                    <th>Grundlag</th>
                  </tr>
                </thead>
                <tbody>
                  {result.reaches
                    .filter((reach) => reach.bufferM === bufferM)
                    .map((reach) => (
                      <tr key={reach.reach} className="border-b">
                        <th className="py-2 text-left">{reach.reach}</th>
                        <td>{formatHa(reach.suitableHa)}</td>
                        <td>{formatHa(reach.conditionalHa)}</td>
                        <td>{formatHa(reach.unsuitableHa)}</td>
                        <td className="text-xs text-muted-foreground">
                          {reach.reason ?? "Kortregler opgjort; faglig validering mangler."}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Kilder og hentetid</summary>
              <ul className="mt-2 space-y-3 text-xs">
                {result.sources.map((source) => (
                  <li key={source.id}>
                    <strong>
                      {source.label}: {STATUS[source.coverage]}
                    </strong>{" "}
                    ·{" "}
                    {source.fetchedAt
                      ? new Date(source.fetchedAt).toLocaleString("da-DK")
                      : "Ikke hentet"}
                    {source.sourceUrl && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline"
                          href={source.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Kilde
                        </a>
                      </>
                    )}
                    {source.warnings.map((warning) => (
                      <p key={warning} className="mt-1 text-muted-foreground">
                        {warning}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Mulige effekter – litteratur og begrænsninger
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Intervallerne er litteraturkontekst. Der beregnes ingen lokal temperatur-, N-, P- eller
            CO₂-effekt ud fra kortets hektar.
          </p>
          <ul className="mt-3 space-y-4 text-sm">
            {PLANTING_LITERATURE.map((entry) => (
              <li key={entry.effect}>
                <strong>
                  {entry.effect}: {entry.interval ?? "Ikke opgjort"}
                </strong>
                <p className="text-xs text-muted-foreground mt-1">{entry.context}</p>
                <a
                  className="text-xs underline"
                  href={entry.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {entry.citation}
                </a>
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · kontrolleret {entry.checkedAt}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Card>
  );
}

function PlantingMap({
  result,
  boundary,
  watercourse,
  bufferM,
  showLayer,
}: {
  result: PlantingResult;
  boundary: GeoJSON.Polygon;
  watercourse: GeoJSON.MultiLineString;
  bufferM: 10 | 20;
  showLayer: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const overlay = useRef<LeafletGeoJSON | null>(null);
  const [ready, setReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const features = useMemo(
    () => ({
      ...result.features,
      features: showLayer
        ? result.features.features.filter((entry) => entry.properties.bufferM === bufferM)
        : [],
    }),
    [result, bufferM, showLayer],
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void import("leaflet").then((L) => {
      if (cancelled || !element.current) return;
      const instance = L.map(element.current);
      const bounds = L.geoJSON(boundary).getBounds();
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      })
        .on("tileerror", () => setTilesFailed(true))
        .addTo(instance);
      L.geoJSON(boundary, {
        style: { color: "#475569", weight: 1, fill: false, dashArray: "4 4" },
      }).addTo(instance);
      if (
        result.sources.find((source) => source.id === "watercourse")?.coverage !== "unavailable"
      ) {
        L.geoJSON(watercourse, { style: { color: "#2563eb", weight: 2 } }).addTo(instance);
      }
      instance.fitBounds(bounds, { padding: [15, 15] });
      map.current = instance;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [boundary, watercourse, result.sources]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !ready || !map.current) return;
      if (overlay.current) map.current.removeLayer(overlay.current);
      overlay.current = L.geoJSON(features, {
        style: (item) => ({
          color: COLORS[item?.properties.suitability as Suitability] ?? "#b77905",
          weight: 2,
          fillOpacity: 0.3,
          dashArray: item?.properties.carbonRichOrLowland ? "5 3" : undefined,
        }),
        onEachFeature: (item, layer) => {
          const content = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = `${item.properties.suitability} · ${formatHa(item.properties.areaHa)} ha (skitse)`;
          content.append(title);
          for (const line of [...item.properties.reasons, PLANTING_NOTICE]) {
            const paragraph = document.createElement("p");
            paragraph.textContent = line;
            content.append(paragraph);
          }
          layer.bindPopup(content);
        },
      }).addTo(map.current);
    });
    return () => {
      cancelled = true;
    };
  }, [features, ready]);

  return (
    <div>
      <div
        ref={element}
        className="h-[420px] rounded-lg border"
        role="img"
        aria-label={`Beplantningsskitse ${bufferM} meter langs officiel vandløbslinje`}
      />
      {tilesFailed && (
        <p role="status" className="text-xs mt-1">
          Baggrundskortet er delvist utilgængeligt. Skitsens gemte geometri og kildestatus vises
          fortsat.
        </p>
      )}
      {!result.features.features.length && (
        <p role="status" className="text-sm mt-2">
          Ingen beplantningsarealer kan vises med det gemte datagrundlag.
        </p>
      )}
    </div>
  );
}
