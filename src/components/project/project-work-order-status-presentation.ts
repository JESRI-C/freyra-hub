import type { ProjectWorkOrderStatus } from "@/lib/project-work-order-status";
import { workOrderStatusLabels, type WorkOrderStatus } from "@/lib/work-order-lifecycle";

const neutral = "bg-muted text-muted-foreground";
const colors: Partial<Record<WorkOrderStatus, string>> = {
  started: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  performed: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100",
  submitted: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  approved: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
  returned: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  reopened: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
};

export function projectWorkOrderStatusText(projection: ProjectWorkOrderStatus | undefined) {
  if (!projection) return "Status ikke hentet";
  if (projection.state === "missing") return "Jobstatus mangler";
  if (projection.state === "unrecognized" || !projection.status) return "Ukendt jobstatus";
  return `Senest registreret: ${workOrderStatusLabels[projection.status]}`;
}

export function projectWorkOrderStatusColor(projection: ProjectWorkOrderStatus | undefined) {
  const status = projection?.status;
  return projection?.state === "recorded" && status
    ? (colors[status] ?? (status === "cancelled" ? neutral : "bg-muted text-foreground"))
    : neutral;
}

export function projectWorkOrderOptionLabel(action: {
  title: string;
  status: string | null;
  workOrderStatus?: ProjectWorkOrderStatus;
}) {
  return [
    action.title,
    projectWorkOrderStatusText(action.workOrderStatus),
    action.workOrderStatus?.blocked && action.workOrderStatus.status !== "cancelled"
      ? "Blokeret"
      : null,
    action.workOrderStatus?.state !== "recorded" && action.status?.trim()
      ? `Tidligere status: ${action.status}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
