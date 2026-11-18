import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/supabase/types";
import { validateProjectPolygon } from "@/services/geo-service";
import { listObservations } from "@/services/monitoring/observations-service";
import {
  listNatureSurveyAreas,
  NATURE_SURVEY_OBSERVATION,
  saveNatureSurveyArea,
  saveNatureSurveyObservation,
} from "@/services/nature-survey-service";
import type { GeoJsonPolygon, Zone } from "@/services/zones-service";
import type { DrawMode } from "@/components/maps/MapEditorMap";

const SurveyMap = lazy(() =>
  import("@/components/maps/MapEditorMap").then(({ MapEditorMap }) => ({ default: MapEditorMap })),
);
const field = "mt-1 block min-h-11 w-full rounded-md border bg-background px-3 py-2";

export function NatureSurveyPanel({
  project,
  actorId,
  canEdit,
  canConfigureAreas = canEdit,
}: {
  project: Project;
  actorId: string;
  canEdit: boolean;
  canConfigureAreas?: boolean;
}) {
  const cache = useQueryClient();
  const areaKey = ["nature-survey-areas", actorId, project.id];
  const observationKey = ["nature-survey-observations", actorId, project.id];
  const [mapOpen, setMapOpen] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [area, setArea] = useState<{ geometry: GeoJsonPolygon; hectares: number } | null>(null);
  const [kind, setKind] = useState<"species" | "habitat">("species");
  const areas = useQuery({
    queryKey: areaKey,
    queryFn: () => listNatureSurveyAreas(project.id, actorId),
  });
  const observations = useQuery({
    queryKey: observationKey,
    queryFn: () => listObservations(project.id, { type: NATURE_SURVEY_OBSERVATION, limit: 100 }),
  });
  const zones = useMemo<Zone[]>(
    () =>
      (areas.data ?? []).flatMap((row) => {
        const geometry = validateProjectPolygon(row.geometry);
        return geometry.valid
          ? [
              {
                id: row.id,
                project_id: row.project_id,
                name: row.name,
                area_type: "nature_survey",
                area_ha: row.area_hectares,
                geojson: geometry.polygon as GeoJsonPolygon,
                created_at: row.created_at,
              },
            ]
          : [];
      }),
    [areas.data],
  );
  const boundary = useMemo(
    () => validateProjectPolygon(project.geometry_polygon),
    [project.geometry_polygon],
  );
  const saveArea = useMutation({
    mutationFn: (form: FormData) => {
      if (!canConfigureAreas || !area) throw new Error("Tegn undersøgelsesområdet på kortet.");
      return saveNatureSurveyArea(project.id, actorId, {
        name: String(form.get("name") ?? ""),
        method: String(form.get("method") ?? ""),
        ...area,
      });
    },
    onSuccess: () => {
      setArea(null);
      return cache.invalidateQueries({ queryKey: areaKey });
    },
  });
  const saveObservation = useMutation({
    mutationFn: (form: FormData) => {
      if (!canEdit || !zones.some(({ id }) => id === form.get("zoneId")))
        throw new Error("Vælg et undersøgelsesområde på sagen.");
      return saveNatureSurveyObservation(project.id, actorId, {
        zoneId: form.get("zoneId"),
        kind,
        label: form.get("label"),
        method: form.get("method"),
        notes: form.get("notes"),
        determination: form.get("determination") ?? undefined,
      });
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: observationKey }),
  });

  return (
    <section
      aria-label="Naturregistrering"
      className="min-w-0 space-y-4 rounded-xl border bg-card p-4"
    >
      <h3 className="font-semibold">Naturregistrering</h3>
      <Button
        type="button"
        variant="outline"
        aria-expanded={mapOpen}
        onClick={() => setMapOpen(!mapOpen)}
      >
        {mapOpen ? "Luk naturkort" : "Åbn naturkort"}
      </Button>
      {mapOpen && (
        <Suspense fallback={<p role="status">Henter kort…</p>}>
          <SurveyMap
            projectId={project.id}
            projectName={project.name}
            lat={project.geometry_centroid_lat ?? 56.05}
            lng={project.geometry_centroid_lng ?? 10.05}
            initialZoom={boundary.valid ? 15 : 7}
            initialBaseLayer="osm"
            boundaryGeoJSON={boundary.valid ? (boundary.polygon as GeoJsonPolygon) : null}
            zones={zones}
            drawMode={canConfigureAreas && !saveArea.isPending ? drawMode : "none"}
            onDrawModeChange={setDrawMode}
            onZoneCreated={(geometry, hectares) => {
              if (!canConfigureAreas || saveArea.isPending) return;
              setArea({ geometry, hectares });
              saveArea.reset();
            }}
            readOnly={!canConfigureAreas || saveArea.isPending}
            height={380}
          />
        </Suspense>
      )}
      {mapOpen && canConfigureAreas && !area && (
        <p className="text-sm">Vælg Zone på kortet og tegn det undersøgte areal.</p>
      )}
      {area && canConfigureAreas && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saveArea.isPending) saveArea.mutate(new FormData(event.currentTarget));
          }}
        >
          <label className="block">
            Områdenavn
            <input name="name" required maxLength={160} className={field} />
          </label>
          <label className="block">
            Undersøgelsesmetode og dækning
            <textarea name="method" required maxLength={2000} className={field} />
          </label>
          <Button type="submit" disabled={saveArea.isPending}>
            Gem undersøgelsesområde
          </Button>
        </form>
      )}
      {saveArea.isError && <p role="alert">{saveArea.error.message}</p>}
      {saveArea.isSuccess && <p role="status">Undersøgelsesområdet er gemt.</p>}
      {zones.length > 0 && (
        <ul aria-label="Undersøgelsesområder" className="space-y-1">
          {zones.map((zone) => (
            <li key={zone.id}>
              {zone.name} · {zone.area_ha ?? "Ukendt areal"} ha
            </li>
          ))}
        </ul>
      )}
      {canEdit && zones.length > 0 && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (saveObservation.isPending) return;
            const form = event.currentTarget;
            saveObservation.mutate(new FormData(form), { onSuccess: () => form.reset() });
          }}
        >
          <fieldset disabled={saveObservation.isPending} className="space-y-3">
            <label className="block">
              Undersøgelsesområde
              <select name="zoneId" required className={field}>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Registreringstype
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value === "species" ? "species" : "habitat")
                }
                className={field}
              >
                <option value="species">Artsfund</option>
                <option value="habitat">Natur- eller levestedsobservation</option>
              </select>
            </label>
            <label className="block">
              {kind === "species" ? "Artsnavn eller artsgruppe" : "Naturtype eller levested"}
              <input name="label" required maxLength={160} className={field} />
            </label>
            {kind === "species" && (
              <label className="block">
                Bestemmelsesniveau
                <select name="determination" required defaultValue="" className={field}>
                  <option value="" disabled>
                    Vælg niveau
                  </option>
                  <option value="species">Art</option>
                  <option value="genus">Slægt</option>
                  <option value="group">Gruppe</option>
                  <option value="uncertain">Uafklaret</option>
                </select>
              </label>
            )}
            <label className="block">
              Metode
              <input name="method" required maxLength={2000} className={field} />
            </label>
            <label className="block">
              Feltobservation
              <textarea name="notes" required maxLength={2000} className={field} />
            </label>
            <Button type="submit">Gem feltobservation</Button>
          </fieldset>
        </form>
      )}
      {(areas.isError || observations.isError) && (
        <p role="alert">Naturregistreringerne kunne ikke indlæses.</p>
      )}
      {saveObservation.isError && <p role="alert">{saveObservation.error.message}</p>}
      {saveObservation.isSuccess && <p role="status">Feltobservationen er gemt.</p>}
      {!!observations.data?.length && (
        <ul aria-label="Seneste naturregistreringer" className="space-y-2 text-sm">
          {observations.data.map((row) => (
            <li key={row.id} className="rounded border p-2">
              <strong>{row.species_name ?? "Natur- eller levestedsobservation"}</strong>
              <p>
                {zones.find(({ id }) => id === row.zone_id)?.name} · {row.observed_at.slice(0, 10)}
              </p>
              <p className="whitespace-pre-wrap">{row.notes}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
