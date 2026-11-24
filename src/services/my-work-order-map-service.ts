import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { MyWorkOrder } from "@/lib/work-order-assignments";
import { ManagerWorkOrderMapLocationSchema } from "@/lib/manager-work-orders";
import {
  workOrderMapColor,
  type ManagerMapFeature,
} from "@/components/project/manager-work-order-map-data";

const siteSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  status: z.string().nullable(),
  archived_at: z.string().nullable(),
  centroid_lng: z.number().nullable(),
  centroid_lat: z.number().nullable(),
  geometry_geojson: z.unknown(),
});
const lineSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  source: z.string(),
  crs: z.string(),
  geometry: z.unknown(),
});
const position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
function pointGeometry(raw: unknown) {
  const parsed = z
    .object({ type: z.literal("Point"), coordinates: z.array(z.unknown()) })
    .safeParse(raw);
  if (!parsed.success) return null;
  const coordinates = position.safeParse(parsed.data.coordinates.slice(0, 2));
  return coordinates.success ? { type: "Point" as const, coordinates: coordinates.data } : null;
}
function lineGeometry(raw: unknown) {
  const parsed = z
    .object({ type: z.literal("LineString"), coordinates: z.array(z.array(z.unknown())).min(2) })
    .safeParse(raw);
  if (!parsed.success) return null;
  const coordinates = parsed.data.coordinates.map((row) => position.safeParse(row.slice(0, 2)));
  return coordinates.every((row) => row.success)
    ? { type: "LineString" as const, coordinates: coordinates.map((row) => row.data!) }
    : null;
}
const unavailable = () =>
  new Error("Arbejdsstederne kunne ikke hentes. Opdater dine opgaver og prøv igen.");

/** Reads only saved locations referenced by these already-authorized personal tasks. */
export async function readMyWorkOrderMap(
  actorId: string,
  tasks: MyWorkOrder[],
  signal?: AbortSignal,
) {
  if (
    !z.string().uuid().safeParse(actorId).success ||
    tasks.some((task) => task.user_id !== actorId)
  )
    throw unavailable();
  const projects = new Map<
    string,
    { organizationId: string; sites: Set<string>; lines: Set<string> }
  >();
  for (const task of tasks) {
    let group = projects.get(task.project_id);
    if (group && group.organizationId !== task.organization_id) throw unavailable();
    if (!group) {
      group = { organizationId: task.organization_id, sites: new Set(), lines: new Set() };
      projects.set(task.project_id, group);
    }
    if (task.plan.siteId) group.sites.add(task.plan.siteId);
    for (const stop of task.plan.visitStops ?? []) group.sites.add(stop.siteId);
    if (task.plan.watercourseVersionId) group.lines.add(task.plan.watercourseVersionId);
  }
  const sites = new Map<string, z.infer<typeof siteSchema>>();
  const lines = new Map<string, z.infer<typeof lineSchema>>();
  const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  for (const [projectId, group] of projects) {
    for (const [table, ids, schema, fields, output] of [
      [
        "sites",
        [...group.sites],
        siteSchema,
        "id,project_id,name,status,archived_at,centroid_lng,centroid_lat,geometry_geojson",
        sites,
      ],
      [
        "watercourse_versions",
        [...group.lines],
        lineSchema,
        "id,project_id,organization_id,source,crs,geometry",
        lines,
      ],
    ] as const) {
      for (let index = 0; index < ids.length; index += 40) {
        const batch = ids.slice(index, index + 40);
        const { data, error } = await client
          .from(table)
          .select(fields)
          .eq("project_id", projectId)
          .in("id", batch)
          .abortSignal(signal!);
        if (error) throw unavailable();
        const parsed = z.array(schema).max(batch.length).safeParse(data);
        if (!parsed.success) throw unavailable();
        for (const row of parsed.data) {
          if (
            row.project_id !== projectId ||
            !batch.includes(row.id) ||
            output.has(row.id) ||
            ("organization_id" in row && row.organization_id !== group.organizationId)
          )
            throw unavailable();
          // Each branch validates the complete source row before adding it.
          if (table === "sites") sites.set(row.id, siteSchema.parse(row));
          else lines.set(row.id, lineSchema.parse(row));
        }
      }
    }
  }
  const features: ManagerMapFeature[] = [];
  const mapped = new Set<string>();
  for (const task of tasks) {
    const refs = [
      ...(task.plan.siteId ? [{ id: task.plan.siteId, source: "plan_site", sequence: 0 }] : []),
      ...(task.plan.visitStops ?? []).map((stop, index) => ({
        id: stop.siteId,
        source: "plan_visit_stop",
        sequence: index + 1,
      })),
    ];
    const locations: unknown[] = refs.flatMap((ref) => {
      const site = sites.get(ref.id);
      if (!site || site.project_id !== task.project_id) return [];
      const centroid = pointGeometry({
        type: "Point",
        coordinates: [site.centroid_lng, site.centroid_lat],
      });
      const geometry = centroid ?? pointGeometry(site.geometry_geojson);
      return geometry
        ? [
            {
              id: `${ref.source}:${ref.sequence}:${ref.id}`,
              source: ref.source,
              source_id: ref.id,
              source_version_id: null,
              name: site.name,
              archived: site.status === "archived" || site.archived_at !== null,
              coordinate_source: centroid ? "site_stored_centroid" : "site_point",
              sequence: ref.sequence,
              geometry,
            },
          ]
        : [];
    });
    const line = task.plan.watercourseVersionId ? lines.get(task.plan.watercourseVersionId) : null;
    if (
      line &&
      line.project_id === task.project_id &&
      line.organization_id === task.organization_id &&
      line.crs === "EPSG:4326"
    ) {
      const geometry = lineGeometry(line.geometry);
      if (geometry)
        locations.push({
          id: `plan_watercourse:${line.id}`,
          source: "plan_watercourse",
          source_id: line.id,
          source_version_id: line.id,
          name: line.source,
          archived: false,
          coordinate_source: "pinned_centerline",
          sequence: null,
          geometry,
        });
    }
    for (const raw of locations) {
      const parsed = ManagerWorkOrderMapLocationSchema.safeParse(raw);
      if (!parsed.success) continue;
      const location = parsed.data;
      features.push({
        key: `${task.project_id}:${task.action_id}:${location.id}`,
        actionId: task.action_id,
        projectId: task.project_id,
        title: task.plan.title,
        projectName: "",
        contextLabel: location.name,
        color: workOrderMapColor({
          ...task,
          task_status: task.cancelled ? "cancelled" : task.task_status,
        }),
        location,
      });
      mapped.add(task.action_id);
    }
  }
  return {
    features,
    mappedJobs: mapped.size,
    unmappedJobs: tasks.filter((task) => !mapped.has(task.action_id)),
  };
}
