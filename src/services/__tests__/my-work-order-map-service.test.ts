import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
import type { MyWorkOrder } from "@/lib/work-order-assignments";
const m = vi.hoisted(() => ({ read: vi.fn(), actor: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: (actor: string) => {
    m.actor(actor);
    return {
      from: (table: string) => ({
        select: (fields: string) => ({
          eq: (column: string, project: string) => ({
            in: (key: string, ids: string[]) => ({
              abortSignal: (signal: AbortSignal) =>
                m.read({ table, fields, column, project, key, ids, signal }),
            }),
          }),
        }),
      }),
    };
  },
}));
import { readMyWorkOrderMap } from "../my-work-order-map-service";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1);
const task: MyWorkOrder = {
  user_id: actor,
  action_id: id(2),
  organization_id: id(3),
  project_id: id(4),
  plan_version_id: id(5),
  plan_version: 1,
  plan: { ...emptyWorkOrderPlan("Syntetisk kortopgave"), siteId: id(10) },
  assignment_id: id(6),
  assignment_version: 1,
  assignment_mode: "person",
  claimed_by: null,
  can_claim: false,
  can_execute: true,
  can_review: false,
  can_plan: false,
  waiting_for_prerequisites: false,
  cancelled: false,
};
const site = {
  id: id(10),
  project_id: id(4),
  name: "Syntetisk arbejdssted",
  status: "active",
  archived_at: null,
  centroid_lng: null,
  centroid_lat: null,
  geometry_geojson: { type: "Point", coordinates: [9, 56] },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockResolvedValue({ data: [site], error: null });
});
describe("personal work-order map", () => {
  it("requests only referenced sites in the actor's exact project and preserves zero coordinates", async () => {
    m.read.mockResolvedValue({
      data: [{ ...site, geometry_geojson: { type: "Point", coordinates: [0, 0, 7] } }],
      error: null,
    });
    const signal = new AbortController().signal;
    const result = await readMyWorkOrderMap(actor, [task], signal);
    expect(m.actor).toHaveBeenCalledWith(actor);
    expect(m.read.mock.calls[0][0]).toMatchObject({
      table: "sites",
      column: "project_id",
      project: id(4),
      key: "id",
      ids: [id(10)],
      signal,
    });
    expect(result.features[0].location.geometry).toEqual({ type: "Point", coordinates: [0, 0] });
    expect(result.mappedJobs).toBe(1);
    expect(result.unmappedJobs).toEqual([]);
  });
  it("uses a stored edited midpoint before an older imported point and labels its source", async () => {
    m.read.mockResolvedValue({
      data: [{ ...site, centroid_lng: 10, centroid_lat: 57, archived_at: "2026-11-24T00:00:00Z" }],
      error: null,
    });
    const result = await readMyWorkOrderMap(actor, [task]);
    expect(result.features[0].location).toMatchObject({
      archived: true,
      coordinate_source: "site_stored_centroid",
      geometry: { coordinates: [10, 57] },
    });
  });
  it("falls back from an invalid midpoint and never invents a point for missing geometry", async () => {
    m.read.mockResolvedValue({
      data: [{ ...site, centroid_lng: 10, centroid_lat: 91 }],
      error: null,
    });
    expect((await readMyWorkOrderMap(actor, [task])).features[0].location.coordinate_source).toBe(
      "site_point",
    );
    m.read.mockResolvedValue({
      data: [{ ...site, geometry_geojson: { type: "Polygon", coordinates: [] } }],
      error: null,
    });
    const result = await readMyWorkOrderMap(actor, [task]);
    expect(result.features).toEqual([]);
    expect(result.unmappedJobs).toEqual([task]);
  });
  it("retains primary and visit provenance while fetching a shared source once", async () => {
    m.read.mockResolvedValue({ data: [site, { ...site, id: id(11) }], error: null });
    const result = await readMyWorkOrderMap(actor, [
      { ...task, plan: { ...task.plan, visitStops: [{ siteId: id(11), name: "Første besøg" }] } },
      { ...task, action_id: id(12) },
    ]);
    expect(m.read).toHaveBeenCalledOnce();
    expect(result.features.map((f) => [f.location.source, f.location.sequence])).toEqual([
      ["plan_site", 0],
      ["plan_visit_stop", 1],
      ["plan_site", 0],
    ]);
    expect(result.mappedJobs).toBe(2);
  });
  it("uses the exact pinned watercourse version and refuses other coordinate systems or zero length", async () => {
    const line = {
      id: id(20),
      project_id: id(4),
      organization_id: id(3),
      source: "Syntetisk centerlinje",
      crs: "EPSG:4326",
      geometry: {
        type: "LineString",
        coordinates: [
          [9, 56],
          [10, 57],
        ],
      },
    };
    const lineTask = {
      ...task,
      plan: { ...task.plan, siteId: null, watercourseVersionId: line.id },
    };
    m.read.mockResolvedValue({ data: [line], error: null });
    const result = await readMyWorkOrderMap(actor, [lineTask]);
    expect(m.read.mock.calls[0][0]).toMatchObject({
      table: "watercourse_versions",
      ids: [line.id],
      project: task.project_id,
    });
    expect(result.features[0].location).toMatchObject({
      source: "plan_watercourse",
      source_version_id: line.id,
    });
    for (const invalid of [
      { ...line, crs: "EPSG:25832" },
      {
        ...line,
        geometry: {
          type: "LineString",
          coordinates: [
            [9, 56],
            [9, 56],
          ],
        },
      },
    ]) {
      m.read.mockResolvedValue({ data: [invalid], error: null });
      expect((await readMyWorkOrderMap(actor, [lineTask])).features).toEqual([]);
    }
  });
  it.each([
    { ...site, id: id(99) },
    { ...site, project_id: id(99) },
  ])("rejects a response outside the requested scope", async (row) => {
    m.read.mockResolvedValue({ data: [row], error: null });
    await expect(readMyWorkOrderMap(actor, [task])).rejects.toThrow(
      "Arbejdsstederne kunne ikke hentes",
    );
  });
  it("rejects another actor before requesting any locations", async () => {
    await expect(readMyWorkOrderMap(id(90), [task])).rejects.toThrow();
    expect(m.actor).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
  });
  it("does not turn a read denial into an empty successful map", async () => {
    m.read.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(readMyWorkOrderMap(actor, [task])).rejects.toThrow(
      "Arbejdsstederne kunne ikke hentes",
    );
  });
  it("avoids location queries for tasks without references", async () => {
    const unknown = { ...task, plan: { ...task.plan, siteId: null } };
    expect((await readMyWorkOrderMap(actor, [unknown])).unmappedJobs).toEqual([unknown]);
    expect(m.read).not.toHaveBeenCalled();
  });
});
