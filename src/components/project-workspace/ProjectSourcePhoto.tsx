import { useQuery } from "@tanstack/react-query";
import { getProjectMedia } from "@/services/project-media-service";
import { MediaLightbox } from "./MediaLightbox";

export function ProjectSourcePhoto({
  projectId,
  mediaId,
  actorId,
  onClose,
}: {
  projectId: string;
  mediaId: string;
  actorId?: string;
  onClose: () => void;
}) {
  const photo = useQuery({
    queryKey: ["project-source-photo", projectId, actorId, mediaId],
    enabled: !!actorId,
    gcTime: 0,
    refetchOnMount: "always",
    retry: false,
    throwOnError: false,
    queryFn: async () => {
      const { data, error } = await getProjectMedia(projectId, mediaId);
      if (error || !data || data.projectId !== projectId || data.id !== mediaId)
        throw new Error("Fotoet i linket kunne ikke åbnes med din aktuelle projektadgang.");
      return data;
    },
  });
  if (actorId && photo.isSuccess && !photo.isFetching)
    return <MediaLightbox items={[photo.data]} activeId={mediaId} onClose={onClose} />;
  return (
    <section className="space-y-3 p-4">
      <p role={photo.isError ? "alert" : "status"}>
        {photo.isError
          ? photo.error.message
          : actorId
            ? "Kontrollerer adgangen til originalfotoet…"
            : "Log ind for at åbne originalfotoet."}
      </p>
      {photo.isError && (
        <button
          type="button"
          className="min-h-11 rounded-lg border px-3"
          onClick={() => void photo.refetch()}
        >
          Prøv igen
        </button>
      )}
      <button type="button" className="min-h-11 px-3 text-primary underline" onClick={onClose}>
        Vis projektets fotogalleri
      </button>
    </section>
  );
}
