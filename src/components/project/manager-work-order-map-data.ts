import type { ManagerWorkOrder, ManagerWorkOrderMapLocation } from "@/lib/manager-work-orders";

export type ManagerMapFeature = {
  key: string;
  actionId: string;
  projectId: string;
  title: string;
  projectName: string;
  color: string;
  location: ManagerWorkOrderMapLocation;
};

export function managerMapSourceLabel(location: ManagerWorkOrderMapLocation) {
  if (location.source === "plan_watercourse") return "Gemt vandløbsgrundlag";
  const role =
    location.source === "plan_visit_stop"
      ? `Besøg ${location.sequence ?? ""}`.trim()
      : location.source === "plan_site"
        ? "Planens lokalitet"
        : "Opgavens lokalitet";
  return `${role} · ${location.coordinate_source === "site_point" ? "gemt kortpunkt" : "gemt midtpunkt"}${location.archived ? " · arkiveret lokalitet" : ""}`;
}

function validCoordinate(point: unknown): point is [number, number] {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    typeof point[0] === "number" &&
    typeof point[1] === "number" &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90
  );
}

function validGeometry(location: ManagerWorkOrderMapLocation) {
  const geometry = location.geometry;
  return geometry.type === "Point"
    ? validCoordinate(geometry.coordinates)
    : geometry.type === "LineString" &&
        geometry.coordinates.length >= 2 &&
        geometry.coordinates.every(validCoordinate);
}

function colorFor(task: ManagerWorkOrder) {
  if (task.task_status === "cancelled") return "#64748b";
  if (
    task.blocked ||
    task.waiting_for_prerequisites ||
    task.task_status === "returned" ||
    task.task_status === "reopened"
  )
    return "#b45309";
  switch (task.task_status) {
    case "started":
      return "#1d4ed8";
    case "performed":
      return "#0f766e";
    case "submitted":
      return "#7c3aed";
    case "approved":
      return "#15803d";
    default:
      return "#475569";
  }
}

/** A map is a projection of these loaded jobs, never a new location search. */
export function managerMapData(items: ManagerWorkOrder[]) {
  const features: ManagerMapFeature[] = [];
  const mapped = new Set<string>();
  const seen = new Set<string>();
  for (const task of items) {
    for (const location of task.map_locations) {
      const key = `${task.project_id}:${task.action_id}:${location.id}`;
      if (seen.has(key) || !validGeometry(location)) continue;
      seen.add(key);
      features.push({
        key,
        actionId: task.action_id,
        projectId: task.project_id,
        title: task.title,
        projectName: task.project_name,
        color: colorFor(task),
        location,
      });
      mapped.add(`${task.project_id}:${task.action_id}`);
    }
  }
  return {
    features,
    mappedJobs: mapped.size,
    unmappedJobs: items.filter((task) => !mapped.has(`${task.project_id}:${task.action_id}`)),
  };
}
