import type { ProjectWorkOrderStatus as StatusProjection } from "@/lib/project-work-order-status";
import {
  projectWorkOrderStatusColor,
  projectWorkOrderStatusText,
} from "./project-work-order-status-presentation";

/** Last recorded lifecycle state; this summary makes no claim that its basis is unchanged. */
export function ProjectWorkOrderStatus({
  projection,
  legacyStatus,
}: {
  projection: StatusProjection | undefined;
  legacyStatus: string | null;
}) {
  const status = projection?.status;
  return (
    <span className="mt-2 block space-y-1 text-xs">
      <span
        className={`inline-flex rounded-md px-2 py-1 font-semibold ${projectWorkOrderStatusColor(projection)}`}
      >
        {projectWorkOrderStatusText(projection)}
      </span>
      {projection?.blocked && status !== "cancelled" && (
        <span className="ml-2 inline-flex rounded-md bg-amber-100 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Blokeret
        </span>
      )}
      {projection?.state !== "recorded" && legacyStatus?.trim() && (
        <span className="block text-muted-foreground">Tidligere status: {legacyStatus}</span>
      )}
    </span>
  );
}
