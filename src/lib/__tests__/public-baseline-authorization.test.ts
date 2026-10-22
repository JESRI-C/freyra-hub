import { describe, expect, it, vi } from "vitest";
import {
  executeCreateProjectBaseline,
  executeGetProjectBaseline,
  executeListProjectBaselines,
  type PublicBaselineDependencies,
} from "@/lib/public-baseline.functions";
import { ProjectAccessDeniedError } from "@/lib/project-nature-access.server";
import {
  ACTOR_ID,
  COLLECTED_AT,
  INPUT,
  PROJECT,
  PROJECT_ID,
  REFERENCE,
  SNAPSHOT_ID,
  makeSnapshot,
} from "@/services/baseline/__tests__/public-baseline.fixtures";

const CLIENT = {} as never;
function dependencies(canPersist = true) {
  const authorizeProject = vi
    .fn()
    .mockResolvedValue({ canPersist, centroid: null, role: canPersist ? "editor" : "viewer" });
  const loadProject = vi.fn().mockResolvedValue(PROJECT);
  const loadReference = vi.fn().mockResolvedValue(REFERENCE);
  const fetchReference = vi.fn().mockResolvedValue(REFERENCE);
  const collectSources = vi
    .fn<PublicBaselineDependencies["collectSources"]>()
    .mockImplementation(async (manifest) => manifest);
  const loadRequest = vi.fn().mockResolvedValue(null);
  const loadSnapshot = vi.fn().mockResolvedValue(null);
  const listSnapshots = vi.fn().mockResolvedValue([]);
  const getWriter = vi.fn().mockResolvedValue(CLIENT);
  const persist = vi
    .fn<PublicBaselineDependencies["persist"]>()
    .mockImplementation((_writer, _input, _actorId, manifest) => makeSnapshot(manifest));
  const overrides = {
    authorizeProject,
    loadProject,
    loadReference,
    fetchReference,
    collectSources,
    primeSourceCache: vi.fn().mockResolvedValue(undefined),
    loadRequest,
    loadSnapshot,
    listSnapshots,
    getWriter,
    persist,
    now: () => COLLECTED_AT,
  } satisfies PublicBaselineDependencies;
  return overrides;
}

describe("public baseline caller-bound authorization", () => {
  it("authorizes before source fetch and privileged writer creation", async () => {
    const calls = dependencies();
    const snapshot = await executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, calls);
    expect(snapshot.projectId).toBe(PROJECT_ID);
    expect(calls.authorizeProject).toHaveBeenCalledWith(CLIENT, ACTOR_ID, PROJECT_ID);
    expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      calls.fetchReference.mock.invocationCallOrder[0],
    );
    expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      calls.primeSourceCache.mock.invocationCallOrder[0],
    );
    expect(calls.fetchReference.mock.invocationCallOrder[0]).toBeLessThan(
      calls.getWriter.mock.invocationCallOrder[0],
    );
    expect(calls.persist).toHaveBeenCalledWith(CLIENT, INPUT, ACTOR_ID, snapshot.manifest);
  });

  it("denies a foreign tenant before reads, fetches or a privileged writer", async () => {
    const calls = dependencies();
    calls.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(
      executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, calls),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    expect(calls.loadRequest).not.toHaveBeenCalled();
    expect(calls.primeSourceCache).not.toHaveBeenCalled();
    expect(calls.loadReference).not.toHaveBeenCalled();
    expect(calls.fetchReference).not.toHaveBeenCalled();
    expect(calls.getWriter).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it.each(["viewer", "field", "external"])(
    "does not permit %s to capture a version",
    async (role) => {
      const calls = dependencies(false);
      calls.authorizeProject.mockResolvedValue({ canPersist: false, centroid: null, role });
      await expect(executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, calls)).rejects.toThrow(
        "ikke rettighed",
      );
      expect(calls.fetchReference).not.toHaveBeenCalled();
      expect(calls.getWriter).not.toHaveBeenCalled();
    },
  );

  it("rejects client geometry and URLs rather than trusting them", async () => {
    const calls = dependencies();
    await expect(
      executeCreateProjectBaseline(
        {
          ...INPUT,
          geometry: PROJECT.geometry_polygon,
          sourceUrl: "https://example.invalid",
        } as never,
        ACTOR_ID,
        CLIENT,
        calls,
      ),
    ).rejects.toThrow();
    expect(calls.authorizeProject).not.toHaveBeenCalled();
    expect(calls.fetchReference).not.toHaveBeenCalled();
  });

  it.each(["2026-02-30", "invalid"])(
    "rejects invalid date %s without a fetch",
    async (dateFrom) => {
      const calls = dependencies();
      await expect(
        executeCreateProjectBaseline({ ...INPUT, dateFrom }, ACTOR_ID, CLIENT, calls),
      ).rejects.toThrow();
      expect(calls.fetchReference).not.toHaveBeenCalled();
    },
  );

  it("requires a saved official reference before collection", async () => {
    const calls = dependencies();
    calls.loadReference.mockResolvedValue(null);
    await expect(executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, calls)).rejects.toThrow(
      "officiel vandløbsreference",
    );
    expect(calls.fetchReference).not.toHaveBeenCalled();
    expect(calls.getWriter).not.toHaveBeenCalled();
  });

  it("does not capture a changed upstream geometry as the selected reference", async () => {
    const calls = dependencies();
    calls.fetchReference.mockResolvedValue({
      ...REFERENCE,
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [9.02, 55.02],
            [9.09, 55.09],
          ],
        ],
      },
    });
    await expect(executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, calls)).rejects.toThrow(
      "reference er ændret",
    );
    expect(calls.getWriter).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it("fails closed when the server writer or database persistence is unavailable", async () => {
    const missingWriter = dependencies();
    missingWriter.getWriter.mockRejectedValue(new Error("Missing server credentials"));
    await expect(
      executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, missingWriter),
    ).rejects.toThrow("Missing server credentials");
    expect(missingWriter.persist).not.toHaveBeenCalled();
    const failedPersist = dependencies();
    failedPersist.persist.mockRejectedValue(new Error("RPC not installed"));
    await expect(
      executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, failedPersist),
    ).rejects.toThrow("RPC not installed");
  });

  it("requires read authorization before loading either a version or the version list", async () => {
    const calls = dependencies(false);
    await expect(
      executeGetProjectBaseline(
        { projectId: PROJECT_ID, snapshotId: SNAPSHOT_ID },
        ACTOR_ID,
        CLIENT,
        calls,
      ),
    ).resolves.toBeNull();
    expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      calls.loadSnapshot.mock.invocationCallOrder[0],
    );
    await expect(
      executeListProjectBaselines({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, calls),
    ).resolves.toEqual([]);
    expect(calls.fetchReference).not.toHaveBeenCalled();
    expect(calls.getWriter).not.toHaveBeenCalled();
    calls.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    calls.loadSnapshot.mockClear();
    await expect(
      executeGetProjectBaseline(
        { projectId: PROJECT_ID, snapshotId: SNAPSHOT_ID },
        ACTOR_ID,
        CLIENT,
        calls,
      ),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    expect(calls.loadSnapshot).not.toHaveBeenCalled();
  });

  it("replays the same request without new fetches or overwriting the saved input", async () => {
    const calls = dependencies();
    const saved = await makeSnapshot();
    calls.loadRequest.mockResolvedValue(saved);
    const replay = await executeCreateProjectBaseline(INPUT, ACTOR_ID, CLIENT, calls);
    expect(replay).toEqual(saved);
    expect(calls.loadProject).not.toHaveBeenCalled();
    expect(calls.fetchReference).not.toHaveBeenCalled();
    expect(calls.getWriter).not.toHaveBeenCalled();
    await expect(
      executeCreateProjectBaseline({ ...INPUT, dateTo: "2026-10-01" }, ACTOR_ID, CLIENT, calls),
    ).rejects.toThrow("anden datoperiode");
  });
});
