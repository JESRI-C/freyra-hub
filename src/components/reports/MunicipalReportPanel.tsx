import { useEffect, useRef, useState } from "react";
import { AdvancedSettings } from "@/components/redesign/AdvancedSettings";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileDown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import {
  getSurveyRound,
  getSurveyRoundAccess,
  listSurveyRounds,
} from "@/lib/survey-round.functions";
import {
  getMunicipalReport,
  listMunicipalReports,
  saveMunicipalReport,
} from "@/lib/municipal-report.functions";
import { getCanonicalDroneMediaUrl } from "@/lib/canonical-drone-media.functions";
import type { MunicipalReportVersion } from "@/services/monitoring/municipal-report-persistence";
import type { MunicipalReportPdfImage } from "@/lib/municipal-report-pdf";
import {
  municipalReportSummaryText,
  municipalReportSourceText,
  municipalSourceTitle,
} from "@/lib/municipal-report-labels";

const buttonClass =
  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
const statusLabels: Record<string, string> = {
  complete: "Komplet svar",
  partial: "Delvis dækning",
  no_coverage: "Ingen dækning",
  not_configured: "Adgang mangler",
  not_implemented: "Ikke tilsluttet",
  timeout: "Tidsgrænse",
  failed: "Kilden fejlede",
};
function saveFile(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type })),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function jpegIllustration(signedUrl: string, sha256: string): Promise<string> {
  const response = await fetch(signedUrl, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok || !response.body) throw new Error("Fotoet kunne ikke læses.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 20_000_000) throw new Error("Fotoet overskrider illustrationsgrænsen.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== sha256) throw new Error("Originalfotoets checksum matcher ikke rapporten.");
  const image = await createImageBitmap(new Blob([bytes.buffer], { type: "image/jpeg" }));
  try {
    const canvas = document.createElement("canvas"),
      ratio = Math.min(1, 1200 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Illustrationen kunne ikke dannes.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    image.close();
  }
}
interface MunicipalReportPanelProps {
  projectId: string;
  selectedRoundId?: string;
  onSelectRound?: (roundId: string) => void;
}
export function MunicipalReportPanel({
  projectId,
  selectedRoundId,
  onSelectRound,
}: MunicipalReportPanelProps) {
  const { user } = useAuth();
  return user ? (
    <ReportPanel
      key={`${user.id}:${projectId}:${selectedRoundId ?? "latest"}`}
      projectId={projectId}
      actorId={user.id}
      selectedRoundId={selectedRoundId}
      onSelectRound={onSelectRound}
    />
  ) : null;
}
function ReportPanel({
  projectId,
  actorId,
  selectedRoundId,
  onSelectRound,
}: MunicipalReportPanelProps & { actorId: string }) {
  const [selectedRound, setSelectedRound] = useState(selectedRoundId ?? ""),
    [selectedReport, setSelectedReport] = useState(""),
    [progress, setProgress] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const [withImages, setWithImages] = useState(true);
  const [packageChecksum, setPackageChecksum] = useState<{ name: string; sha256: string } | null>(
    null,
  );
  const alive = useRef(true),
    request = useRef<string | null>(null),
    downloadLock = useRef(false),
    cache = useQueryClient();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const roundsFn = useServerFn(listSurveyRounds),
    roundFn = useServerFn(getSurveyRound),
    accessFn = useServerFn(getSurveyRoundAccess),
    listFn = useServerFn(listMunicipalReports),
    getFn = useServerFn(getMunicipalReport),
    saveFn = useServerFn(saveMunicipalReport),
    photoFn = useServerFn(getCanonicalDroneMediaUrl);
  const rounds = useInfiniteQuery({
    queryKey: ["municipal-report-rounds", actorId, projectId],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      roundsFn({ data: { projectId, beforeVersion: pageParam, limit: 30 } }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    retry: false,
  });
  const access = useQuery({
    queryKey: ["municipal-report-access", actorId, projectId],
    queryFn: () => accessFn({ data: { projectId } }),
    retry: false,
  });
  const selected = useQuery({
    queryKey: ["municipal-report-selected-round", actorId, projectId, selectedRound],
    queryFn: async () => {
      const value = await roundFn({ data: { projectId, roundVersionId: selectedRound } });
      if (!value || value.id !== selectedRound || value.projectId !== projectId)
        throw new Error("Den valgte undersøgelse kunne ikke åbnes.");
      return value;
    },
    enabled: !!selectedRound,
    retry: false,
  });
  const listedRounds = rounds.error ? [] : (rounds.data?.pages.flatMap((p) => p.items) ?? []);
  const selectedRecord = selected.error ? undefined : selected.data;
  // An explicit investigation can be older than the first page. Load it by ID, never substitute latest.
  const roundItems =
      selectedRecord && !listedRounds.some((item) => item.id === selectedRecord.id)
        ? [selectedRecord, ...listedRounds]
        : listedRounds,
    roundId = selectedRound || roundItems[0]?.id || "";
  const reports = useInfiniteQuery({
    queryKey: ["municipal-reports", actorId, projectId, roundId],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      listFn({ data: { projectId, roundVersionId: roundId, beforeVersion: pageParam, limit: 30 } }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    enabled: !!roundId,
    retry: false,
  });
  const versions = reports.error ? [] : (reports.data?.pages.flatMap((p) => p.items) ?? []),
    reportId = selectedReport || versions[0]?.id || "";
  const report = useQuery({
    queryKey: ["municipal-report-version", actorId, projectId, reportId],
    queryFn: () => getFn({ data: { projectId, reportVersionId: reportId } }),
    enabled: !!reportId,
    retry: false,
  });
  const inputError = !!(
    rounds.error ||
    access.error ||
    selected.error ||
    reports.error ||
    report.error
  );
  const canCreate =
    !!roundId &&
    !inputError &&
    !access.isFetching &&
    (!selectedRound || (!!selected.data && !selected.isFetching)) &&
    access.data?.projectId === projectId &&
    access.data.userId === actorId &&
    access.data.canPersist;
  const requestKey = `gofreyra.municipal-report-request/v1:${actorId}:${projectId}:${roundId}`;
  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!canCreate) throw new Error("Vælg en gemt undersøgelse med skriverettighed.");
      let stored: string | null = null;
      try {
        stored = sessionStorage.getItem(requestKey);
      } catch {
        /* In-memory retry receipt remains available. */
      }
      request.current ??= stored && /^[a-f0-9-]{36}$/.test(stored) ? stored : crypto.randomUUID();
      try {
        sessionStorage.setItem(requestKey, request.current);
      } catch {
        /* Same mounted attempt stays pinned. */
      }
      const receipt = { roundId, requestKey };
      setSelectedRound(roundId);
      const saved = await saveFn({
        data: {
          projectId,
          roundVersionId: roundId,
          requestId: request.current,
          expectedCallerUserId: actorId,
        },
      });
      return { saved, receipt };
    },
    onSuccess: async ({ saved, receipt }) => {
      if (!alive.current) return;
      request.current = null;
      try {
        sessionStorage.removeItem(receipt.requestKey);
      } catch {
        /* No credential is stored. */
      }
      setSelectedReport(saved.id);
      setSelectedRound(receipt.roundId);
      cache.setQueryData(["municipal-report-version", actorId, projectId, saved.id], saved);
      await cache.invalidateQueries({
        queryKey: ["municipal-reports", actorId, projectId, receipt.roundId],
      });
      await cache.invalidateQueries({
        queryKey: ["case-progress-reports", actorId, projectId, receipt.roundId],
      });
    },
    onError: () => {
      if (alive.current)
        setError("Rapporten blev ikke gemt. Kontrollér adgangen og prøv samme gemning igen.");
    },
    retry: false,
  });
  async function download(packageFile: boolean, savedId = reportId) {
    if (!savedId || downloadLock.current || inputError) return;
    downloadLock.current = true;
    setError(null);
    setProgress("Kontrollerer den gemte rapportversion …");
    try {
      const current = await getFn({ data: { projectId, reportVersionId: savedId } });
      if (!alive.current) return;
      if (!current || current.projectId !== projectId || current.manifest.pins.round.id !== roundId)
        throw new Error("Rapportversionen kunne ikke genåbnes.");
      const images: MunicipalReportPdfImage[] = [];
      if (withImages)
        for (const [index, photo] of current.manifest.photos.slice(0, 12).entries()) {
          if (!alive.current) return;
          setProgress(
            `Klargør illustration ${index + 1} af ${Math.min(12, current.manifest.photos.length)} …`,
          );
          try {
            const signed = await photoFn({ data: { projectId, mediaId: photo.mediaId } });
            if (!alive.current) return;
            if (signed.originalSha256 !== photo.originalSha256)
              throw new Error("Billedreference ændret.");
            const dataUrl = await jpegIllustration(signed.signedUrl, photo.originalSha256);
            images.push({ mediaId: photo.mediaId, originalSha256: photo.originalSha256, dataUrl });
          } catch {
            /* Missing illustration is explicit in the PDF; original evidence is not replaced. */
          }
        }
      if (!alive.current) return;
      setProgress("Samler rapport og versionsreferencer …");
      const { buildMunicipalReportPdf } = await import("@/lib/municipal-report-pdf");
      const pdf = await buildMunicipalReportPdf(current, images);
      if (!alive.current) return;
      const stem = `Haderslev-rapport-v${current.version}-${current.id.slice(0, 8)}`;
      if (packageFile) {
        const { buildMunicipalReportPackage } = await import("@/lib/municipal-report-package");
        const bytes = await buildMunicipalReportPackage(current, pdf);
        const sha256 = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)),
        ]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
        if (alive.current) {
          setPackageChecksum({ name: stem + ".zip", sha256 });
          saveFile(bytes, stem + ".zip", "application/zip");
        }
      } else saveFile(pdf, stem + ".pdf", "application/pdf");
    } catch {
      if (alive.current)
        setError(
          "Rapportpakken kunne ikke dannes. Den gemte version er bevaret. Prøv at hente den igen.",
        );
    } finally {
      downloadLock.current = false;
      if (alive.current) setProgress(null);
    }
  }
  async function createAndDownload() {
    if (mutation.isPending || downloadLock.current) return;
    try {
      const { saved } = await mutation.mutateAsync();
      if (alive.current) await download(true, saved.id);
    } catch {
      /* Mutation shows a safe, recoverable message. */
    }
  }
  const current =
    !inputError &&
    access.data?.userId === actorId &&
    access.data.projectId === projectId &&
    report.data?.projectId === projectId &&
    report.data.manifest.pins.round.id === roundId
      ? report.data
      : null;
  function refreshInputs() {
    void rounds.refetch();
    void access.refetch();
    if (selectedRound) void selected.refetch();
    if (roundId) void reports.refetch();
    if (reportId) void report.refetch();
  }
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-lg font-semibold">Samlet rapport til Haderslev Kommune</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Gem én version med datagrundlag, fotos, egne svar og prioriteret opfølgning. Den gemte
          version ændres ikke, når nye billeder eller svar kommer til.
        </p>
      </div>
      {current && (
        <SavedReport
          report={current}
          withImages={withImages}
          setWithImages={setWithImages}
          downloading={!!progress}
          onDownload={download}
        />
      )}
      {inputError && (
        <p role="alert" className="text-sm text-destructive">
          Rapportens input kunne ikke hentes med din aktuelle adgang. Genindlæs oversigten, før du
          fortsætter.
        </p>
      )}
      <button
        className={buttonClass}
        disabled={mutation.isPending || !!progress}
        onClick={refreshInputs}
      >
        Opdatér oversigt
      </button>
      {inputError ? null : rounds.isLoading ? (
        <p>Henter undersøgelser …</p>
      ) : !rounds.error && !roundItems.length ? (
        <p className="text-sm text-muted-foreground">
          Start med Billeder og droneoriginalerne og bekræft sted/dato. Rapporten kan derefter
          samles her.
        </p>
      ) : (
        <>
          <label className="block text-sm">
            Undersøgelse
            <select
              aria-label="Undersøgelse til rapport"
              className="mt-1 block w-full rounded border bg-background p-2"
              value={roundId}
              disabled={mutation.isPending || !!progress}
              onChange={(e) => {
                setSelectedRound(e.target.value);
                setSelectedReport("");
                request.current = null;
                setError(null);
                setPackageChecksum(null);
                onSelectRound?.(e.target.value);
              }}
            >
              {roundItems.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · version {r.version}
                </option>
              ))}
            </select>
          </label>
          {rounds.hasNextPage && (
            <button
              className={buttonClass}
              onClick={() => void rounds.fetchNextPage()}
              disabled={rounds.isFetchingNextPage}
            >
              Vis flere undersøgelser
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass + " bg-primary text-primary-foreground"}
              disabled={!canCreate || mutation.isPending || !!progress}
              onClick={() => void createAndDownload()}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Dan rapport og
              hent afleveringspakke
            </button>
          </div>
          {access.data && !access.data.canPersist && (
            <p className="text-sm text-muted-foreground">
              Du kan læse og hente gemte rapporter. En medarbejder med skriverettighed skal gemme en
              ny version.
            </p>
          )}
          {!!versions.length && (
            <label className="block text-sm">
              Gemt rapportversion
              <select
                aria-label="Gemt rapportversion"
                className="mt-1 block w-full rounded border bg-background p-2"
                value={reportId}
                disabled={!!progress || mutation.isPending}
                onChange={(e) => setSelectedReport(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version} · {new Date(v.createdAt).toLocaleString("da-DK")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reports.hasNextPage && (
            <button
              className={buttonClass}
              onClick={() => void reports.fetchNextPage()}
              disabled={reports.isFetchingNextPage}
            >
              Vis ældre rapportversioner
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {progress && (
        <p role="status" className="text-sm">
          {progress}
        </p>
      )}
      {!inputError && packageChecksum && (
        <div className="rounded-lg border p-3 text-xs">
          <p className="break-all">
            ZIP SHA-256 · {packageChecksum.name}: {packageChecksum.sha256}
          </p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() =>
              saveFile(
                new TextEncoder().encode(`${packageChecksum.sha256}  ${packageChecksum.name}\n`),
                packageChecksum.name + ".sha256",
                "text/plain",
              )
            }
          >
            Hent pakkens kontrolsum
          </button>
        </div>
      )}
    </Card>
  );
}
function SavedReport({
  report,
  withImages,
  setWithImages,
  downloading,
  onDownload,
}: {
  report: MunicipalReportVersion;
  withImages: boolean;
  setWithImages(value: boolean): void;
  downloading: boolean;
  onDownload(packageFile: boolean): Promise<void>;
}) {
  const m = report.manifest;
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <p className="font-medium">Rapportversion {report.version} · Afventer faglig gennemgang</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {m.executiveSummary.map((text) => (
          <li key={text}>{municipalReportSummaryText(m, text)}</li>
        ))}
      </ul>
      <p className="text-sm">
        {m.photos.length} fotos · {m.scope.recordingWindow.dateFrom} til{" "}
        {m.scope.recordingWindow.dateTo} · {m.scope.referenceName}
      </p>
      <details>
        <summary className="cursor-pointer font-medium">Datakilder og dækning</summary>
        <div className="mt-3 space-y-3">
          {m.sources.map((s) => (
            <div key={s.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {municipalSourceTitle(s)} · {statusLabels[s.status] ?? s.status}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.mode === "error" ? "Forsøgt" : "Hentet"} {s.fetchedAt} · periode{" "}
                {s.requestedFrom} til {s.requestedTo}
              </p>
              {s.facts.map((f) => (
                <p className="mt-1" key={f}>
                  {municipalReportSourceText(m, f)}
                </p>
              ))}
              {s.limitations.map((f) => (
                <p className="mt-1 text-xs text-muted-foreground" key={f}>
                  {municipalReportSourceText(m, f)}
                </p>
              ))}
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">
          Prioriteret opfølgning ({m.prioritizedFollowup.length})
        </summary>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
          {m.prioritizedFollowup.map((f) => (
            <li key={f.id}>
              <strong>{municipalReportSourceText(m, f.title)}</strong>
              <p>{municipalReportSourceText(m, f.rationale)}</p>
              <p>{municipalReportSourceText(m, f.action)}</p>
            </li>
          ))}
        </ol>
      </details>
      <details open>
        <summary className="cursor-pointer font-medium">
          Mangler før aflevering ({m.deliveryGaps.length})
        </summary>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
          {m.deliveryGaps.map((g) => (
            <li key={g.code}>
              <strong>{municipalReportSourceText(m, g.title)}</strong> ·{" "}
              {municipalReportSourceText(m, g.detail)}
            </li>
          ))}
        </ul>
      </details>
      <AdvancedSettings
        description="Fotoillustrationer gør PDF'en lettere at læse. Standard er til, højst 12 illustrationer. Alle fotoreferencer indgår også uden illustrationer. Valget ændrer kun downloadens præsentation, ikke den gemte rapportversion."
        onReset={() => setWithImages(true)}
        disabled={downloading}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withImages}
            onChange={(e) => setWithImages(e.target.checked)}
            disabled={downloading}
          />
          Medtag op til 12 fotoillustrationer. Alle fotoreferencer indgår.
        </label>
      </AdvancedSettings>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={downloading}
          onClick={() => void onDownload(false)}
        >
          <FileDown className="h-4 w-4" />
          Hent samlet PDF
        </button>
        <button
          className={buttonClass}
          disabled={downloading}
          onClick={() => void onDownload(true)}
        >
          Hent PDF, manifest, CSV og GeoJSON
        </button>
      </div>
      <p className="break-all text-xs text-muted-foreground">
        Gemte data SHA-256: {report.manifestSha256}
      </p>
      <p className="text-xs text-muted-foreground">
        Pakken er en rapportkladde. Kommunal delstrækning, faglig godkendelse og manglende
        datakilder skal afklares før aflevering.
      </p>
    </div>
  );
}
