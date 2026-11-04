import { describe, expect, it } from "vitest";
import type { ManagerWorkOrder, ManagerWorkOrderMapLocation } from "@/lib/manager-work-orders";
import { managerMapData, managerMapSourceLabel } from "../manager-work-order-map-data";

const location: ManagerWorkOrderMapLocation = {
  id: "site:one",
  source: "plan_site",
  source_id: "site-one",
  source_version_id: null,
  name: "Engen",
  coordinate_source: "site_point",
  sequence: 0,
  archived: false,
  geometry: { type: "Point", coordinates: [9, 55] },
};
function task(actionId: string, locations: ManagerWorkOrderMapLocation[]): ManagerWorkOrder {
  return {
    action_id: actionId,
    project_id: "project",
    title: actionId,
    project_name: "Bykær",
    task_status: "assigned",
    blocked: false,
    waiting_for_prerequisites: false,
    map_locations: locations,
  } as ManagerWorkOrder;
}
describe("manager map projection", () => {
  it("counts jobs once even with multiple saved positions, and keeps unlocated jobs in the same result", () => {
    const first = task("one", [
      location,
      { ...location, id: "visit:two", source: "plan_visit_stop", sequence: 1 },
    ]);
    const unknown = task("two", []);
    const result = managerMapData([first, unknown]);
    expect(result.mappedJobs).toBe(1);
    expect(result.features).toHaveLength(2);
    expect(result.unmappedJobs).toEqual([unknown]);
    expect(result.mappedJobs + result.unmappedJobs.length).toBe(2);
    expect(
      result.features.every(
        (feature) => feature.actionId === first.action_id && feature.projectId === first.project_id,
      ),
    ).toBe(true);
  });
  it("uses saved WGS84 coordinates without moving, geocoding or estimating a position", () => {
    const line: ManagerWorkOrderMapLocation = {
      ...location,
      id: "line",
      source: "plan_watercourse",
      source_version_id: "version-one",
      coordinate_source: "pinned_centerline",
      sequence: null,
      geometry: {
        type: "LineString",
        coordinates: [
          [9, 55],
          [9.1, 55.1],
        ],
      },
    };
    const result = managerMapData([task("one", [location, line]), task("two", [])]);
    expect(result.features[0].location.geometry).toEqual({ type: "Point", coordinates: [9, 55] });
    expect(result.features[1].location).toBe(line);
    expect(result.unmappedJobs[0].action_id).toBe("two");
  });
  it("rejects invalid coordinates per feature without losing jobs or valid zero coordinates", () => {
    const invalid = task("bad", [
      { ...location, geometry: { type: "Point", coordinates: [9, NaN] } },
      { ...location, id: "outside", geometry: { type: "Point", coordinates: [9, 91] } },
      { ...location, id: "short-line", geometry: { type: "LineString", coordinates: [[9, 55]] } },
    ]);
    const zero = task("zero", [{ ...location, geometry: { type: "Point", coordinates: [0, 0] } }]);
    const result = managerMapData([invalid, zero]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].actionId).toBe("zero");
    expect(result.unmappedJobs).toEqual([invalid]);
  });
  it("identifies current site positions and pinned full centerlines without claiming a clipped work reach", () => {
    expect(managerMapSourceLabel(location)).toBe("Planens lokalitet · gemt kortpunkt");
    expect(
      managerMapSourceLabel({ ...location, coordinate_source: "site_stored_centroid" }),
    ).toContain("gemt midtpunkt");
    expect(
      managerMapSourceLabel({ ...location, source: "plan_visit_stop", sequence: 2 }),
    ).toContain("Besøg 2");
    expect(managerMapSourceLabel({ ...location, source: "action_site" })).toContain(
      "Opgavens lokalitet",
    );
    expect(managerMapSourceLabel({ ...location, source: "plan_watercourse" })).toBe(
      "Gemt vandløbsgrundlag",
    );
  });
});
