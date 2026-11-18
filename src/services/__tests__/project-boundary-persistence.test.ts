import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/supabase/types";
import {
  BoundaryOperationInProgressError,
  clearProjectBoundary,
  createBoundaryOperationGuard,
  persistProjectBoundary,
  projectBoundaryMutationErrorMessage,
} from "@/services/projects-service";

const POLYGON = {
  type: "Polygon" as const,
  coordinates: [
    [
      [9.48, 55.25],
      [9.49, 55.25],
      [9.49, 55.26],
      [9.48, 55.26],
      [9.48, 55.25],
    ],
  ],
};

describe("persistProjectBoundary", () => {
  it("validerer og sender canonical polygon, areal og centroid til persistence-callbacken", async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    const persisted = await persistProjectBoundary(
      "project-1",
      { polygon: POLYGON, source: "uploaded" },
      update,
    );

    expect(persisted.polygon).toEqual(POLYGON);
    expect(persisted.areaHa).toBeGreaterThan(0);
    expect(persisted.centroid.lat).toBeCloseTo(55.255);
    expect(persisted.centroid.lng).toBeCloseTo(9.485);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        geometry_polygon: POLYGON,
        geometry_area_ha: persisted.areaHa,
        geometry_centroid_lat: persisted.centroid.lat,
        geometry_centroid_lng: persisted.centroid.lng,
        geometry_source: "uploaded",
      }),
    );
  });

  it("afviser ugyldig geometri før persistence-callbacken", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const openPolygon = {
      type: "Polygon",
      coordinates: [[...POLYGON.coordinates[0].slice(0, -1)]],
    };

    await expect(
      persistProjectBoundary("project-1", { polygon: openPolygon }, update),
    ).rejects.toThrow("ikke lukket");
    expect(update).not.toHaveBeenCalled();
  });

  it("propagerer persistence-fejl uden at rapportere succes", async () => {
    const update = vi.fn().mockRejectedValue(new Error("RLS afviste opdateringen"));

    await expect(persistProjectBoundary("project-1", { polygon: POLYGON }, update)).rejects.toThrow(
      "RLS afviste opdateringen",
    );
    expect(update).toHaveBeenCalledOnce();
  });

  it("afviser succes, når database-readback ikke matcher den skrevne grænse", async () => {
    const update = vi.fn().mockResolvedValue({
      geometry_polygon: POLYGON,
      geometry_area_ha: 999,
      geometry_centroid_lat: 55.255,
      geometry_centroid_lng: 9.485,
      geometry_source: "uploaded",
    } as unknown as Project);

    await expect(
      persistProjectBoundary("project-1", { polygon: POLYGON, source: "uploaded" }, update),
    ).rejects.toThrow("Databasen bekræftede ikke den gemte projektgrænse");
  });
});

describe("clearProjectBoundary", () => {
  it("nulstiller alle canonical geometry-felter i én persistence-operation", async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    await clearProjectBoundary("project-1", update);

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("project-1", {
      geometry_polygon: null,
      geometry_area_ha: null,
      geometry_source: null,
      geometry_centroid_lat: null,
      geometry_centroid_lng: null,
    });
  });

  it("afviser succes, når database-readback stadig indeholder geometri", async () => {
    const update = vi.fn().mockResolvedValue({
      geometry_polygon: POLYGON,
      geometry_area_ha: null,
      geometry_source: null,
      geometry_centroid_lat: null,
      geometry_centroid_lng: null,
    } as unknown as Project);

    await expect(clearProjectBoundary("project-1", update)).rejects.toThrow(
      "Databasen bekræftede ikke, at projektgrænsen blev ryddet",
    );
  });
});

describe("boundary write integrity", () => {
  it("afviser en samtidig boundary-operation og frigiver låsen efter afslutning", async () => {
    const guard = createBoundaryOperationGuard();
    let finishFirst: (() => void) | undefined;
    const first = guard.run(
      () =>
        new Promise<string>((resolve) => {
          finishFirst = () => resolve("saved");
        }),
    );

    expect(guard.isBusy()).toBe(true);
    await expect(guard.run(async () => "cleared")).rejects.toBeInstanceOf(
      BoundaryOperationInProgressError,
    );
    finishFirst?.();
    await expect(first).resolves.toBe("saved");
    await expect(guard.run(async () => "cleared")).resolves.toBe("cleared");
  });

  it("forklarer RLS/policy-fejl som manglende rettighed", () => {
    expect(
      projectBoundaryMutationErrorMessage(new Error("new row violates row-level security policy")),
    ).toContain("projektleder eller administrator");
    expect(projectBoundaryMutationErrorMessage(new Error("Netværksfejl"))).toBe("Netværksfejl");
  });
});
