import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MapEditorMap } from "@/components/maps/MapEditorMap";
import type { DroneUploadMapPoint } from "@/services/monitoring/drone-upload-map-service";
import type { ProjectScope } from "@/services/project-workspace-service";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import type { ReportRevision } from "@/lib/report-document";
import { saveReportDocument } from "@/services/report-document-service";
import { buildReportImages } from "@/services/report-assets";
import { downloadReportFile } from "@/lib/report-export";
import {
  listPhotoAtlasSources,
  loadPhotoAtlas,
  importPhotoAtlas,
  listPhotoAtlasReviews,
  latestPhotoAtlasReviews,
  savePhotoAtlasReview,
} from "@/services/photo-atlas-service";
import {
  AtlasReviewSchema,
  parsePhotoAtlas,
  filterAtlasPhotos,
  initialAtlasReview,
  documentedPhotoComparison,
  photoDateLabel,
  photoAtlasError,
  safeSourceUrl,
  type AtlasPhoto,
  type AtlasReview,
  type PhotoAtlas,
} from "@/lib/photo-atlas";
import {
  atlasReportContent,
  buildPhotoAtlasHtml,
  downloadAtlasBlob,
} from "@/lib/photo-atlas-export";

const button = "rounded-lg border bg-card px-3 py-2 text-sm disabled:opacity-50";
const field = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm";
type Props = {
  scope: ProjectScope;
  projectName: string;
  organizationName: string;
  purpose: string;
  canEdit: boolean;
  media: ProjectMediaItem[];
};
export function ProjectPhotoAtlas({
  scope,
  projectName,
  organizationName,
  purpose,
  canEdit,
  media,
}: Props) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PhotoAtlas | null>(null);
  const [busy, setBusy] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [watercourse, setWatercourse] = useState("");
  const [date, setDate] = useState("");
  const [section, setSection] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  const [report, setReport] = useState<ReportRevision | null>(null);
  const key = ["photo-atlas-sources", scope.organizationId, scope.projectId];
  const sources = useQuery({ queryKey: key, queryFn: () => listPhotoAtlasSources(scope) });
  useEffect(() => {
    if (sources.data && !sources.data.some((s) => s.id === selected))
      setSelected(sources.data[0]?.id ?? "");
  }, [sources.data, selected]);
  const atlas = useQuery({
    queryKey: ["photo-atlas", scope.organizationId, scope.projectId, selected],
    queryFn: () => loadPhotoAtlas(scope, selected),
    enabled: !!selected,
    staleTime: 60000,
  });
  const reviewKey = ["photo-atlas-reviews", scope.organizationId, scope.projectId, selected];
  const records = useQuery({
    queryKey: reviewKey,
    queryFn: () => listPhotoAtlasReviews(scope, selected),
    enabled: !!selected,
  });
  const reviews = useMemo(
    () => latestPhotoAtlasReviews(records.data ?? [], selected),
    [records.data, selected],
  );
  const photos = useMemo(() => atlas.data?.photos ?? [], [atlas.data]);
  const filtered = useMemo(
    () =>
      filterAtlasPhotos(
        photos.map((p) => {
          const r = reviews.get(p.id)?.review;
          return r
            ? {
                ...p,
                observation: r.observation,
                vegetation: r.vegetation,
                species: r.species ? [r.species] : [],
              }
            : p;
        }),
        { search, watercourse, date, section },
      ),
    [photos, reviews, search, watercourse, date, section],
  );
  useEffect(() => setLimit(24), [search, watercourse, date, section, selected]);
  const points = useMemo<DroneUploadMapPoint[]>(
    () =>
      filtered
        .filter((p) => p.lat != null && p.lon != null)
        .map((p) => ({
          uploadId: p.id,
          projectId: scope.projectId,
          fileName: `${p.id} · ${p.filename}`,
          coordinates: { lat: p.lat!, lng: p.lon! },
          capturedAt: p.time ?? p.date ?? "",
          capturedAtLabel: photoDateLabel(p),
          cameraLabel: p.camera || undefined,
          directionDeg: p.yaw ?? undefined,
          uploadStatus: "imported_reference",
          positionTrust: "raw_unvalidated",
          positionNotice: "Importeret kamera-GPS; motivposition og tilknytning skal kontrolleres.",
        })),
    [filtered, scope.projectId],
  );
  const active = photos.find((p) => p.id === activeId);
  const activeReview = active ? reviews.get(active.id) : undefined;
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(photoAtlasError(e));
    } finally {
      setBusy("");
      setUploadProgress(null);
    }
  }
  async function saveReport() {
    if (!atlas.data) throw new Error("Vælg et indlæst fotoatlas.");
    if (!canEdit) throw new Error("Du har læseadgang. En projektmedarbejder skal gemme rapporten.");
    if (records.isPending || records.error)
      throw new Error("Fotogennemgangen skal være indlæst uden fejl før rapporten kan samles.");
    const revision = await saveReportDocument({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      reportId: report?.report_id ?? null,
      expectedVersion: report?.version ?? 0,
      status: "draft",
      content: atlasReportContent({
        atlas: atlas.data,
        photos: filtered,
        reviews,
        projectName,
        organizationName,
        purpose,
      }),
    });
    setReport(revision);
    return revision;
  }
  return (
    <section
      aria-label="Projektets fotoatlas og baseline"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div>
        <h2 className="text-xl font-semibold">Fotoatlas og baseline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisation: {organizationName} · Projekt: {projectName}. Et vandløb er en geografisk
          reference; en delstrækning skal afgrænses særskilt.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">
          {error}
        </p>
      )}
      {(sources.error || atlas.error || records.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(sources.error ?? atlas.error ?? records.error)?.message}
        </p>
      )}
      {busy && (
        <p role="status">
          {busy}… {uploadProgress !== null ? `Upload ${uploadProgress} %. ` : ""}Behold siden åben.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {canEdit && (
        <button
          type="button"
          className={button}
          disabled={!!busy || !media.length}
          onClick={() =>
            void run("Bygger fotoatlas fra originaler", async () => {
              const { atlasFromProjectOriginals } =
                await import("@/services/photo-atlas-originals");
              const built = await atlasFromProjectOriginals(
                media,
                scope.projectId,
                projectName,
                (done, total) => setBusy(`Læser originaler ${done}/${total}`),
              );
              const file = new File(
                [
                  JSON.stringify({
                    title: built.title,
                    version: built.version,
                    method: built.method,
                    photos: built.photos,
                  }),
                ],
                "projekt-originalfotos.json",
                { type: "application/json" },
              );
              const result = await importPhotoAtlas(scope, file, (p) =>
                setUploadProgress(Math.round(p)),
              );
              await cache.invalidateQueries({ queryKey: key });
              setSelected(result.id);
              setMessage(
                "Fotoatlasset er gemt. Originalernes metadata og kontrolsummer er bevaret; vandløb og strækning skal gennemgås.",
              );
            })
          }
        >
          Byg fotoatlas fra sagens originaler
        </button>
      )}
      {canEdit ? (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">
            Indlæs eksisterende fotoatlas eller baselinedata
          </summary>
          <p className="my-2 text-sm text-muted-foreground">
            HTML-atlassets indlejrede illustrationer og fotooplysninger kan genbruges. HTML-kode
            udføres aldrig. Originalfilerne erstattes ikke af illustrationerne. Baseline-JSON uden
            billeder viser registreringerne og deres kildehenvisninger.
          </p>
          <label className="block text-sm">
            Importér fotoatlas eller baseline
            <input
              type="file"
              accept=".html,.htm,.json"
              disabled={!!busy}
              className="mt-1 block w-full"
              onChange={(e) => {
                const candidate = e.target.files?.[0];
                setFile(null);
                setPreview(null);
                setError("");
                if (!candidate) return;
                void run("Kontrollerer filen", async () => {
                  if (candidate.size > 100 * 1024 * 1024)
                    throw new Error("Filen overstiger 100 MB.");
                  const parsed = parsePhotoAtlas(await candidate.text(), candidate.name);
                  setFile(candidate);
                  setPreview(parsed);
                });
              }}
            />
          </label>
          {preview && (
            <div className="mt-3 space-y-2">
              <p>
                {preview.photos.length} fotos ·{" "}
                {[...new Set(preview.photos.map((p) => p.watercourse || "Uafklaret"))].join(", ")}.
                Gemmes kun på {projectName}.
              </p>
              <button
                type="button"
                className={button}
                disabled={!!busy || !file}
                onClick={() =>
                  void run("Gemmer fotoatlasset", async () => {
                    setUploadProgress(0);
                    const result = await importPhotoAtlas(scope, file!, (percentage) =>
                      setUploadProgress(Math.round(percentage)),
                    );
                    setUploadProgress(null);
                    await cache.invalidateQueries({ queryKey: key });
                    setSelected(result.id);
                    setFile(null);
                    setPreview(null);
                    setMessage(
                      "Fotoatlasset er gemt på den valgte sag. Originalreferencer og usikkerheder er bevaret.",
                    );
                  })
                }
              >
                Gem fotoatlasset på projektet
              </button>
            </div>
          )}
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">
          Du har læseadgang. En projektmedarbejder kan tilføje billeder og ændre vurderinger.
        </p>
      )}
      {sources.isPending ? (
        <p>Indlæser fotoatlas…</p>
      ) : !sources.data?.length ? (
        <p className="rounded-lg border border-dashed p-4">
          Der er endnu ikke tilknyttet et fotoatlas. Upload originalfotos nedenfor, eller indlæs et
          eksisterende HTML-atlas/baselinedatasæt. Ingen billeder eller målinger er opfundet.
        </p>
      ) : (
        <>
          <label className="block text-sm">
            Gemte fotoatlas og baselines
            <select
              className={field}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setReport(null);
                setActiveId(null);
                setSearch("");
                setWatercourse("");
                setDate("");
                setSection("");
              }}
            >
              {sources.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {new Date(s.created_at).toLocaleDateString("da-DK")}
                </option>
              ))}
            </select>
          </label>
          {atlas.isPending ? (
            <p role="status">Indlæser det private billedgrundlag…</p>
          ) : (
            atlas.data && (
              <>
                <p className="text-xs text-muted-foreground">
                  {atlas.data.method} Kamera-GPS og motivplacering holdes adskilt. Illustrationer er
                  ikke originalfiler. Optagedato er ikke skæredato. Importfilens SHA-256:{" "}
                  <span className="break-all">{atlas.data.checksum}</span>.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm">
                    Søg i fotoatlas
                    <input
                      type="search"
                      className={field}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Foto-ID, filnavn, beskrivelse eller artsbud"
                    />
                  </label>
                  <label className="text-sm">
                    Vandløb
                    <select
                      className={field}
                      value={watercourse}
                      onChange={(e) => setWatercourse(e.target.value)}
                    >
                      <option value="">Alle vandløb</option>
                      {[...new Set(photos.map((p) => p.watercourse).filter(Boolean))]
                        .sort()
                        .map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Optagedato
                    <select
                      className={field}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    >
                      <option value="">Alle optagedatoer</option>
                      {[...new Set(photos.map((p) => p.date).filter((v): v is string => !!v))]
                        .sort()
                        .map((v) => (
                          <option key={v} value={v}>
                            {v.split("-").reverse().join(".")}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Billedgruppe
                    <select
                      className={field}
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                    >
                      <option value="">Alle billedgrupper</option>
                      {[...new Set(photos.map((p) => p.section_id).filter(Boolean))]
                        .sort()
                        .map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                    </select>
                  </label>
                </div>
                <p role="status">
                  {filtered.length} af {photos.length} fotos ·{" "}
                  {filtered.filter((p) => p.image).length} med illustration. Billedgrupper er ikke
                  nødvendigvis geografiske delstrækninger.
                </p>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer font-medium">
                    Kort over kamerapositioner
                  </summary>
                  {points.length ? (
                    <>
                      <p className="my-2 text-sm text-muted-foreground">
                        {points.length} registrerede kamerapositioner. Klik et punkt for at åbne
                        fotoet. Kortbaggrunden er en ekstern mosaik med egen, eventuelt ukendt
                        optagedato; punkterne er ikke målfaste fotodækningsflader.
                      </p>
                      <MapEditorMap
                        projectId={scope.projectId}
                        projectName={projectName}
                        lat={points[0].coordinates.lat}
                        lng={points[0].coordinates.lng}
                        droneUploadPoints={points}
                        showSensors={false}
                        showParagraph3={false}
                        showWatercourses={false}
                        showDroneUploads
                        fitDroneUploads
                        onDronePhotoClick={setActiveId}
                        height={420}
                      />
                    </>
                  ) : (
                    <p>Kamerapositioner mangler. Der tegnes ikke opfundne punkter.</p>
                  )}
                </details>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={!!busy || !filtered.length || records.isPending || !!records.error}
                    onClick={() => {
                      const data = { ...atlas.data!, photos: filtered };
                      downloadAtlasBlob(
                        new Blob([buildPhotoAtlasHtml(data, reviews, projectName)], {
                          type: "text/html;charset=utf-8",
                        }),
                        "freyra-fotoatlas.html",
                      );
                    }}
                  >
                    Hent søgbart HTML-fotoatlas
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={!!busy || !filtered.length || records.isPending || !!records.error}
                    onClick={() =>
                      downloadAtlasBlob(
                        new Blob(
                          [
                            JSON.stringify(
                              {
                                title: projectName,
                                version: new Date().toISOString(),
                                method: atlas.data!.method,
                                image_count: filtered.length,
                                observations: filtered.map(({ image, ...p }) => ({
                                  ...p,
                                  review: reviews.get(p.id)?.review ?? null,
                                  illustrationIncluded: !!image,
                                })),
                              },
                              null,
                              2,
                            ),
                          ],
                          { type: "application/json" },
                        ),
                        "freyra-fotobaseline.json",
                      )
                    }
                  >
                    Hent fotobaseline som JSON
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className={button}
                        disabled={
                          !!busy || !filtered.length || records.isPending || !!records.error
                        }
                        onClick={() =>
                          void run("Gemmer rapportkladden", async () => {
                            const revision = await saveReport();
                            setMessage(
                              `Rapportkladde version ${revision.version} er gemt. Faglig godkendelse afventer.`,
                            );
                          })
                        }
                      >
                        Gem rapportkladde fra fotoatlasset
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={
                          !!busy || !filtered.length || records.isPending || !!records.error
                        }
                        onClick={() =>
                          void run("Samler PDF med kort og fotoatlas", async () => {
                            const revision = await saveReport();
                            const images = await buildReportImages(revision);
                            await downloadReportFile(revision, "pdf", images);
                            setMessage(
                              "PDF er eksporteret som kladde med kilder og faglige begrænsninger.",
                            );
                          })
                        }
                      >
                        Eksporter rapport og fotoatlas som PDF
                      </button>
                    </>
                  )}
                  {report && (
                    <Link
                      className={button}
                      to="/app/reports/preview"
                      search={{ report: report.report_id }}
                    >
                      Åbn gemt rapport
                    </Link>
                  )}
                  <Link className={button} to="/app/reports">
                    Rapportbibliotek
                  </Link>
                </div>
                {!filtered.length ? (
                  <p className="rounded-lg border border-dashed p-4">
                    Ingen fotos matcher filtrene. Fjern et filter eller søg på foto-ID.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {filtered.slice(0, limit).map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          className="overflow-hidden rounded-xl border bg-card text-left hover:shadow-md"
                          onClick={() => setActiveId(p.id)}
                        >
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.observation || p.filename}
                              loading="lazy"
                              className="aspect-video w-full object-cover"
                            />
                          ) : (
                            <div className="grid aspect-video place-items-center bg-muted text-sm">
                              Billedfil mangler · kildehenvisning foreligger
                            </div>
                          )}
                          <div className="space-y-2 p-3">
                            <h3 className="font-semibold">
                              {p.id} · {p.filename}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {p.watercourse || "Vandløb uafklaret"} · {photoDateLabel(p)}
                            </p>
                            <p className="text-sm line-clamp-3">
                              {p.observation || "Observation mangler."}
                            </p>
                            <p className="text-xs">
                              {reviews.get(p.id)?.review.speciesStatus === "field_confirmed"
                                ? "Brugerregistreret feltbekræftelse – se dokumentation"
                                : "Artsbud kræver relevant kontrol"}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {filtered.length > limit && (
                      <button type="button" className={button} onClick={() => setLimit(limit + 24)}>
                        Vis flere fotos ({filtered.length - limit} tilbage)
                      </button>
                    )}
                  </>
                )}
              </>
            )
          )}
        </>
      )}
      {active && (
        <AtlasPhotoDialog
          key={selected + active.id + (activeReview?.entry.version ?? 0)}
          photo={active}
          photos={photos}
          initial={activeReview?.review ?? initialAtlasReview(active)}
          media={media}
          canEdit={canEdit && !records.isPending && !records.error}
          version={activeReview?.entry.version ?? 0}
          savedAt={activeReview?.entry.created_at}
          onClose={() => setActiveId(null)}
          onNavigate={setActiveId}
          onSave={async (review) => {
            await savePhotoAtlasReview(scope, selected, active.id, review, activeReview?.entry);
            await cache.invalidateQueries({ queryKey: reviewKey });
            setActiveId(null);
            setMessage("Fotogennemgangen er gemt som en ny version i projektets revisionsspor.");
          }}
        />
      )}
    </section>
  );
}

const reviewFields: { key: keyof AtlasReview; label: string; type?: "date" }[] = [
  { key: "observation", label: "Synligt på fotoet" },
  { key: "vegetation", label: "Vegetationstyper" },
  { key: "species", label: "Artsbud eller kontrollerede arter" },
  { key: "confirmationEvidence", label: "Dokumentation for artskontrol og metode" },
  { key: "reviewer", label: "Navn og faglig rolle" },
  { key: "reach", label: "Kontrolleret delstrækning eller stedreference" },
  { key: "subjectPosition", label: "Motivets placering og usikkerhed – adskilt fra kamera-GPS" },
  { key: "closePhotoIds", label: "Foto-ID’er for nærfotos" },
  { key: "access", label: "Synlige adgangsforhold og praktiske udfordringer" },
  { key: "natureConcerns", label: "Naturhensyn og nødvendige afklaringer" },
  { key: "workDate", label: "Dokumenteret arbejdsdato", type: "date" },
  { key: "workEvidence", label: "Dateret driftsregistrering og arbejdsgrænse" },
  { key: "workPhotoIds", label: "Foto-ID’er fra udførelsen" },
  { key: "planting", label: "Planteforslag, arter og stedbunden placering" },
  { key: "plantingDate", label: "Dato for dokumenteret plantning", type: "date" },
  { key: "plantingEvidence", label: "Dokumentation for udført plantning" },
  { key: "followup", label: "Pleje, efterplantning og senere opfølgning" },
  { key: "samePlaceEvidence", label: "Samme sted – pejlemærker og sammenlignelighed" },
];
function AtlasPhotoDialog({
  photo,
  photos,
  initial,
  media,
  canEdit,
  version,
  savedAt,
  onClose,
  onSave,
  onNavigate,
}: {
  photo: AtlasPhoto;
  photos: AtlasPhoto[];
  initial: AtlasReview;
  media: ProjectMediaItem[];
  canEdit: boolean;
  version: number;
  savedAt?: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onSave: (review: AtlasReview) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const comparisonPhoto = photos.find((p) => p.id === draft.comparisonPhotoId);
  const comparison = comparisonPhoto
    ? documentedPhotoComparison(photo, comparisonPhoto, draft)
    : null;
  const index = photos.findIndex((p) => p.id === photo.id);
  const source = safeSourceUrl(photo.source);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[95dvh] max-w-[95vw] overflow-y-auto sm:max-w-[1400px]">
        <DialogTitle>
          {photo.id} · {photo.filename}
        </DialogTitle>
        <DialogDescription>
          {photo.watercourse || "Vandløbstilknytning uafklaret"} · {photoDateLabel(photo)}.
          Originalerne ændres ikke ved redigering af beskrivelsen.
        </DialogDescription>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={index === 0}
            onClick={() => onNavigate(photos[index - 1].id)}
          >
            Forrige foto
          </button>
          <button
            type="button"
            className={button}
            disabled={index === photos.length - 1}
            onClick={() => onNavigate(photos[index + 1].id)}
          >
            Næste foto
          </button>
          <label className="flex items-center gap-2 text-sm">
            Zoom
            <input
              aria-label="Billedzoom"
              type="range"
              min={1}
              max={4}
              step={0.25}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <span>{Math.round(zoom * 100)} %</span>
          </label>
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-3">
            <div className="max-h-[65vh] overflow-auto rounded-lg bg-black/90">
              {photo.image ? (
                <img
                  src={photo.image}
                  alt={draft.observation || photo.filename}
                  style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
                />
              ) : (
                <p className="p-6 text-white">
                  Der er ikke indlejret en billedfil. Upload originalfoto eller indlæs
                  HTML-fotoatlasset med illustrationer.
                </p>
              )}
            </div>
            <p className="text-sm">
              Kameraposition:{" "}
              {photo.lat != null && photo.lon != null
                ? `${photo.lat.toFixed(6)}, ${photo.lon.toFixed(6)}`
                : "Mangler"}
              . Motivplacering: {draft.subjectPosition || "Ikke registreret"}. Kamera:{" "}
              {photo.camera || "Ikke oplyst"}.
            </p>
            <p className="break-all text-xs text-muted-foreground">
              Originalens registrerede SHA-256: {photo.sha256 || "Mangler"}. Denne import har ikke
              hentet/verificeret originalfilen; illustrationen erstatter den ikke.
            </p>
            {source && (
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Åbn originalens kildehenvisning
              </a>
            )}
            <label className="block text-sm">
              Sammenlign med en anden optagelse
              <select
                className={field}
                value={draft.comparisonPhotoId}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, comparisonPhotoId: e.target.value })}
              >
                <option value="">Vælg et andet foto</option>
                {photos
                  .filter((p) => p.id !== photo.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.filename} · {p.date ?? "Dato mangler"}
                    </option>
                  ))}
              </select>
            </label>
            {comparisonPhoto && (
              <div className="space-y-2 rounded-lg border p-3">
                <h3 className="font-semibold">
                  {comparison?.documented
                    ? "Dokumenteret før/efter-relation"
                    : "To optagelser – indsatsrelation ikke dokumenteret"}
                </h3>
                <p className="text-sm">
                  {comparison?.reason} Kameraafstand, retning, lys og synligt motiv skal vurderes
                  før en ændring tolkes som effekt.
                </p>
                <p className="text-sm">
                  {photo.id}: {photoDateLabel(photo)} · {comparisonPhoto.id}:{" "}
                  {photoDateLabel(comparisonPhoto)}
                </p>
                {comparisonPhoto.image && (
                  <img
                    src={comparisonPhoto.image}
                    alt={comparisonPhoto.observation || comparisonPhoto.filename}
                    className="w-full rounded"
                  />
                )}
              </div>
            )}
            {media.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm">
                  Originaler og nærfotos på sagen
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {media.map((m) => (
                    <li key={m.id}>
                      {m.id} · {m.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              void (async () => {
                try {
                  await onSave(AtlasReviewSchema.parse(draft));
                } catch (err) {
                  setError(photoAtlasError(err));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <p className="text-xs text-muted-foreground">
              {version
                ? `Gemt vurdering version ${version} · ${new Date(savedAt!).toLocaleString("da-DK")}`
                : "Ingen gemt faglig vurdering. Importerede beskrivelser og artsbud er ikke en godkendelse."}
            </p>
            <label className="block text-sm">
              Status for artsbestemmelse
              <select
                className={field}
                disabled={!canEdit || busy}
                value={draft.speciesStatus}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    speciesStatus: e.target.value as AtlasReview["speciesStatus"],
                  })
                }
              >
                <option value="not_assessed">Ikke vurderet</option>
                <option value="suggestion">Foreløbigt artsbud</option>
                <option value="field_confirmed">Bekræftet ved relevant feltkontrol</option>
              </select>
            </label>
            {reviewFields.map((f) => (
              <label className="block text-sm" key={f.key}>
                {f.label}
                {f.type === "date" ? (
                  <input
                    type="date"
                    className={field}
                    value={draft[f.key]}
                    disabled={!canEdit || busy}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                ) : (
                  <textarea
                    className={field}
                    rows={f.key === "observation" ? 3 : 2}
                    value={draft[f.key]}
                    maxLength={4000}
                    disabled={!canEdit || busy}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                )}
              </label>
            ))}
            <label className="block text-sm">
              Status for beplantning
              <select
                className={field}
                disabled={!canEdit || busy}
                value={draft.plantingStatus}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    plantingStatus: e.target.value as AtlasReview["plantingStatus"],
                  })
                }
              >
                <option value="proposal">Forslag – faglig afklaring afventer</option>
                <option value="documented_execution">Udført plantning med dokumentation</option>
              </select>
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {canEdit ? (
              <button type="submit" className={button} disabled={busy}>
                {busy ? "Gemmer…" : "Gem fotogennemgang som ny version"}
              </button>
            ) : (
              <p className="text-sm">Du har læseadgang. Vurderinger kan ikke ændres.</p>
            )}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
