import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareConfirmedDroneIntake,
  type DroneIntakePrepareDependencies,
  type DroneIntakePrepareInput,
} from "../drone-intake-prepare";
import {
  PROJECT,
  PROJECT_ID,
  ACTOR_ID,
  REFERENCE,
} from "@/services/baseline/__tests__/public-baseline.fixtures";
import type { Project } from "@/lib/supabase/types";
const start = vi.hoisted(() => vi.fn());
vi.mock("../stream-inspection-start", () => ({ startStreamInspection: start }));
beforeEach(() => {
  start.mockReset();
  start.mockResolvedValue({ marker: "saved-round" });
});
function fixture() {
  let savedProject = structuredClone(PROJECT) as unknown as Project,
    reference = structuredClone(REFERENCE);
  const deps = {
    getProject: vi.fn(async () => savedProject),
    getReference: vi.fn(async () => reference),
    persistBoundary: vi.fn(async (_id, polygon) => {
      savedProject = { ...savedProject, geometry_polygon: polygon };
    }),
    saveReference: vi.fn(async (_id, referenceId) => {
      reference = { ...reference, id: referenceId, zoneId: ACTOR_ID };
      return reference;
    }),
    inspection: {
      getAccess: vi.fn(async () => ({ projectId: PROJECT_ID, userId: ACTOR_ID, canPersist: true })),
      createBaseline: vi.fn(),
      getBaseline: vi.fn(),
      savePlan: vi.fn(),
      getPlan: vi.fn(),
      saveRound: vi.fn(),
      getRound: vi.fn(),
    },
  } satisfies DroneIntakePrepareDependencies;
  const input: DroneIntakePrepareInput = {
    actorId: ACTOR_ID,
    project: savedProject,
    savedReference: reference,
    proposedPolygon: null,
    useProposedArea: false,
    referenceId: reference.id,
    recordingDate: "2026-10-14",
    photos: [
      {
        status: "located",
        cameraPosition: {
          longitude: 9.025,
          latitude: 55.025,
          geometryRole: "camera_position_only",
        },
      },
    ],
  };
  return { deps, input };
}
const options = () => ({
  storage: { getItem: () => null, setItem: () => {} },
  isCurrent: () => true,
});
describe("explicit confirmed-place preparation", () => {
  it("blocks a far GPS cluster before access, data fetch or binding preparation, until matching area and reference are selected", async () => {
    const { deps, input } = fixture();
    input.photos = [
      {
        status: "located",
        cameraPosition: {
          longitude: 10.025,
          latitude: 56.025,
          geometryRole: "camera_position_only",
        },
      },
    ];
    await expect(prepareConfirmedDroneIntake(input, deps, options())).rejects.toThrow(
      "uden for det valgte område",
    );
    expect(deps.inspection.getAccess).not.toHaveBeenCalled();
    expect(deps.inspection.createBaseline).not.toHaveBeenCalled();
    expect(deps.persistBoundary).not.toHaveBeenCalled();
    expect(deps.saveReference).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    input.useProposedArea = true;
    input.proposedPolygon = {
      type: "Polygon",
      coordinates: [
        [
          [10.02, 56.02],
          [10.03, 56.02],
          [10.03, 56.03],
          [10.02, 56.03],
          [10.02, 56.02],
        ],
      ],
    };
    input.referenceId = "";
    await expect(prepareConfirmedDroneIntake(input, deps, options())).rejects.toThrow("Vælg både");
    expect(start).not.toHaveBeenCalled();
    input.referenceId = PROJECT_ID;
    await expect(prepareConfirmedDroneIntake(input, deps, options())).resolves.toEqual({
      marker: "saved-round",
    });
    expect(deps.persistBoundary).toHaveBeenCalledWith(PROJECT_ID, input.proposedPolygon);
    expect(deps.saveReference).toHaveBeenCalledWith(PROJECT_ID, PROJECT_ID);
    expect(start).toHaveBeenCalledTimes(1);
  });
  it("preserves existing geometry and reference while starting one exact pinned workflow", async () => {
    const { deps, input } = fixture();
    const result = await prepareConfirmedDroneIntake(input, deps, options());
    expect(result).toEqual({ marker: "saved-round" });
    expect(deps.persistBoundary).not.toHaveBeenCalled();
    expect(deps.saveReference).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toMatchObject({
      actorId: ACTOR_ID,
      projectId: PROJECT_ID,
      reference: { id: REFERENCE.id, zoneId: REFERENCE.zoneId },
      baselinePeriod: { dateFrom: "2026-09-15", dateTo: "2026-10-14" },
      recordingPeriod: { dateFrom: "2026-10-14", dateTo: "2026-10-14" },
    });
  });
  it("only saves a proposed camera area and different reference after explicit choice with fresh access before each write", async () => {
    const { deps, input } = fixture();
    input.useProposedArea = true;
    input.proposedPolygon = {
      type: "Polygon",
      coordinates: [
        [
          [9.02, 55.02],
          [9.03, 55.02],
          [9.03, 55.03],
          [9.02, 55.03],
          [9.02, 55.02],
        ],
      ],
    };
    input.referenceId = PROJECT_ID;
    await prepareConfirmedDroneIntake(input, deps, options());
    expect(deps.persistBoundary).toHaveBeenCalledWith(PROJECT_ID, input.proposedPolygon);
    expect(deps.saveReference).toHaveBeenCalledWith(PROJECT_ID, PROJECT_ID);
    expect(deps.inspection.getAccess).toHaveBeenCalledTimes(4);
    expect(start.mock.calls[0][0].reference.id).toBe(PROJECT_ID);
    expect(start.mock.calls[0][0].reference.zoneId).toBe(ACTOR_ID);
  });
  it("rejects a changed displayed geometry or reference before any write", async () => {
    for (const change of ["geometry", "reference"]) {
      const { deps, input } = fixture();
      if (change === "geometry")
        deps.getProject.mockResolvedValue({ ...input.project, geometry_polygon: null });
      else deps.getReference.mockResolvedValue({ ...REFERENCE, zoneId: ACTOR_ID });
      await expect(prepareConfirmedDroneIntake(input, deps, options())).rejects.toThrow("ændret");
      expect(deps.persistBoundary).not.toHaveBeenCalled();
      expect(deps.saveReference).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    }
  });
  it("requires the current actor's editor rights even when geography already exists", async () => {
    for (const reply of [
      { projectId: PROJECT_ID, userId: PROJECT_ID, canPersist: true },
      { projectId: PROJECT_ID, userId: ACTOR_ID, canPersist: false },
    ]) {
      const { deps, input } = fixture();
      deps.inspection.getAccess.mockResolvedValue(reply);
      await expect(prepareConfirmedDroneIntake(input, deps, options())).rejects.toThrow(
        "projektleder",
      );
      expect(deps.getProject).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    }
  });
  it("does not continue after input or lifecycle changes during a read", async () => {
    const { deps, input } = fixture();
    let current = true;
    deps.getProject.mockImplementation(async () => {
      current = false;
      return input.project;
    });
    await expect(
      prepareConfirmedDroneIntake(input, deps, { ...options(), isCurrent: () => current }),
    ).rejects.toThrow("ændret");
    expect(start).not.toHaveBeenCalled();
    expect(deps.persistBoundary).not.toHaveBeenCalled();
  });
  it("does not create a baseline if the saved geography readback mismatches", async () => {
    const { deps, input } = fixture();
    deps.getProject
      .mockResolvedValueOnce(input.project)
      .mockResolvedValueOnce({ ...input.project, geometry_polygon: null });
    await expect(prepareConfirmedDroneIntake(input, deps, options())).rejects.toThrow(
      "blev ikke bekræftet",
    );
    expect(start).not.toHaveBeenCalled();
  });
  it("does not invent geography or a recording date for missing metadata", async () => {
    for (const change of ["geometry", "date"]) {
      const { deps, input } = fixture();
      if (change === "geometry") input.project = { ...input.project, geometry_polygon: null };
      else input.recordingDate = "";
      await expect(prepareConfirmedDroneIntake(input, deps, options())).rejects.toThrow();
      expect(deps.persistBoundary).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    }
  });
});
