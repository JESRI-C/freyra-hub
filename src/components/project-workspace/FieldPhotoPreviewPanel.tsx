import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { FieldPhotoBackgroundJobSchema, parseFieldPhotoPreview } from "@/lib/field-photo-preview";
import type { SupabaseClient } from "@supabase/supabase-js";

export function FieldPhotoPreviewPanel({
  projectId,
  uploadId,
  actorId,
}: {
  projectId: string;
  uploadId: string;
  actorId: string;
}) {
  const result = useQuery({
    queryKey: ["field-photo-preview", projectId, uploadId, actorId],
    retry: false,
    refetchInterval: (query) =>
      query.state.error
        ? false
        : query.state.data?.url
          ? 45000
          : ["pending", "running", "retry_wait"].includes(query.state.data?.state ?? "")
            ? 15000
            : false,
    queryFn: async () => {
      if (!supabase) throw new Error("Visningsbilledet kunne ikke hentes.");
      const db: SupabaseClient = supabase;
      const [jobResult, previewResult] = await Promise.all([
        db
          .from("field_photo_background_jobs")
          .select("*")
          .eq("project_id", projectId)
          .eq("upload_id", uploadId)
          .maybeSingle(),
        db
          .from("field_photo_previews")
          .select("*")
          .eq("project_id", projectId)
          .eq("upload_id", uploadId)
          .maybeSingle(),
      ]);
      if (jobResult.error || previewResult.error)
        throw new Error("Visningsbilledets behandling kunne ikke læses i dette miljø.");
      const job = jobResult.data ? FieldPhotoBackgroundJobSchema.parse(jobResult.data) : null;
      if (job && (job.project_id !== projectId || job.upload_id !== uploadId))
        throw new Error("Visningsbilledet har forkert projekt.");
      if (!previewResult.data)
        return { url: null, state: job?.state ?? "pending", error: job?.last_error ?? null };
      const preview = parseFieldPhotoPreview(previewResult.data, projectId, uploadId);
      const signed = await db.storage
        .from("field-photo-previews")
        .createSignedUrl(preview.storage_path, 60);
      if (signed.error || !signed.data?.signedUrl)
        throw new Error("Visningsbilledet kunne ikke åbnes med din aktuelle projektadgang.");
      return {
        url: signed.data.signedUrl,
        state: "ready",
        error: null,
        width: preview.width,
        height: preview.height,
      };
    },
  });
  const current = result.data;
  return (
    <div className="space-y-2 text-sm" aria-label="Visningsbillede">
      {result.isPending ? (
        <p>Henter visningsbillede…</p>
      ) : result.error ? (
        <p role="alert">{result.error.message}</p>
      ) : current?.url ? (
        <>
          <img
            src={current.url}
            alt="Visningsudgave af feltfotoet"
            width={current.width}
            height={current.height}
            loading="lazy"
            className="max-h-80 max-w-full rounded object-contain"
          />
          <p>Komprimeret visningsudgave. Originalfilen er bevaret særskilt.</p>
        </>
      ) : current?.state === "unsupported" ? (
        <p>
          {current.error === "source_too_large"
            ? "Originalen er for stor til automatisk visningsbillede. Den er bevaret."
            : "Der kunne ikke dannes et visningsbillede i dette format. Originalen er bevaret."}
        </p>
      ) : current?.state === "blocked" ? (
        <p>Behandlingen afventer projektadgang. Originalen er bevaret.</p>
      ) : current?.state === "failed" ? (
        <p>Visningsbilledet kræver afklaring efter en behandlingsfejl. Originalen er bevaret.</p>
      ) : (
        <p>Visningsbilledet afventer baggrundsbehandling.</p>
      )}
    </div>
  );
}
