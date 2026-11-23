import { describe, expect, it, vi } from "vitest";
import {
  readStreamInspectionReceipt,
  resumeCompletedStreamInspection,
  startStreamInspection,
  streamInspectionReceiptKey,
  streamInspectionRoundTitle,
  type StreamInspectionDependencies,
  type StreamInspectionOptions,
  type StreamInspectionProgress,
  type StreamInspectionScope,
} from "../stream-inspection-start";
import {
  makeRoundFixture,
  ROUND_REQUEST_ID,
} from "@/services/baseline/__tests__/survey-round.fixtures";
import {
  REQUEST_ID,
  INPUT,
  PROJECT,
  REFERENCE,
  COLLECTED_AT,
  makeSnapshot,
} from "@/services/baseline/__tests__/public-baseline.fixtures";
import {
  PLAN_REQUEST_ID,
  makePlanRow,
} from "@/services/baseline/__tests__/verification-plan.fixtures";
import {
  baselineSha256,
  buildPublicBaselineManifest,
} from "@/services/baseline/public-baseline-service";
import {
  buildDatafordelerWatercourseGeometryUrl,
  DATAFORDELER_WATERCOURSE_PROVIDER,
  DATAFORDELER_WATERCOURSE_ATTRIBUTION,
  DATAFORDELER_WATERCOURSE_DISCLAIMER,
} from "@/services/geospatial/datafordeler-watercourse-source";
import { verificationPlanVersionFromRow } from "@/services/baseline/verification-plan-persistence";
import {
  buildSurveyRoundManifestV1,
  surveyRoundVersionFromRow,
  type SaveSurveyRoundInput,
} from "@/services/baseline/survey-round-persistence";

const OTHER_ID = "99000000-0000-4000-8000-000000000001";

async function setup(modern = false) {
  const fixture = await makeRoundFixture();
  if (modern) {
    const reference = {
      ...REFERENCE,
      sourceProvider: "datafordeler-ds-bearbejdet-wfs/v1" as const,
      sourceCrs: "EPSG:4326" as const,
      sourceAxisOrder: "lat-lng" as const,
      datasetVersion: "static-2025-09" as const,
      sourceRegisteredAt: "2024-02-23T10:41:59Z",
      sourceValidFrom: "2024-02-23T10:41:59Z",
      officialLengthM: 10_000,
      modifiedAt: null,
      geometryVersion: null,
      sourceUrl: buildDatafordelerWatercourseGeometryUrl(REFERENCE.id),
      attribution: DATAFORDELER_WATERCOURSE_ATTRIBUTION,
      disclaimer: DATAFORDELER_WATERCOURSE_DISCLAIMER,
      municipalities: [],
    };
    fixture.baseline = await makeSnapshot(
      await buildPublicBaselineManifest(INPUT, PROJECT, reference, reference, COLLECTED_AT),
    );
    fixture.planRow = await makePlanRow(fixture.baseline);
    fixture.plan = await verificationPlanVersionFromRow(fixture.planRow, fixture.baseline);
  }
  const scope: StreamInspectionScope = {
    actorId: fixture.baseline.createdBy,
    projectId: fixture.baseline.projectId,
    projectName: fixture.baseline.manifest.project.name,
    geometrySha256: fixture.baseline.manifest.project.polygonSha256,
    reference: {
      id: fixture.baseline.manifest.reference.id,
      zoneId: fixture.baseline.manifest.reference.zoneId,
      geometrySha256: await baselineSha256(fixture.baseline.manifest.reference.geometry),
      ...(fixture.baseline.manifest.reference.sourceProvider
        ? { sourceProvider: fixture.baseline.manifest.reference.sourceProvider }
        : {}),
    },
    baselinePeriod: {
      dateFrom: fixture.baseline.manifest.period.from,
      dateTo: fixture.baseline.manifest.period.to,
    },
    recordingPeriod: { ...fixture.input.recordingWindow },
  };
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const progress: StreamInspectionProgress[] = [];
  const requests = [REQUEST_ID, PLAN_REQUEST_ID, ROUND_REQUEST_ID];
  const options: StreamInspectionOptions = {
    storage,
    isCurrent: vi.fn(() => true),
    onProgress: (stage) => progress.push(stage),
    randomUUID: vi.fn(() => requests.shift()!),
  };
  let persistedRound: Awaited<ReturnType<typeof surveyRoundVersionFromRow>> | null = null;
  const deps: StreamInspectionDependencies = {
    getAccess: vi.fn(async () => ({
      projectId: scope.projectId,
      userId: scope.actorId,
      canPersist: true,
    })),
    createBaseline: vi.fn(async ({ data }) => {
      expect(readStreamInspectionReceipt(storage, scope)?.requests.baseline).toBe(data.requestId);
      return structuredClone(fixture.baseline);
    }),
    getBaseline: vi.fn(async () => structuredClone(fixture.baseline)),
    savePlan: vi.fn(async ({ data }) => {
      expect(readStreamInspectionReceipt(storage, scope)?.requests.plan).toBe(data.requestId);
      return structuredClone(fixture.plan);
    }),
    getPlan: vi.fn(async () => structuredClone(fixture.plan)),
    saveRound: vi.fn(async () => {
      throw new Error("Not initialized");
    }),
    getRound: vi.fn(async () => structuredClone(persistedRound)),
  };
  // Simulate the real immutable writer: retries with the same request/input return
  // one saved row; different input never manufactures a second version here.
  const roundWrites = new Map<string, SaveSurveyRoundInput>();
  deps.saveRound = vi.fn(async ({ data }) => {
    const { expectedCallerUserId, ...input } = data;
    expect(expectedCallerUserId).toBe(scope.actorId);
    expect(readStreamInspectionReceipt(storage, scope)?.roundReceipt?.input).toEqual(input);
    const previous = roundWrites.get(input.requestId);
    if (previous) {
      expect(input).toEqual(previous);
      return structuredClone(persistedRound!);
    }
    roundWrites.set(input.requestId, structuredClone(input));
    const manifest = await buildSurveyRoundManifestV1(input, fixture.baseline, fixture.plan);
    persistedRound = await surveyRoundVersionFromRow(
      {
        ...fixture.row,
        baseline_id: input.baselineId,
        baseline_sha256: input.baselineSha256,
        plan_id: input.planId,
        plan_sha256: input.planSha256,
        title: input.title,
        recording_date_from: input.recordingWindow.dateFrom,
        recording_date_to: input.recordingWindow.dateTo,
        request_id: input.requestId,
        manifest,
        manifest_sha256: await baselineSha256(manifest),
      },
      fixture.baseline,
      fixture.planRow,
    );
    return structuredClone(persistedRound);
  });
  return { fixture, scope, storage, values, options, progress, deps, roundWrites };
}

describe("one explicit stream inspection preparation", () => {
  it("prepares and reloads the current Datafordeler v2 source without changing its provider provenance", async () => {
    const test = await setup(true);
    const result = await startStreamInspection(test.scope, test.deps, test.options);
    expect(result.snapshot.manifest.schema).toBe("gofreyra.public-baseline/v2");
    expect(result.snapshot.manifest.reference.sourceProvider).toBe(
      DATAFORDELER_WATERCOURSE_PROVIDER,
    );
    expect(await resumeCompletedStreamInspection(test.scope, test.deps, test.options)).toEqual(
      result,
    );
  });

  it("normalizes an explicitly absent legacy provider without inventing modern provenance", async () => {
    const test = await setup();
    const scope = {
      ...test.scope,
      reference: { ...test.scope.reference, sourceProvider: undefined },
    };
    expect(streamInspectionReceiptKey(scope)).toBe(streamInspectionReceiptKey(test.scope));
  });

  it("creates and freshly reads the exact baseline → plan → FØR round, with every actual question", async () => {
    const test = await setup();
    const result = await startStreamInspection(test.scope, test.deps, test.options);
    expect(test.progress).toEqual(["baseline", "plan", "round", "complete"]);
    expect(test.deps.getAccess).toHaveBeenCalledTimes(4);
    expect(test.deps.createBaseline).toHaveBeenCalledExactlyOnceWith({
      data: {
        projectId: test.scope.projectId,
        ...test.scope.baselinePeriod,
        requestId: REQUEST_ID,
      },
    });
    expect(test.deps.savePlan).toHaveBeenCalledExactlyOnceWith({
      data: {
        projectId: test.scope.projectId,
        baselineId: result.snapshot.id,
        requestId: PLAN_REQUEST_ID,
      },
    });
    expect(test.deps.getBaseline).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: test.scope.projectId, snapshotId: result.snapshot.id },
    });
    expect(test.deps.getPlan).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: test.scope.projectId, planId: result.plan.id },
    });
    expect(test.deps.getRound).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: test.scope.projectId, roundVersionId: result.round.id },
    });
    expect(result.round.manifest.questionIds).toEqual(
      result.plan.manifest.questions.map((q) => q.id).sort(),
    );
    expect(result.round.manifest.title).toBe(streamInspectionRoundTitle(test.scope));
    expect(result.round.manifest.kind).toBe("before");
    expect(result.round.manifest.recordingWindow.actualCoverage).toBe("not_verified");
    expect(result.round.manifest.acceptance).toEqual({
      municipalScopeApproved: false,
      professionalApproved: false,
      reportAccepted: false,
    });
    expect(readStreamInspectionReceipt(test.storage, test.scope)?.round?.sha256).toBe(
      result.round.manifestSha256,
    );
    expect(test.storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(test.deps.createBaseline).mock.invocationCallOrder[0],
    );
  });

  it("mount/resume is read-only for absent and partial receipts", async () => {
    const test = await setup();
    expect(await resumeCompletedStreamInspection(test.scope, test.deps, test.options)).toBeNull();
    expect(test.storage.setItem).not.toHaveBeenCalled();
    expect(test.deps.getAccess).not.toHaveBeenCalled();
    vi.mocked(test.deps.createBaseline).mockRejectedValueOnce(new Error("response lost"));
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "response lost",
    );
    const calls = test.storage.setItem.mock.calls.length;
    expect(await resumeCompletedStreamInspection(test.scope, test.deps, test.options)).toBeNull();
    expect(test.storage.setItem).toHaveBeenCalledTimes(calls);
    expect(test.deps.createBaseline).toHaveBeenCalledTimes(1);
    expect(test.deps.savePlan).not.toHaveBeenCalled();
  });

  it("rehydrates only the exact completed saved IDs/hashes without writes, including after a role downgrade", async () => {
    const test = await setup();
    const original = await startStreamInspection(test.scope, test.deps, test.options);
    const before = [...test.values];
    const storageWrites = test.storage.setItem.mock.calls.length;
    vi.mocked(test.deps.getAccess).mockResolvedValue({
      projectId: test.scope.projectId,
      userId: test.scope.actorId,
      canPersist: false,
    });
    const read = await resumeCompletedStreamInspection(test.scope, test.deps, test.options);
    expect(read).toEqual(original);
    expect([...test.values]).toEqual(before);
    expect(test.storage.setItem).toHaveBeenCalledTimes(storageWrites);
    expect(test.deps.createBaseline).toHaveBeenCalledTimes(1);
    expect(test.deps.savePlan).toHaveBeenCalledTimes(1);
    expect(test.deps.saveRound).toHaveBeenCalledTimes(1);
  });

  it.each(["createBaseline", "savePlan", "saveRound"] as const)(
    "retries ambiguous %s with the same request and exact input after a reload",
    async (stage) => {
      const test = await setup();
      const mock = vi.mocked(test.deps[stage]);
      const original = mock.getMockImplementation()!;
      mock.mockImplementationOnce(async (request) => {
        await (original as (request: unknown) => Promise<unknown>)(request);
        throw new Error("network response lost after commit");
      });
      await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
        "network response lost after commit",
      );
      const initial = structuredClone(mock.mock.calls[0]);
      const before = readStreamInspectionReceipt(test.storage, test.scope)!;
      const nextOptions = {
        ...test.options,
        randomUUID: vi.fn(() => {
          throw new Error("new request forbidden");
        }),
      };
      const result = await startStreamInspection(test.scope, test.deps, nextOptions);
      expect(mock.mock.calls[1]).toEqual(initial);
      expect(readStreamInspectionReceipt(test.storage, test.scope)?.requests).toEqual(
        before.requests,
      );
      expect(result.round.requestId).toBe(ROUND_REQUEST_ID);
      expect(test.roundWrites.size).toBe(1);
      expect(nextOptions.randomUUID).not.toHaveBeenCalled();
    },
  );

  it.each(["getBaseline", "getPlan", "getRound"] as const)(
    "keeps the confirmed ID after a failed %s and resumes with a read, not another write",
    async (stage) => {
      const test = await setup();
      vi.mocked(test.deps[stage]).mockRejectedValueOnce(new Error("read interrupted"));
      await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
        "read interrupted",
      );
      await startStreamInspection(test.scope, test.deps, test.options);
      expect(test.deps.createBaseline).toHaveBeenCalledTimes(1);
      expect(test.deps.savePlan).toHaveBeenCalledTimes(1);
      expect(test.deps.saveRound).toHaveBeenCalledTimes(1);
    },
  );

  it.each([1, 2, 3, 4])(
    "checks fresh current caller and permission at access check %s",
    async (deniedCheck) => {
      const test = await setup();
      let count = 0;
      vi.mocked(test.deps.getAccess).mockImplementation(async () => ({
        projectId: test.scope.projectId,
        userId: test.scope.actorId,
        canPersist: ++count !== deniedCheck,
      }));
      await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
        "aktuelle adgang",
      );
      expect(test.deps.createBaseline).toHaveBeenCalledTimes(deniedCheck > 2 ? 1 : 0);
      expect(test.deps.savePlan).toHaveBeenCalledTimes(deniedCheck > 3 ? 1 : 0);
      expect(test.deps.saveRound).not.toHaveBeenCalled();
    },
  );

  it("does not write for another authenticated actor", async () => {
    const test = await setup();
    vi.mocked(test.deps.getAccess).mockResolvedValue({
      projectId: test.scope.projectId,
      userId: OTHER_ID,
      canPersist: true,
    });
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "aktuelle adgang",
    );
    expect(test.storage.setItem).not.toHaveBeenCalled();
    expect(test.deps.createBaseline).not.toHaveBeenCalled();
  });

  it.each([
    "createBaseline",
    "getBaseline",
    "savePlan",
    "getPlan",
    "saveRound",
    "getRound",
  ] as const)("stops immediately when scope/generation changes during %s", async (stage) => {
    const test = await setup();
    let current = true;
    test.options.isCurrent = () => current;
    const mock = vi.mocked(test.deps[stage]);
    const original = mock.getMockImplementation()!;
    mock.mockImplementationOnce(async (request) => {
      const result = await (original as (input: unknown) => Promise<unknown>)(request);
      current = false;
      return result as never;
    });
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "oplysninger er ændret",
    );
    const order = [
      "createBaseline",
      "getBaseline",
      "savePlan",
      "getPlan",
      "saveRound",
      "getRound",
    ] as const;
    for (const later of order.slice(order.indexOf(stage) + 1))
      expect(test.deps[later]).not.toHaveBeenCalled();
    expect(test.progress).not.toContain("complete");
  });

  it("fails before any network mutation when durable storage cannot be read back", async () => {
    const test = await setup();
    test.storage.setItem.mockImplementation(() => undefined);
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "gemmes sikkert",
    );
    expect(test.deps.createBaseline).not.toHaveBeenCalled();
  });

  it("rechecks the exact receipt after the authorization await immediately before a write", async () => {
    const test = await setup();
    let calls = 0;
    vi.mocked(test.deps.getAccess).mockImplementation(async () => {
      if (++calls === 2) test.values.clear();
      return { projectId: test.scope.projectId, userId: test.scope.actorId, canPersist: true };
    });
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "genforsøg er ændret",
    );
    expect(test.deps.createBaseline).not.toHaveBeenCalled();
  });

  it("rejects a corrupted stored receipt instead of silently starting again", async () => {
    const test = await setup();
    test.values.set(streamInspectionReceiptKey(test.scope), "not json");
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow();
    expect(test.options.randomUUID).not.toHaveBeenCalled();
    expect(test.deps.createBaseline).not.toHaveBeenCalled();
  });

  it.each(["geometry", "reference", "period", "actor", "hash"])(
    "rejects a baseline %s mismatch and never advances to a plan",
    async (change) => {
      const test = await setup();
      const changed = structuredClone(test.fixture.baseline);
      if (change === "geometry") changed.manifest.project.polygonSha256 = "f".repeat(64);
      if (change === "reference") changed.manifest.reference.id = OTHER_ID;
      if (change === "period") changed.manifest.period.to = "2026-10-01";
      if (change === "actor") changed.createdBy = OTHER_ID;
      if (change === "hash") changed.manifestSha256 = "f".repeat(64);
      if (change === "reference" || change === "period")
        changed.manifestSha256 = await baselineSha256(changed.manifest);
      vi.mocked(test.deps.createBaseline).mockResolvedValue(changed);
      await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow();
      expect(test.deps.savePlan).not.toHaveBeenCalled();
      expect(test.deps.saveRound).not.toHaveBeenCalled();
    },
  );

  it("stops when the actual deterministic generator has zero questions", async () => {
    const test = await setup();
    const baseline = structuredClone(test.fixture.baseline);
    baseline.manifest.reference.geometry.coordinates = [
      [
        [9.5, 55.5],
        [9.6, 55.6],
      ],
    ];
    baseline.manifest.reference.bbox = [9.5, 55.5, 9.6, 55.6];
    baseline.manifest.reference.center = { lat: 55.55, lng: 9.55 };
    baseline.manifestSha256 = await baselineSha256(baseline.manifest);
    test.scope.reference.geometrySha256 = await baselineSha256(
      baseline.manifest.reference.geometry,
    );
    vi.mocked(test.deps.createBaseline).mockResolvedValue(baseline);
    vi.mocked(test.deps.getBaseline).mockResolvedValue(baseline);
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "ingen konkrete spørgsmål",
    );
    expect(test.deps.savePlan).not.toHaveBeenCalled();
    expect(test.deps.saveRound).not.toHaveBeenCalled();
  });

  it("rejects a genuine different saved plan baseline/hash before creating a round", async () => {
    const test = await setup();
    const changed = structuredClone(test.fixture.baseline);
    changed.id = OTHER_ID;
    const row = await makePlanRow(changed);
    const otherPlan = await verificationPlanVersionFromRow(row, changed);
    vi.mocked(test.deps.savePlan).mockResolvedValue(otherPlan);
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow();
    expect(test.deps.saveRound).not.toHaveBeenCalled();
  });

  it("does not mark completion when a fresh round read has a different saved hash", async () => {
    const test = await setup();
    const original = vi.mocked(test.deps.getRound).getMockImplementation()!;
    vi.mocked(test.deps.getRound).mockImplementation(async (request) => {
      const round = (await original(request))!;
      round.manifestSha256 = "f".repeat(64);
      return round;
    });
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow();
    expect(test.progress).not.toContain("complete");
    expect(readStreamInspectionReceipt(test.storage, test.scope)?.roundReceipt).not.toBeNull();
  });

  it("rejects a different DTO recording timezone instead of silently normalizing it", async () => {
    const test = await setup();
    const original = vi.mocked(test.deps.getRound).getMockImplementation()!;
    vi.mocked(test.deps.getRound).mockImplementation(async (request) => {
      const round = (await original(request))!;
      Object.assign(round.recordingWindow, { timeZone: "UTC" });
      return round;
    });
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "anden tidszone",
    );
    expect(test.progress).not.toContain("complete");
  });

  it("does not replace edited exact round inputs on a retry", async () => {
    const test = await setup();
    vi.mocked(test.deps.saveRound).mockRejectedValueOnce(new Error("offline"));
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "offline",
    );
    const receipt = readStreamInspectionReceipt(test.storage, test.scope)!;
    receipt.roundReceipt!.input.title = "Changed after lost response";
    test.values.set(streamInspectionReceiptKey(test.scope), JSON.stringify(receipt));
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "gemte input matcher ikke",
    );
    expect(test.deps.saveRound).toHaveBeenCalledTimes(1);
  });

  it("prevents concurrent mounted calls while an initial authorization is pending", async () => {
    const test = await setup();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = vi.mocked(test.deps.getAccess).getMockImplementation()!;
    vi.mocked(test.deps.getAccess).mockImplementationOnce(async (request) => {
      await pending;
      return original(request);
    });
    const first = startStreamInspection(test.scope, test.deps, test.options);
    await expect(startStreamInspection(test.scope, test.deps, test.options)).rejects.toThrow(
      "allerede",
    );
    release();
    await first;
    expect(test.deps.createBaseline).toHaveBeenCalledTimes(1);
  });

  it.each([
    "actor",
    "project",
    "geometry",
    "reference",
    "zone",
    "referenceGeometry",
    "period",
    "recordingPeriod",
    "name",
  ])("uses a separate exact durable scope when %s changes", async (field) => {
    const test = await setup();
    const other = structuredClone(test.scope);
    if (field === "actor") other.actorId = OTHER_ID;
    if (field === "project") other.projectId = OTHER_ID;
    if (field === "geometry") other.geometrySha256 = "f".repeat(64);
    if (field === "reference") other.reference.id = OTHER_ID;
    if (field === "zone") other.reference.zoneId = OTHER_ID;
    if (field === "referenceGeometry") other.reference.geometrySha256 = "f".repeat(64);
    if (field === "period") other.baselinePeriod.dateTo = "2026-10-01";
    if (field === "recordingPeriod") other.recordingPeriod.dateTo = "2026-10-15";
    if (field === "name") other.projectName = "Another title";
    expect(streamInspectionReceiptKey(other)).not.toBe(streamInspectionReceiptKey(test.scope));
  });

  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026-10-15", "2026-10-14"],
    ["2026-10-13T12:00:00Z", "2026-10-14"],
  ])("rejects invalid calendar scope %s–%s without writing", async (dateFrom, dateTo) => {
    const test = await setup();
    await expect(
      startStreamInspection(
        { ...test.scope, recordingPeriod: { dateFrom, dateTo } },
        test.deps,
        test.options,
      ),
    ).rejects.toThrow();
    expect(test.storage.setItem).not.toHaveBeenCalled();
    expect(test.deps.getAccess).not.toHaveBeenCalled();
  });
});
