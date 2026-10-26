import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUploads } from "@/services/monitoring/uploads-service";
import { validateDroneOriginal } from "@/lib/drone-original-validation.functions";
import { promoteDroneOriginal } from "@/lib/drone-original-promotion.functions";
import type { CanonicalDroneBatch } from "@/components/monitoring/DroneBeforeBatchWizard";
import { prepareSeededOriginals } from "./seeded-originals";

/** Seed files pass through the same server validation and promotion as UI uploads. */
export function SeededOriginalsPanel({
  projectId,
  actorId,
  canPrepare,
  onCanonicalBatch,
}: {
  projectId: string;
  actorId: string;
  canPrepare: boolean;
  onCanonicalBatch(batch: CanonicalDroneBatch): void;
}) {
  // Changing identity unmounts the previous operation and clears its local state.
  return (
    <SeededOriginalsSession
      key={`${actorId}:${projectId}`}
      {...{ projectId, actorId, canPrepare, onCanonicalBatch }}
    />
  );
}

function SeededOriginalsSession({
  projectId,
  actorId,
  canPrepare,
  onCanonicalBatch,
}: {
  projectId: string;
  actorId: string;
  canPrepare: boolean;
  onCanonicalBatch(batch: CanonicalDroneBatch): void;
}) {
  const query = useQuery({
    queryKey: ["haderslev-seed-uploads", actorId, projectId],
    queryFn: () => listUploads({ projectId, limit: 200 }),
    enabled: !!actorId && !!projectId,
    retry: false,
  });
  const validate = useServerFn(validateDroneOriginal),
    promote = useServerFn(promoteDroneOriginal);
  const [progress, setProgress] = useState<string | null>(null),
    [error, setError] = useState(false);
  const lock = useRef(false),
    mounted = useRef(false),
    allowed = useRef(canPrepare);
  allowed.current = canPrepare;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const seeded =
    (query.isError ? undefined : query.data)?.filter(
      (row) =>
        row.project_id === projectId &&
        row.user_metadata &&
        typeof row.user_metadata === "object" &&
        !Array.isArray(row.user_metadata) &&
        row.user_metadata.seedVersion === "2710/v1",
    ) ?? [];
  async function prepare() {
    if (lock.current || !canPrepare || query.isError || query.isFetching || !seeded.length) return;
    lock.current = true;
    setError(false);
    const current = () => mounted.current && allowed.current;
    try {
      const batch = await prepareSeededOriginals({
        projectId,
        actorId,
        uploadIds: seeded.map((row) => row.id),
        isCurrent: current,
        onProgress: setProgress,
        validate,
        promote,
      });
      if (batch && current()) onCanonicalBatch(batch);
    } catch {
      if (current()) setError(true);
    } finally {
      lock.current = false;
      if (mounted.current) setProgress(null);
    }
  }
  if (query.isError)
    return (
      <p role="status" className="rounded-xl border p-4 text-sm">
        De gemte originaler kunne ikke hentes.{" "}
        <button type="button" className="underline" onClick={() => void query.refetch()}>
          Prøv igen
        </button>
        .
      </p>
    );
  if (!seeded.length) return null;
  return (
    <div className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="font-semibold">Originaler klar i sagen</h3>
      <p className="text-sm text-muted-foreground">
        {seeded.length} originaler er modtaget via sagens klargøring. Kontrollér dem på serveren og
        fortsæt med sted og datagrundlag.
      </p>
      <button
        type="button"
        disabled={!canPrepare || query.isFetching || !!progress}
        onClick={() => void prepare()}
        className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
      >
        {progress ?? "Kontrollér og åbn de gemte originaler"}
      </button>
      {error && (
        <p role="alert" className="text-sm">
          Kontrollen blev ikke færdig. Originalerne er bevaret. Prøv samme kontrol igen.
        </p>
      )}
    </div>
  );
}
