import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  createProjectBaseline,
  getProjectBaseline,
  listProjectBaselines,
} from "@/lib/public-baseline.functions";
import type { Project } from "@/lib/supabase/types";
import { validateProjectPolygon } from "@/services/geo-service";
import { VerificationPlanPanel } from "./VerificationPlanPanel";
import { BaselineSourceData } from "./BaselineSourceData";

const statusLabels: Record<string, string> = {
  complete: "Tilgængelig",
  partial: "Delvis dækning",
  no_coverage: "Ingen dækning",
  not_configured: "Adgang mangler",
  not_implemented: "Afventer tilslutning",
  timeout: "Tidsgrænse overskredet",
  failed: "Hentning fejlede",
};
const availabilityLabel = (status: string) =>
  status === "complete" ? "hentet" : status === "partial" ? "delvist" : "ikke tilgængelig";

const coverageLabels: Record<string, string> = {
  complete: "fuld",
  partial: "delvis",
  none: "ingen",
  unknown: "uafklaret",
};

const evidenceLabels: Record<string, string> = {
  official_registration: "Officiel registrering",
  measurement: "Måledata",
  calculation: "Beregning",
  estimate: "Estimat",
  preview: "Foreløbigt eller manglende grundlag",
};

function readableError(): string {
  return "Datagrundlaget kunne ikke åbnes eller gemmes. Kontrollér adgangen til sagen, og prøv igen.";
}

/** Opening a saved version reads its manifest; only an explicit action fetches new sources. */
export function PublicBaselinePanel({
  project,
  canPersist = false,
}: {
  project: Project;
  canPersist?: boolean;
}) {
  const hasGeometry = validateProjectPolygon(project.geometry_polygon).valid;
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(project.start_date?.slice(0, 10) ?? today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);
  const queryClient = useQueryClient();
  const createBaseline = useServerFn(createProjectBaseline);
  const listBaselines = useServerFn(listProjectBaselines);
  const getBaseline = useServerFn(getProjectBaseline);

  const versions = useQuery({
    queryKey: ["public-baselines", project.id],
    queryFn: () => listBaselines({ data: { projectId: project.id } }),
    retry: false,
  });
  const activeId = selectedId ?? versions.data?.[0]?.id ?? null;
  const saved = useQuery({
    queryKey: ["public-baseline", project.id, activeId],
    queryFn: () => getBaseline({ data: { projectId: project.id, snapshotId: activeId! } }),
    enabled: activeId !== null,
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      const key = `${project.id}/${dateFrom}/${dateTo}`;
      if (pendingRequest.current?.key !== key)
        pendingRequest.current = { key, id: crypto.randomUUID() };
      return createBaseline({
        data: { projectId: project.id, dateFrom, dateTo, requestId: pendingRequest.current.id },
      });
    },
    onSuccess: async (snapshot) => {
      pendingRequest.current = null;
      setSelectedId(snapshot.id);
      queryClient.setQueryData(["public-baseline", project.id, snapshot.id], snapshot);
      await queryClient.invalidateQueries({ queryKey: ["public-baselines", project.id] });
    },
    retry: false,
  });

  const error = create.error ?? versions.error ?? saved.error;
  const snapshot = saved.error ? null : saved.data;

  return (
    <>
      <Card>
        <CardHeader
          title="Offentligt datagrundlag"
          subtitle="Gem en dateret version før drone- og feltverifikation"
        />
        <div className="px-5 pb-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Vælg den periode, undersøgelsen skal omfatte. En gemt version bevarer sine kilder og
            geometri; nye oplysninger gemmes i en ny version.
          </p>
          {canPersist && (
            <div className="text-sm space-y-1">
              {!hasGeometry && (
                <p>Afgræns først projektområdet, og vælg den officielle vandløbsreference.</p>
              )}
              <Link
                to="/app/projects/geometry/$slug"
                params={{ slug: project.slug ?? project.id }}
                className="underline"
              >
                Afgræns område og vælg vandløbsreference
              </Link>
            </div>
          )}
          {canPersist ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm space-y-1">
                <span className="block">Fra dato</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  disabled={create.isPending}
                  className="rounded border bg-background p-2"
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="block">Til dato</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  disabled={create.isPending}
                  className="rounded border bg-background p-2"
                />
              </label>
              <button
                type="button"
                onClick={() => create.mutate()}
                disabled={
                  create.isPending || !hasGeometry || !dateFrom || !dateTo || dateFrom > dateTo
                }
                className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
              >
                {create.isPending ? "Henter datagrundlag …" : "Hent og gem ny version"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Du har læseadgang til sagens gemte kildeversioner.
            </p>
          )}
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {readableError()}
            </div>
          )}
          {versions.isPending && (
            <p className="text-sm text-muted-foreground">Henter gemte versioner …</p>
          )}
          {!versions.isPending && !versions.error && versions.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Der er endnu intet gemt datagrundlag for denne sag.
            </p>
          )}
          {!!versions.data?.length && (
            <label className="block text-sm space-y-1">
              <span className="block">Gemt version</span>
              <select
                value={activeId ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
                className="rounded border bg-background p-2 max-w-full"
              >
                {versions.data.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version} ·{" "}
                    {new Date(version.createdAt).toLocaleString("da-DK")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {saved.isFetching && (
            <p className="text-sm text-muted-foreground">Åbner gemt datagrundlag …</p>
          )}
          {snapshot && (
            <div className="space-y-3">
              <div className="text-sm">
                <strong>Version {snapshot.version}</strong> · {snapshot.manifest.period.from}–
                {snapshot.manifest.period.to}
                <p className="text-muted-foreground">
                  Kildernes datadatoer og dækning kan være forskellige. Gemte oplysninger er et
                  grundlag for faglig gennemgang.
                </p>
              </div>
              {snapshot.manifest.sources.map((source) => (
                <div key={source.id} className="rounded border p-3 space-y-2">
                  <div className="flex justify-between gap-3 text-sm">
                    <strong>
                      {source.id === "dmi-historical"
                        ? "DMI – nedbør fra målestation"
                        : `${source.provider} · ${source.dataset}`}
                    </strong>
                    <Pill tone={source.status === "complete" ? "info" : "warning"}>
                      {availabilityLabel(source.status)}
                    </Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {statusLabels[source.status] ?? "Kildestatus ukendt"}
                    {source.retrieval?.mode === "saved_fallback"
                      ? " · Gemt kilde"
                      : source.retrieval?.mode === "cache"
                        ? " · Genbrugt kildesvar"
                        : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {source.mode === "error" ? "Kontrolleret" : "Hentet"}{" "}
                    {new Date(source.fetchedAt).toLocaleString("da-DK")} ·{" "}
                    {source.mode === "live"
                      ? "Offentlig kilde"
                      : source.mode === "import"
                        ? "Importeret kilde"
                        : "Manglende eller foreløbigt grundlag"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {evidenceLabels[source.quality.evidenceKind]} · Geografisk dækning:{" "}
                    {coverageLabels[source.coverage.spatial]} · Tidsdækning:{" "}
                    {coverageLabels[source.coverage.temporal]}
                  </p>
                  {source.coverage.observedFrom && source.coverage.observedTo && (
                    <p className="text-xs text-muted-foreground">
                      Dataperiode: {source.coverage.observedFrom.slice(0, 10)}–
                      {source.coverage.observedTo.slice(0, 10)}
                      {source.coverage.returnedCount !== null &&
                        ` · ${source.coverage.returnedCount} dataposter`}
                    </p>
                  )}
                  {source.quality.warnings.map((warning, index) => (
                    <p key={index} className="text-xs text-muted-foreground">
                      {warning}
                    </p>
                  ))}
                  {source.error && (
                    <p className="text-xs text-destructive">{source.error.message}</p>
                  )}
                  <BaselineSourceData source={source} />
                  {source.sourceUrl?.startsWith("https://") && (
                    <a
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      Åbn kilde
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      {snapshot && <VerificationPlanPanel key={snapshot.id} snapshot={snapshot} />}
    </>
  );
}
