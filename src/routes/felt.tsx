import { createFileRoute } from "@tanstack/react-router";
import { FieldPhotoUuid } from "@/lib/field-photo-upload";
import { WorkOrderActionIdSchema } from "@/lib/work-order-access";
import { FieldOfflineWorkspace } from "@/components/project/FieldOfflineWorkspace";

export const Route = createFileRoute("/felt")({
  ssr: false,
  head: () => ({ meta: [{ title: "Freyra i felten" }] }),
  validateSearch: (
    raw: Record<string, unknown>,
  ): { project?: string; round?: string; task?: string } => {
    const parsed = FieldPhotoUuid.safeParse(raw.project);
    const round = FieldPhotoUuid.safeParse(raw.round);
    const task = WorkOrderActionIdSchema.safeParse(raw.task);
    return {
      ...(parsed.success ? { project: parsed.data } : {}),
      ...(round.success ? { round: round.data } : {}),
      ...(parsed.success && task.success ? { task: task.data.toLowerCase() } : {}),
    };
  },
  component: FieldPage,
});
function FieldPage() {
  const { project, round, task } = Route.useSearch();
  return (
    <FieldOfflineWorkspace
      key={`${project ?? ""}:${round ?? ""}:${task ?? ""}`}
      requestedProject={project}
      requestedRound={round}
      requestedActionId={task}
    />
  );
}
