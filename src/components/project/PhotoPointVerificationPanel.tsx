import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSurveyRoundMedia,
  listSurveyRoundMediaCandidates,
  getSurveyRoundMediaOriginalUrl,
} from "@/lib/survey-round-media.functions";
import { listDroneImageInspections } from "@/lib/drone-image-inspection.functions";
import { listPhotoPointReviews, savePhotoPointReview } from "@/lib/photo-point-review.functions";
import { PhotoPointReviewInputSchema } from "@/services/monitoring/photo-point-review";
import { describeDroneVisualInDanish } from "@/services/monitoring/drone-visual-presentation";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import { BaselineSourceData } from "./BaselineSourceData";
import { SavedOrthophotoPreview } from "./SavedOrthophotoPreview";

type Props = {
  projectId: string;
  actorId: string;
  snapshot: PublicBaselineSnapshot;
  roundId: string;
  canReview: boolean;
  refreshToken?: number;
};

export function PhotoPointVerificationPanel(props: Props) {
  const list = useServerFn(listSurveyRoundMedia);
  const listOriginals = useServerFn(listSurveyRoundMediaCandidates);
  const originals = useQuery({
    queryKey: ["photo-point-original-names", props.actorId, props.projectId, props.refreshToken],
    queryFn: () => listOriginals({ data: { projectId: props.projectId, limit: 30 } }),
    retry: false,
  });
  const query = useInfiniteQuery({
    queryKey: [
      "photo-point-bindings",
      props.actorId,
      props.projectId,
      props.roundId,
      props.refreshToken,
    ],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      list({
        data: {
          projectId: props.projectId,
          roundVersionId: props.roundId,
          beforeVersion: pageParam,
          limit: 30,
        },
      }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    retry: false,
  });
  const bindings = (
    query.error ? [] : (query.data?.pages.flatMap((page) => page.items) ?? [])
  ).filter(
    (binding) =>
      binding.manifest.baselineId === props.snapshot.id &&
      binding.manifest.baselineSha256 === props.snapshot.manifestSha256,
  );
  return (
    <section className="space-y-4 rounded-xl border p-5" aria-label="Verifikation pr. fotopunkt">
      <h3 className="font-semibold">Verifikation pr. fotopunkt</h3>
      <p className="text-sm text-muted-foreground">
        Sammenhold originalfoto, den gemte offentlige kildeversion og eventuelle AI-forslag. Bekræft
        eller afvis sammenhængen med en faglig begrundelse. Hver beslutning gemmes uændret i
        revisionssporet.
      </p>
      {query.isLoading && <p role="status">Henter fotopunkter …</p>}
      {query.error && (
        <p role="alert">
          Fotopunkterne kunne ikke hentes. Genåbn undersøgelsen med din aktuelle adgang.
        </p>
      )}
      {!query.isLoading && !query.error && bindings.length === 0 && (
        <p>Ingen originalfotos er knyttet til denne undersøgelse endnu.</p>
      )}
      {bindings.map((binding, index) => (
        <details key={binding.id} className="rounded-lg border p-4" open={bindings.length === 1}>
          <summary className="cursor-pointer font-medium">
            Fotopunkt {index + 1} ·{" "}
            {(!originals.error &&
              originals.data?.items.find(
                (item) =>
                  item.mediaId === binding.mediaId &&
                  item.originalSha256 === binding.manifest.originalSha256,
              )?.fileName) ||
              binding.mediaId.slice(0, 8)}
          </summary>
          <PhotoPoint key={`${props.actorId}:${binding.id}`} {...props} binding={binding} />
        </details>
      ))}
      {query.hasNextPage && (
        <button
          type="button"
          className="rounded border px-3 py-2"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Hent flere fotopunkter
        </button>
      )}
    </section>
  );
}

export function PhotoPublicContext({
  snapshot,
  binding,
}: {
  snapshot: PublicBaselineSnapshot;
  binding: SurveyRoundMediaVersion;
}) {
  const manifest = snapshot.manifest;
  const camera = binding.manifest.sourceMetadata.cameraPosition;
  const [west, south, east, north] = manifest.project.bbox;
  const midLat = (south + north) / 2;
  const xScale = Math.cos((midLat * Math.PI) / 180);
  const width = Math.max((east - west) * xScale, 0.000001),
    height = Math.max(north - south, 0.000001);
  const scale = Math.min(480 / width, 320 / height);
  const point = (lng: number, lat: number) => [
    20 + (480 - width * scale) / 2 + (lng - west) * xScale * scale,
    20 + (320 - height * scale) / 2 + (north - lat) * scale,
  ];
  const path = (coordinates: number[][]) =>
    coordinates
      .map(([lng, lat], index) => `${index ? "L" : "M"}${point(lng, lat).join(" ")}`)
      .join(" ");
  const [cx, cy] = camera ? point(camera.longitude, camera.latitude) : [0, 0];
  return (
    <div className="space-y-3" aria-label="Offentligt datagrundlag for fotopunktet">
      <h4 className="font-medium">Offentlige lag · kildeversion {snapshot.version}</h4>
      <SavedOrthophotoPreview
        source={manifest.sources.find((source) => source.id === "orthophoto-preview")}
        camera={camera ? { lat: camera.latitude, lng: camera.longitude } : null}
      />
      <svg
        role="img"
        aria-label="Gemt undersøgelsesområde, officiel vandløbslinje og kameraets GPS-position"
        viewBox="0 0 520 360"
        className="w-full rounded-lg border bg-slate-50"
      >
        <title>Gemt offentlig vandløbsreference og undersøgelsesområde. Ikke et ortofoto.</title>
        <path
          d={manifest.project.polygon.coordinates.map((ring) => `${path(ring)} Z`).join(" ")}
          fill="#dcfce7"
          fillRule="evenodd"
          stroke="#166534"
          strokeWidth="2"
        />
        {manifest.reference.geometry.coordinates.map((line, index) => (
          <path key={index} d={path(line)} fill="none" stroke="#0369a1" strokeWidth="3" />
        ))}
        {camera && <circle cx={cx} cy={cy} r="6" fill="#b45309" stroke="white" strokeWidth="2" />}
        <text x="485" y="24" fontSize="14" fill="#334155">
          N ↑
        </text>
      </svg>
      <p className="text-xs">
        Blå: officiel vandløbsreference. Grøn: undersøgelsesområde. Orange: kamera-GPS; placeringen
        af synlige objekter og billedets dækningsområde er ikke fastlagt.
      </p>
      {!camera && (
        <p className="text-sm">Kameraets GPS-position mangler i denne originale filreference.</p>
      )}
      <p className="text-xs">
        {manifest.reference.attribution} · gemt{" "}
        {new Date(manifest.reference.savedAt).toLocaleDateString("da-DK")}
      </p>
      {manifest.sources.map((source) => (
        <details key={source.id} className="rounded border p-2 text-sm">
          <summary>
            {source.dataset} ·{" "}
            {(source.mode === "live" || source.mode === "import") && source.payload !== null
              ? source.status === "complete"
                ? "hentet"
                : "delvist"
              : "ikke tilgængelig"}
          </summary>
          <p className="my-2 text-xs">
            Hentet {new Date(source.fetchedAt).toLocaleString("da-DK")} · {source.provider}
          </p>
          <BaselineSourceData source={source} />
        </details>
      ))}
    </div>
  );
}

function PhotoPoint({
  binding,
  snapshot,
  actorId,
  projectId,
  canReview,
  refreshToken,
}: Props & { binding: SurveyRoundMediaVersion }) {
  const getOriginal = useServerFn(getSurveyRoundMediaOriginalUrl);
  const getInspections = useServerFn(listDroneImageInspections);
  const listReviews = useServerFn(listPhotoPointReviews);
  const saveReview = useServerFn(savePhotoPointReview);
  const cache = useQueryClient();
  const alive = useRef(true);
  const expiry = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [decision, setDecision] = useState<"confirmed" | "rejected" | "">("");
  const [note, setNote] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const receipt = useRef<{ requestId: string; text: string } | null>(null);
  const [uncertainSave, setUncertainSave] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(expiry.current);
    };
  }, []);
  const preview = useMutation({
    mutationFn: async () => {
      const result = await getOriginal({ data: { projectId, bindingId: binding.id } });
      if (
        result.bindingId !== binding.id ||
        result.bindingSha256 !== binding.manifestSha256 ||
        result.originalSha256 !== binding.manifest.originalSha256
      )
        throw new Error("Originalens identitet kunne ikke bekræftes.");
      if (!alive.current) return;
      clearTimeout(expiry.current);
      setPhotoUrl(result.signedUrl);
      expiry.current = setTimeout(() => {
        if (alive.current) setPhotoUrl(null);
      }, 55_000);
    },
    retry: false,
  });
  const inspections = useQuery({
    queryKey: ["photo-point-inspection", actorId, projectId, binding.id, refreshToken],
    queryFn: () => getInspections({ data: { projectId, mediaId: binding.mediaId, limit: 30 } }),
    retry: false,
  });
  const inspection = inspections.error
    ? undefined
    : inspections.data?.items.find(
        (item) =>
          item.originalSha256 === binding.manifest.originalSha256 &&
          item.sourceSnapshotId === snapshot.id &&
          item.sourceSnapshotHash === snapshot.manifestSha256,
      );
  const reviewKey = ["photo-point-reviews", actorId, projectId, binding.id];
  const reviews = useQuery({
    queryKey: reviewKey,
    queryFn: () => listReviews({ data: { projectId, bindingId: binding.id } }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (
        !canReview ||
        reviews.isFetching ||
        reviews.error ||
        inspections.isFetching ||
        inspections.error
      )
        throw new Error("Afventer læsning og adgang.");
      const body = {
        projectId,
        bindingId: binding.id,
        bindingSha256: binding.manifestSha256,
        expectedCallerUserId: actorId,
        decision,
        note,
        reviewerName,
        inspectionId: inspection?.id ?? null,
        inspectionSha256: inspection?.resultSha256 ?? null,
      };
      const text = JSON.stringify(body);
      if (uncertainSave && receipt.current?.text !== text)
        throw new Error("Afklar seneste gemning først.");
      const requestId =
        receipt.current?.text === text ? receipt.current.requestId : crypto.randomUUID();
      const input = PhotoPointReviewInputSchema.parse({ ...body, requestId });
      receipt.current = { text, requestId };
      const result = await saveReview({ data: input });
      if (!alive.current) return;
      setMessage(
        `Faglig ${result.review.decision === "confirmed" ? "bekræftelse" : "afvisning"} gemt. SHA-256: ${result.reviewSha256}`,
      );
      setUncertainSave(false);
      receipt.current = null;
      await cache.invalidateQueries({ queryKey: reviewKey });
    },
    onError: () => {
      if (alive.current && receipt.current) setUncertainSave(true);
    },
    retry: false,
  });
  const locked =
    !canReview ||
    save.isPending ||
    uncertainSave ||
    reviews.isFetching ||
    !!reviews.error ||
    inspections.isFetching ||
    !!inspections.error;
  const visualPresentation = inspection?.result
    ? describeDroneVisualInDanish(inspection.result.visual)
    : null;
  return (
    <div className="mt-4 space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h4 className="font-medium">Originalt dronefoto</h4>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            disabled={preview.isPending}
            onClick={() => preview.mutate()}
          >
            {preview.isPending ? "Henter originalfoto …" : "Vis originalfoto"}
          </button>
          {photoUrl && (
            <img
              src={photoUrl}
              alt={`Originalfoto ${binding.mediaId.slice(0, 8)}`}
              referrerPolicy="no-referrer"
              className="max-h-[38rem] w-full rounded-lg border object-contain"
            />
          )}
          {preview.error && (
            <p role="alert">
              Originalfotoet kunne ikke vises med din aktuelle adgang. Filen er bevaret.
            </p>
          )}
          <p className="break-all text-xs">Original SHA-256: {binding.manifest.originalSha256}</p>
          <p className="text-xs">
            Optaget:{" "}
            {binding.manifest.sourceMetadata.capture.localTimestamp ??
              binding.manifest.sourceMetadata.capture.capturedAtUtc ??
              "Dato mangler"}
          </p>
          <h4 className="font-medium">AI-vurdering</h4>
          {inspection?.result && visualPresentation ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Gemt vurdering</strong> ·{" "}
                {new Date(inspection.completedAt!).toLocaleString("da-DK")}
              </p>
              <p>{visualPresentation.qualityLimitation}</p>
              {visualPresentation.features.map((feature, index) => (
                <p key={index}>
                  {feature.appearance}{" "}
                  <span className="text-muted-foreground">{feature.uncertainty}</span>
                </p>
              ))}
              <p>{visualPresentation.uncertainty}</p>
              <p className="text-xs">
                Vist på dansk ud fra modellens kategorier. Originalteksten er bevaret i
                dokumentationsgrundlaget. AI-forslag er ikke fagligt godkendte observationer.
              </p>
            </div>
          ) : (
            <p className="text-sm">
              {inspections.isLoading
                ? "Henter gemt vurdering …"
                : inspections.error
                  ? "AI-vurderingen kunne ikke hentes."
                  : "Ingen gyldig gemt AI-vurdering for dette foto og denne kildeversion. Punktet kan gennemgås manuelt."}
            </p>
          )}
        </div>
        <PhotoPublicContext snapshot={snapshot} binding={binding} />
      </div>
      <fieldset disabled={locked} className="space-y-3 rounded border p-4">
        <legend className="px-1 font-medium">Faglig kontrol af fotopunktet</legend>
        <p className="text-sm">
          Vurder om fotoets synlige forhold understøtter sammenhængen med det viste offentlige
          grundlag. En bekræftelse godkender hverken hele rapporten eller juridiske forhold.
        </p>
        <label className="block text-sm">
          Navn og faglig rolle
          <input
            className="mt-1 block w-full rounded border p-2"
            value={reviewerName}
            maxLength={150}
            onChange={(event) => setReviewerName(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          Beslutning
          <select
            className="mt-1 block w-full rounded border bg-background p-2"
            value={decision}
            onChange={(event) => setDecision(event.target.value as typeof decision)}
          >
            <option value="" disabled>
              Vælg efter gennemgang
            </option>
            <option value="confirmed">Fagligt bekræftet</option>
            <option value="rejected">Fagligt afvist</option>
          </select>
        </label>
        <label className="block text-sm">
          Begrundelse og manglende data
          <textarea
            className="mt-1 block min-h-24 w-full rounded border p-2"
            value={note}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </fieldset>
      {canReview ? (
        <button
          type="button"
          className="rounded bg-primary px-3 py-2 text-primary-foreground"
          disabled={
            save.isPending ||
            reviews.isFetching ||
            !!reviews.error ||
            inspections.isFetching ||
            !!inspections.error ||
            !decision ||
            !note.trim() ||
            !reviewerName.trim()
          }
          onClick={() => save.mutate()}
        >
          {uncertainSave ? "Kontrollér seneste gemning" : "Gem faglig vurdering i revisionssporet"}
        </button>
      ) : (
        <p className="text-sm">Du har læseadgang. En faglig vurdering kræver redigeringsadgang.</p>
      )}
      {save.error && (
        <p role="alert">
          Vurderingen kunne ikke bekræftes gemt. Kontrollér de udfyldte felter og din adgang; prøv
          igen med samme indhold.
        </p>
      )}
      {message && (
        <p role="status" className="break-all text-sm">
          {message}
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-medium">Revisionsspor for fotopunktet</summary>
        {reviews.error && <p role="alert">Revisionssporet kunne ikke hentes.</p>}
        {!reviews.error && !reviews.isLoading && reviews.data?.items.length === 0 && (
          <p>Ingen faglig beslutning er gemt endnu.</p>
        )}
        {!reviews.error &&
          reviews.data?.items.map((review) => (
            <article key={review.id} className="my-3 space-y-1 rounded border p-3 text-sm">
              <p>
                <strong>
                  {review.review.decision === "confirmed" ? "Fagligt bekræftet" : "Fagligt afvist"}
                </strong>{" "}
                · {review.review.reviewerName} ·{" "}
                {new Date(review.createdAt).toLocaleString("da-DK")}
              </p>
              <p className="whitespace-pre-wrap">{review.review.note}</p>
              <p className="break-all text-xs">
                Bruger: {review.reviewedBy} · SHA-256: {review.reviewSha256}
              </p>
            </article>
          ))}
        {reviews.data?.hasMore && (
          <p className="text-xs">
            Viser de 30 seneste beslutninger. Ældre versioner er bevaret i revisionssporet.
          </p>
        )}
      </details>
    </div>
  );
}
