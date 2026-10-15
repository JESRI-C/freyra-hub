import { describe, expect, it, vi } from "vitest";
import {
  executeWatercourseLoad,
  executeWatercoursePreview,
  executeWatercourseSave,
  executeWatercourseSearch,
  loadSavedOfficialWatercourseReach,
  persistOfficialWatercourseReach,
  WatercourseReachReadOnlyError,
  type SavedOfficialWatercourseReach,
  type WatercourseReachDependencies,
} from "@/lib/watercourse-reach.functions";
import { ProjectAccessDeniedError } from "@/lib/project-nature-access.server";
import type {
  OfficialWatercourseGeometry,
  OfficialWatercourseSuggestion,
} from "@/services/geospatial/official-watercourse-source";
import {
  buildDatafordelerWatercourseGeometryUrl,
  DATAFORDELER_WATERCOURSE_PROVIDER,
  DATAFORDELER_WATERCOURSE_CRS,
  DATAFORDELER_WATERCOURSE_AXIS_ORDER,
  DATAFORDELER_WATERCOURSE_DATASET_VERSION,
} from "@/services/geospatial/datafordeler-watercourse-source";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const WATERCOURSE_ID = "1233766a-1fdb-6b98-e053-d480220a5a3f";
const CLIENT = {} as never;
const ZONE_ID = "40000000-0000-4000-8000-000000000001";

const SUGGESTION: OfficialWatercourseSuggestion = {
  id: WATERCOURSE_ID,
  name: "Bykær Bæk",
  nameStatus: "officielt",
  municipalities: ["Haderslev"],
  center: { lat: 55.354, lng: 9.269 },
  bbox: [9.251, 55.338, 9.271, 55.371],
  modifiedAt: "2026-05-04T22:02:01.427Z",
};

const REACH: OfficialWatercourseGeometry = {
  ...SUGGESTION,
  center: SUGGESTION.center!,
  bbox: SUGGESTION.bbox!,
  geometry: {
    type: "MultiLineString",
    coordinates: [
      [
        [9.251, 55.338],
        [9.271, 55.371],
      ],
    ],
  },
  segmentCount: 1,
  vertexCount: 2,
  lengthM: 3880,
  geometryVersion: 1,
  sourceUrl: `https://api.dataforsyningen.dk/steder/${WATERCOURSE_ID}?format=geojson&srid=4326`,
  attribution: "SDFI / Dataforsyningen — Danske Stednavne",
  disclaimer: "Kommunalt regulativ er facit.",
};

function dependencies(canPersist: boolean): {
  overrides: Partial<WatercourseReachDependencies>;
  authorizeProject: ReturnType<typeof vi.fn>;
  searchSource: ReturnType<typeof vi.fn>;
  fetchSource: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
} {
  const authorizeProject = vi.fn().mockResolvedValue({
    canPersist,
    centroid: null,
    role: canPersist ? "editor" : "viewer",
  });
  const searchSource = vi.fn().mockResolvedValue([SUGGESTION]);
  const fetchSource = vi.fn().mockResolvedValue(REACH);
  const persist = vi.fn().mockResolvedValue({
    ...REACH,
    zoneId: ZONE_ID,
    savedAt: "2026-09-12T12:00:00.000Z",
  } satisfies SavedOfficialWatercourseReach);
  return {
    overrides: { authorizeProject, searchSource, fetchSource, persist },
    authorizeProject,
    searchSource,
    fetchSource,
    persist,
  };
}

describe("official watercourse reach authorization", () => {
  it("authorizes the project before a source search", async () => {
    const calls = dependencies(false);
    const result = await executeWatercourseSearch(
      { projectId: PROJECT_ID, query: "Bykær Bæk" },
      USER_ID,
      CLIENT,
      calls.overrides,
    );

    expect(result).toEqual([SUGGESTION]);
    expect(calls.authorizeProject).toHaveBeenCalledWith(CLIENT, USER_ID, PROJECT_ID);
    expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      calls.searchSource.mock.invocationCallOrder[0],
    );
  });

  it("does not contact the external source when tenant access is denied", async () => {
    const calls = dependencies(false);
    calls.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());

    await expect(
      executeWatercourseSearch(
        { projectId: PROJECT_ID, query: "Bykær Bæk" },
        USER_ID,
        CLIENT,
        calls.overrides,
      ),
    ).rejects.toEqual(new ProjectAccessDeniedError());
    expect(calls.searchSource).not.toHaveBeenCalled();
  });

  it("lets a viewer preview public geometry but never persist it", async () => {
    const calls = dependencies(false);
    const preview = await executeWatercoursePreview(
      { projectId: PROJECT_ID, watercourseId: WATERCOURSE_ID },
      USER_ID,
      CLIENT,
      calls.overrides,
    );
    expect(preview).toEqual(REACH);

    await expect(
      executeWatercourseSave(
        { projectId: PROJECT_ID, watercourseId: WATERCOURSE_ID },
        USER_ID,
        CLIENT,
        calls.overrides,
      ),
    ).rejects.toEqual(new WatercourseReachReadOnlyError());
    expect(calls.persist).not.toHaveBeenCalled();
    expect(calls.fetchSource).toHaveBeenCalledOnce();
  });

  it("re-fetches the allowlisted source ID before an editor save", async () => {
    const calls = dependencies(true);
    const result = await executeWatercourseSave(
      { projectId: PROJECT_ID, watercourseId: WATERCOURSE_ID },
      USER_ID,
      CLIENT,
      calls.overrides,
    );

    expect(calls.fetchSource).toHaveBeenCalledWith(WATERCOURSE_ID);
    expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      calls.fetchSource.mock.invocationCallOrder[0],
    );
    expect(calls.persist).toHaveBeenCalledWith(CLIENT, PROJECT_ID, USER_ID, REACH);
    expect(calls.fetchSource.mock.invocationCallOrder[0]).toBeLessThan(
      calls.persist.mock.invocationCallOrder[0],
    );
    expect(result.zoneId).toBe("40000000-0000-4000-8000-000000000001");
  });

  it("returns the saved snapshot without replacing its name or source dates", async () => {
    const calls = dependencies(false);
    const saved = {
      ...REACH,
      name: "Editor-supplied label",
      zoneId: ZONE_ID,
      savedAt: "2026-09-12T12:00:00.000Z",
    } satisfies SavedOfficialWatercourseReach;
    calls.overrides.loadSaved = vi.fn().mockResolvedValue(saved);

    const result = await executeWatercourseLoad(PROJECT_ID, USER_ID, CLIENT, calls.overrides);

    expect(result).toBe(saved);
    expect(result?.name).toBe("Editor-supplied label");
    expect(result?.modifiedAt).toBe(saved.modifiedAt);
    expect(result?.savedAt).toBe(saved.savedAt);
    expect(result?.sourceProvider).toBeUndefined();
    expect(calls.fetchSource).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it("keeps saved geometry when the live source would return a different version", async () => {
    const calls = dependencies(false);
    const saved = {
      ...REACH,
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [9.251, 55.338],
            [9.27, 55.37],
          ],
        ],
      },
      zoneId: ZONE_ID,
      savedAt: "2026-09-12T12:00:00.000Z",
    } satisfies SavedOfficialWatercourseReach;
    calls.overrides.loadSaved = vi.fn().mockResolvedValue(saved);

    const result = await executeWatercourseLoad(PROJECT_ID, USER_ID, CLIENT, calls.overrides);

    expect(result).toBe(saved);
    expect(result?.geometry).not.toEqual(REACH.geometry);
    expect(calls.fetchSource).not.toHaveBeenCalled();
  });

  it.each(["preview", "save", "load"] as const)(
    "denies foreign project access before %s loads rows or contacts a source",
    async (operation) => {
      const calls = dependencies(true);
      const loadSaved = vi.fn();
      calls.overrides.loadSaved = loadSaved;
      calls.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
      const input = { projectId: PROJECT_ID, watercourseId: WATERCOURSE_ID };
      const result =
        operation === "load"
          ? executeWatercourseLoad(PROJECT_ID, USER_ID, CLIENT, calls.overrides)
          : operation === "preview"
            ? executeWatercoursePreview(input, USER_ID, CLIENT, calls.overrides)
            : executeWatercourseSave(input, USER_ID, CLIENT, calls.overrides);

      await expect(result).rejects.toEqual(new ProjectAccessDeniedError());
      expect(loadSaved).not.toHaveBeenCalled();
      expect(calls.fetchSource).not.toHaveBeenCalled();
      expect(calls.persist).not.toHaveBeenCalled();
    },
  );

  it.each(["preview", "save"] as const)(
    "%s still requires a successful fresh source read",
    async (operation) => {
      const calls = dependencies(true);
      const sourceFailure = new Error("DAWA HTTP 410 / source unavailable");
      calls.fetchSource.mockRejectedValue(sourceFailure);
      const input = { projectId: PROJECT_ID, watercourseId: WATERCOURSE_ID };

      await expect(
        operation === "preview"
          ? executeWatercoursePreview(input, USER_ID, CLIENT, calls.overrides)
          : executeWatercourseSave(input, USER_ID, CLIENT, calls.overrides),
      ).rejects.toBe(sourceFailure);
      expect(calls.fetchSource).toHaveBeenCalledWith(WATERCOURSE_ID);
      expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
        calls.fetchSource.mock.invocationCallOrder[0],
      );
      expect(calls.persist).not.toHaveBeenCalled();
    },
  );

  it("returns null for an authorized project without a saved reach, without fetching", async () => {
    const calls = dependencies(false);
    const loadSaved = vi.fn().mockResolvedValue(null);
    calls.overrides.loadSaved = loadSaved;

    await expect(
      executeWatercourseLoad(PROJECT_ID, USER_ID, CLIENT, calls.overrides),
    ).resolves.toBeNull();
    expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      loadSaved.mock.invocationCallOrder[0],
    );
    expect(calls.fetchSource).not.toHaveBeenCalled();
  });
});

async function geometryHash(): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(REACH.geometry));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ZONE_ID,
    project_id: PROJECT_ID,
    name: REACH.name,
    zone_type: "watercourse",
    status: "active",
    source_type: "imported",
    geometry: REACH.geometry,
    centroid_lat: REACH.center.lat,
    centroid_lng: REACH.center.lng,
    updated_at: "2026-09-12T12:00:00.000Z",
    source_metadata: {
      schema: "gofreyra.watercourse-reach-source/v1",
      source_system: "SDFI Danske Stednavne",
      source_id: WATERCOURSE_ID,
      source_url: REACH.sourceUrl,
      source_modified_at: REACH.modifiedAt,
      fetched_at: "2026-09-12T12:00:00.000Z",
      crs: "EPSG:4326",
      geometry_type: "MultiLineString",
      geometry_version: REACH.geometryVersion,
      geometry_sha256: await geometryHash(),
      bbox: REACH.bbox,
      length_m: REACH.lengthM,
      municipalities: REACH.municipalities,
      name_status: REACH.nameStatus,
      attribution: REACH.attribution,
      disclaimer: REACH.disclaimer,
    },
    ...overrides,
  };
}

async function storedDatafordelerRow() {
  const row = await storedRow();
  return {
    ...row,
    source_metadata: {
      ...row.source_metadata,
      schema: "gofreyra.watercourse-reach-source/v2",
      source_system: "KDS Datafordeler Danske Stednavne",
      source_provider: DATAFORDELER_WATERCOURSE_PROVIDER,
      source_url: buildDatafordelerWatercourseGeometryUrl(WATERCOURSE_ID),
      source_modified_at: null,
      geometry_version: null,
      source_crs: DATAFORDELER_WATERCOURSE_CRS,
      source_axis_order: DATAFORDELER_WATERCOURSE_AXIS_ORDER,
      dataset_version: DATAFORDELER_WATERCOURSE_DATASET_VERSION,
      source_registered_at: "2018-06-18T10:20:30.123Z",
      source_valid_from: "2010-01-01T00:00:00.000Z",
      official_length_m: 4200,
    },
  };
}

function loadClient(rows: unknown[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return { from: vi.fn().mockReturnValue(query) } as never;
}

describe("official watercourse reach persistence", () => {
  it.each([
    ["v1", "DAWA HTTP 410"],
    ["v1", "network timeout"],
    ["v2", "network unavailable"],
  ] as const)(
    "reopens validated %s metadata unchanged without the source even if it would fail: %s",
    async (version, failure) => {
      const row = version === "v1" ? await storedRow() : await storedDatafordelerRow();
      const rawBefore = structuredClone(row);
      const client = loadClient([row]);
      const calls = dependencies(false);
      const loadSaved = vi.fn(loadSavedOfficialWatercourseReach);
      calls.overrides.loadSaved = loadSaved;
      calls.fetchSource.mockRejectedValue(new Error(failure));

      const result = await executeWatercourseLoad(PROJECT_ID, USER_ID, client, calls.overrides);

      expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
        loadSaved.mock.invocationCallOrder[0],
      );
      expect(calls.fetchSource).not.toHaveBeenCalled();
      expect(calls.persist).not.toHaveBeenCalled();
      expect(row).toEqual(rawBefore);
      expect(result).toMatchObject({
        zoneId: row.id,
        savedAt: row.updated_at,
        id: WATERCOURSE_ID,
        geometry: row.geometry,
        sourceUrl: row.source_metadata.source_url,
        modifiedAt: row.source_metadata.source_modified_at,
        geometryVersion: row.source_metadata.geometry_version,
        municipalities: row.source_metadata.municipalities,
      });
      if (version === "v1") {
        expect(result?.sourceProvider).toBeUndefined();
        expect(result?.datasetVersion).toBeUndefined();
        expect(result?.sourceRegisteredAt).toBeUndefined();
        expect(result?.sourceValidFrom).toBeUndefined();
      } else {
        expect(result).toMatchObject({
          sourceProvider: DATAFORDELER_WATERCOURSE_PROVIDER,
          sourceCrs: DATAFORDELER_WATERCOURSE_CRS,
          sourceAxisOrder: DATAFORDELER_WATERCOURSE_AXIS_ORDER,
          datasetVersion: DATAFORDELER_WATERCOURSE_DATASET_VERSION,
          sourceRegisteredAt: "2018-06-18T10:20:30.123Z",
          sourceValidFrom: "2010-01-01T00:00:00.000Z",
          officialLengthM: 4200,
          modifiedAt: null,
          geometryVersion: null,
        });
      }
    },
  );

  it("still rejects an invalid stored hash without fetching a replacement", async () => {
    const row = await storedRow();
    row.source_metadata.geometry_sha256 = "0".repeat(64);
    const calls = dependencies(false);
    calls.overrides.loadSaved = loadSavedOfficialWatercourseReach;

    await expect(
      executeWatercourseLoad(PROJECT_ID, USER_ID, loadClient([row]), calls.overrides),
    ).rejects.toThrow("ugyldig kildeproveniens");
    expect(calls.fetchSource).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it("loads only a canonical row with matching provenance and geometry hash", async () => {
    const row = await storedRow();
    const loaded = await loadSavedOfficialWatercourseReach(loadClient([row]), PROJECT_ID);
    expect(loaded?.id).toBe(WATERCOURSE_ID);
    expect(loaded?.sourceUrl).toBe(REACH.sourceUrl);
    expect(loaded?.geometry).toEqual(REACH.geometry);
  });

  it("rejects forged URLs, hashes and multiple active reaches", async () => {
    const row = await storedRow();
    const forgedUrl = {
      ...row,
      source_metadata: { ...row.source_metadata, source_url: "https://example.invalid/phish" },
    };
    await expect(
      loadSavedOfficialWatercourseReach(loadClient([forgedUrl]), PROJECT_ID),
    ).rejects.toThrow("ugyldig kildeproveniens");

    const forgedHash = {
      ...row,
      source_metadata: { ...row.source_metadata, geometry_sha256: "0".repeat(64) },
    };
    await expect(
      loadSavedOfficialWatercourseReach(loadClient([forgedHash]), PROJECT_ID),
    ).rejects.toThrow("ugyldig kildeproveniens");

    await expect(
      loadSavedOfficialWatercourseReach(
        loadClient([row, { ...row, id: crypto.randomUUID() }]),
        PROJECT_ID,
      ),
    ).rejects.toThrow("flere aktive vandløbsstrenge");
  });

  it("inserts a provenance-complete row when no canonical reach exists", async () => {
    let inserted: Record<string, unknown> | null = null;
    const findQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    findQuery.select.mockReturnValue(findQuery);
    findQuery.eq.mockReturnValue(findQuery);
    findQuery.order.mockReturnValue(findQuery);
    const insertQuery = {
      insert: vi.fn((row: Record<string, unknown>) => {
        inserted = row;
        return {
          select: () => ({
            single: async () => ({
              data: {
                ...row,
                id: ZONE_ID,
                updated_at: "2026-09-12T12:00:00.000Z",
              },
              error: null,
            }),
          }),
        };
      }),
    };
    const client = {
      from: vi.fn().mockReturnValueOnce(findQuery).mockReturnValueOnce(insertQuery),
    } as never;

    const saved = await persistOfficialWatercourseReach(client, PROJECT_ID, USER_ID, REACH);

    expect(saved.zoneId).toBe(ZONE_ID);
    expect(insertQuery.insert).toHaveBeenCalledOnce();
    expect(inserted).toMatchObject({
      project_id: PROJECT_ID,
      zone_type: "watercourse",
      source_type: "imported",
      created_by: USER_ID,
      geometry: REACH.geometry,
    });
    const insertedRow = insertQuery.insert.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect((insertedRow["source_metadata"] as Record<string, unknown>)["geometry_sha256"]).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("updates the one active project reach instead of creating another", async () => {
    let updated: Record<string, unknown> | null = null;
    const findQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: ZONE_ID }], error: null }),
    };
    findQuery.select.mockReturnValue(findQuery);
    findQuery.eq.mockReturnValue(findQuery);
    findQuery.order.mockReturnValue(findQuery);
    const mutationQuery = {
      update: vi.fn((row: Record<string, unknown>) => {
        updated = row;
        const chain = {
          eq: vi.fn(),
          select: vi.fn(),
          single: vi.fn(),
        };
        chain.eq.mockReturnValue(chain);
        chain.select.mockReturnValue(chain);
        chain.single.mockResolvedValue({
          data: { ...row, id: ZONE_ID, updated_at: "2026-09-12T12:00:00.000Z" },
          error: null,
        });
        return chain;
      }),
    };
    const client = {
      from: vi.fn().mockReturnValueOnce(findQuery).mockReturnValueOnce(mutationQuery),
    } as never;

    const saved = await persistOfficialWatercourseReach(client, PROJECT_ID, USER_ID, REACH);

    expect(saved.zoneId).toBe(ZONE_ID);
    expect(mutationQuery.update).toHaveBeenCalledOnce();
    expect(updated).toMatchObject({ project_id: PROJECT_ID, zone_type: "watercourse" });
  });
});
