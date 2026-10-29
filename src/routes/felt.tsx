import { createFileRoute } from "@tanstack/react-router";
import { FieldPhotoUuid } from "@/lib/field-photo-upload";
import { FieldOfflineWorkspace } from "@/components/project/FieldOfflineWorkspace";

export const Route = createFileRoute("/felt")({
  ssr: false,
  head: () => ({ meta: [{ title: "Freyra i felten" }] }),
  validateSearch: (raw: Record<string, unknown>): { project?: string; round?: string } => {
    const parsed = FieldPhotoUuid.safeParse(raw.project);
    const round = FieldPhotoUuid.safeParse(raw.round);
    return {
      ...(parsed.success ? { project: parsed.data } : {}),
      ...(round.success ? { round: round.data } : {}),
    };
  },
  component: FieldPage,
});
function FieldPage() {
  const { project, round } = Route.useSearch();
  return <FieldOfflineWorkspace requestedProject={project} requestedRound={round} />;
}
