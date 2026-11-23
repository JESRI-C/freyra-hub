import { describe, expect, it, vi } from "vitest";
import { executeNatureGeoRequest, parseNatureGeoInput } from "@/lib/nature-geo.functions";
import {
  ProjectAccessDeniedError,
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { ACTUAL_NATIVE_FEATURES } from "@/services/baseline/__tests__/water-plan-nature.fixtures";
import {
  NATURE_POLYGON,
  NATURE_NOW,
  natureCatalogueFixture,
} from "@/services/__tests__/nature-geo.fixtures";

const PROJECT_A = "10000000-0000-4000-8000-000000000001";
const PROJECT_B = "10000000-0000-4000-8000-000000000002";
const ORGANIZATION_A = "20000000-0000-4000-8000-000000000001";
const ORGANIZATION_B = "20000000-0000-4000-8000-000000000002";
const USER_A = "30000000-0000-4000-8000-000000000001";
const SEED_PROJECT = "10000000-0000-0000-0000-000000000001";

it("accepts legacy seed UUIDs and centroid-only callers while supporting project-only reads", () => {
  expect(parseNatureGeoInput({ projectId: SEED_PROJECT })).toEqual({ projectId: SEED_PROJECT });
  expect(parseNatureGeoInput({ projectId: PROJECT_A, lat: 55.1, lng: 9.1 })).toEqual({
    projectId: PROJECT_A,
    lat: 55.1,
    lng: 9.1,
  });
  expect(() => parseNatureGeoInput({ projectId: "not-a-uuid" })).toThrow();
});

type TableRows = Record<string, Array<Record<string, unknown>>>;

function createAuthorizationClient(
  rows: TableRows,
  errorTable?: string,
): ProjectAuthorizationClient {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => {
          if (table === errorTable) {
            return { data: null, error: { message: "database unavailable" } };
          }

          const data = (rows[table] ?? []).find((row) =>
            Object.entries(filters).every(([column, value]) => row[column] === value),
          );
          return { data: data ?? null, error: null };
        },
      };
      return query;
    },
  };
}

function projectRows(overrides: Record<string, unknown> = {}): TableRows {
  return {
    projects: [
      {
        id: PROJECT_A,
        organization_id: ORGANIZATION_A,
        geometry_centroid_lat: 55.249,
        geometry_centroid_lng: 9.487,
        ...overrides,
      },
    ],
    project_members: [],
    organization_memberships: [],
  };
}

describe("requireProjectNatureAccess", () => {
  it.each([
    ["admin", true],
    ["project_manager", true],
    ["editor", true],
    ["field", false],
    ["viewer", false],
    ["external", false],
  ] as const)("maps direct project role %s to canPersist=%s", async (role, canPersist) => {
    const rows = projectRows();
    rows["project_members"].push({ project_id: PROJECT_A, user_id: USER_A, role });

    const access = await requireProjectNatureAccess(
      createAuthorizationClient(rows),
      USER_A,
      PROJECT_A,
    );

    expect(access).toEqual({
      canPersist,
      centroid: { lat: 55.249, lng: 9.487 },
      role,
    });
  });

  it.each([
    ["owner", "organization_owner"],
    ["admin", "organization_admin"],
  ] as const)("allows organization %s to persist", async (role, expectedRole) => {
    const rows = projectRows();
    rows["organization_memberships"].push({
      organization_id: ORGANIZATION_A,
      user_id: USER_A,
      role,
    });

    const access = await requireProjectNatureAccess(
      createAuthorizationClient(rows),
      USER_A,
      PROJECT_A,
    );

    expect(access.role).toBe(expectedRole);
    expect(access.canPersist).toBe(true);
  });

  it("denies an ordinary organization editor and an existing cross-tenant project with the same error", async () => {
    const ordinaryMemberRows = projectRows();
    ordinaryMemberRows["organization_memberships"].push({
      organization_id: ORGANIZATION_A,
      user_id: USER_A,
      role: "editor",
    });

    const crossTenantRows = projectRows();
    crossTenantRows["projects"].push({
      id: PROJECT_B,
      organization_id: ORGANIZATION_B,
      geometry_centroid_lat: 55.7,
      geometry_centroid_lng: 9.8,
    });
    crossTenantRows["project_members"].push({
      project_id: PROJECT_A,
      user_id: USER_A,
      role: "editor",
    });
    crossTenantRows["organization_memberships"].push({
      organization_id: ORGANIZATION_A,
      user_id: USER_A,
      role: "editor",
    });

    const ordinaryMemberCall = requireProjectNatureAccess(
      createAuthorizationClient(ordinaryMemberRows),
      USER_A,
      PROJECT_A,
    );
    const crossTenantCall = requireProjectNatureAccess(
      createAuthorizationClient(crossTenantRows),
      USER_A,
      PROJECT_B,
    );

    await expect(ordinaryMemberCall).rejects.toEqual(new ProjectAccessDeniedError());
    await expect(crossTenantCall).rejects.toEqual(new ProjectAccessDeniedError());
    await expect(crossTenantCall).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(["projects", "project_members", "organization_memberships"])(
    "fails closed when the %s authorization query fails",
    async (table) => {
      const rows = projectRows();

      await expect(
        requireProjectNatureAccess(createAuthorizationClient(rows, table), USER_A, PROJECT_A),
      ).rejects.toEqual(new ProjectAccessDeniedError());
    },
  );

  it("normalizes thrown database failures to the same generic denial", async () => {
    const throwingClient = {
      from: () => {
        throw new Error("connection details must not escape");
      },
    } as ProjectAuthorizationClient;

    await expect(requireProjectNatureAccess(throwingClient, USER_A, PROJECT_A)).rejects.toEqual(
      new ProjectAccessDeniedError(),
    );
  });

  it("does not expose an invalid stored centroid for persistence", async () => {
    const rows = projectRows({ geometry_centroid_lat: null, geometry_centroid_lng: "spoofed" });
    rows["project_members"].push({ project_id: PROJECT_A, user_id: USER_A, role: "editor" });

    const access = await requireProjectNatureAccess(
      createAuthorizationClient(rows),
      USER_A,
      PROJECT_A,
    );

    expect(access.centroid).toBeNull();
    expect(access.canPersist).toBe(true);
  });
});

describe("read-only current nature catalogue", () => {
  const input = { projectId: PROJECT_A, lat: 55.1, lng: 9.1 };
  function dependencies(role: "editor" | "viewer" | "field" = "editor") {
    const authorizeProject = vi.fn().mockResolvedValue({
      canPersist: role === "editor",
      role,
      centroid: { lat: 55.249, lng: 9.487 },
    } as ProjectNatureAccess);
    const loadStoredPolygon = vi.fn().mockResolvedValue(NATURE_POLYGON);
    const fetchSource = vi.fn(natureCatalogueFixture);
    return {
      authorizeProject,
      loadStoredPolygon,
      fetchSource,
      isLiveEnabled: () => true,
      now: () => NATURE_NOW,
    };
  }
  it("denies access before area loading or every upstream call", async () => {
    const calls = dependencies();
    calls.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(
      executeNatureGeoRequest(input, USER_A, {} as ProjectAuthorizationClient, calls),
    ).rejects.toEqual(new ProjectAccessDeniedError());
    expect(calls.loadStoredPolygon).not.toHaveBeenCalled();
    expect(calls.fetchSource).not.toHaveBeenCalled();
  });
  it.each(["editor", "viewer", "field"] as const)(
    "keeps %s entirely read-only and ignores client/stored centroid as an area",
    async (role) => {
      const calls = dependencies(role);
      const result = await executeNatureGeoRequest(
        input,
        USER_A,
        {} as ProjectAuthorizationClient,
        calls,
      );
      expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
        calls.loadStoredPolygon.mock.invocationCallOrder[0],
      );
      expect(calls.loadStoredPolygon.mock.invocationCallOrder[0]).toBeLessThan(
        calls.fetchSource.mock.invocationCallOrder[0],
      );
      expect(calls.fetchSource).toHaveBeenCalledWith({
        polygon: NATURE_POLYGON,
        geometrySha256: await baselineSha256(NATURE_POLYGON),
        dateFrom: "2026-10-13",
        dateTo: "2026-10-13",
      });
      expect(result).toMatchObject({
        status: "partial",
        persisted: false,
        persistedCounts: { paragraph3: 0, watercourses: 0 },
        candidateCounts: { paragraph3: 2, watercourses: 1 },
        provenance: {
          purpose: "current_catalogue_view",
          catalogueDate: "2026-10-13",
          spatialCoverage: "unknown",
          temporalCoverage: "unknown",
          juridicalPresenceAssessed: false,
          reportAccepted: false,
          upstreamTransactionalSnapshot: false,
        },
      });
      expect(result.paragraph3?.features[0].geometry.coordinates).not.toEqual(
        ACTUAL_NATIVE_FEATURES["protected-nature"][0].geometry.coordinates,
      );
    },
  );
  it("uses the caller-RLS stored canonical polygon without a writer or client area fallback", async () => {
    const rows = projectRows({ geometry_polygon: NATURE_POLYGON });
    rows.project_members.push({ project_id: PROJECT_A, user_id: USER_A, role: "viewer" });
    const client = createAuthorizationClient(rows);
    const fetchSource = vi.fn(natureCatalogueFixture);
    const result = await executeNatureGeoRequest(input, USER_A, client, {
      fetchSource,
      now: () => NATURE_NOW,
      isLiveEnabled: () => true,
    });
    expect(result.status).toBe("partial");
    expect(result.persisted).toBe(false);
    expect(fetchSource.mock.calls[0][0]!.polygon).toEqual(NATURE_POLYGON);
    expect(rows.projects[0].geometry_polygon).toEqual(NATURE_POLYGON);
    expect(Object.keys(rows).sort()).toEqual([
      "organization_memberships",
      "project_members",
      "projects",
    ]);
  });
  it.each([
    null,
    { type: "Polygon", coordinates: [] },
    {
      type: "Polygon",
      coordinates: [
        [
          [9.25, 55.33],
          [9.27, 55.37],
          [9.25, 55.37],
          [9.27, 55.33],
          [9.25, 55.33],
        ],
      ],
    },
  ])("does not invent an area when stored polygon is invalid/noncanonical: %j", async (polygon) => {
    const rows = projectRows({ geometry_polygon: polygon });
    rows.project_members.push({ project_id: PROJECT_A, user_id: USER_A, role: "editor" });
    const fetchSource = vi.fn(natureCatalogueFixture);
    const result = await executeNatureGeoRequest(input, USER_A, createAuthorizationClient(rows), {
      fetchSource,
      now: () => NATURE_NOW,
      isLiveEnabled: () => true,
    });
    expect(result).toMatchObject({
      mode: "error",
      status: "unknown",
      paragraph3: null,
      watercourses: null,
      candidateCounts: { paragraph3: null, watercourses: null },
      persisted: false,
    });
    expect(fetchSource).not.toHaveBeenCalled();
  });
  it("does not fetch or overwrite context when live catalogue is disabled", async () => {
    const calls = dependencies();
    calls.isLiveEnabled = () => false;
    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      {} as ProjectAuthorizationClient,
      calls,
    );
    expect(calls.authorizeProject).toHaveBeenCalledOnce();
    expect(calls.loadStoredPolygon).not.toHaveBeenCalled();
    expect(calls.fetchSource).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: "preview",
      status: "disabled",
      candidateCounts: { paragraph3: null, watercourses: null },
      paragraph3: null,
      persisted: false,
    });
  });
  it.each(["failed", "timeout"] as const)(
    "preserves %s as unknown counts with no display/context persistence",
    async (status) => {
      const calls = dependencies();
      const source = await natureCatalogueFixture();
      calls.fetchSource.mockResolvedValue({
        ...source,
        mode: "error",
        status,
        payload: null,
        payloadSha256: null,
        error: { code: "HTTP_HTML_OR_TIMEOUT", message: "upstream unavailable" },
      });
      const result = await executeNatureGeoRequest(
        input,
        USER_A,
        {} as ProjectAuthorizationClient,
        calls,
      );
      expect(result).toMatchObject({
        status,
        paragraph3: null,
        watercourses: null,
        candidateCounts: { paragraph3: null, watercourses: null },
        persisted: false,
        persistedCounts: { paragraph3: 0, watercourses: 0 },
        provenance: null,
      });
    },
  );
  it("redacts thrown source or database details instead of turning failure into0", async () => {
    const calls = dependencies();
    calls.fetchSource.mockRejectedValue(new Error("PRIVATE-SYNTHETIC person@example.invalid"));
    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      {} as ProjectAuthorizationClient,
      calls,
    );
    expect(result.status).toBe("failed");
    expect(result.candidateCounts.paragraph3).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE-SYNTHETIC");
    calls.loadStoredPolygon.mockRejectedValue(new Error("database details"));
    const areaFailure = await executeNatureGeoRequest(
      input,
      USER_A,
      {} as ProjectAuthorizationClient,
      calls,
    );
    expect(areaFailure.status).toBe("unknown");
    expect(JSON.stringify(areaFailure)).not.toContain("database details");
  });
  it("rejects mismatching source hash or project scope before showing candidates", async () => {
    for (const change of ["hash", "scope"]) {
      const calls = dependencies();
      const source = await natureCatalogueFixture();
      if (change === "hash") source.payloadSha256 = "f".repeat(64);
      else source.query.geometrySha256 = "f".repeat(64);
      calls.fetchSource.mockResolvedValue(source);
      const result = await executeNatureGeoRequest(
        input,
        USER_A,
        {} as ProjectAuthorizationClient,
        calls,
      );
      expect(result.status).toBe("failed");
      expect(result.paragraph3).toBeNull();
      expect(result.provenance).toBeNull();
    }
  });
  it("uses the UTC catalogue day, without claiming historical inspection coverage", async () => {
    const calls = dependencies();
    calls.now = () => "2026-10-14T00:30:00+02:00";
    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      {} as ProjectAuthorizationClient,
      calls,
    );
    expect(calls.fetchSource.mock.calls[0][0]!.dateFrom).toBe("2026-10-13");
    expect(result.provenance?.temporalCoverage).toBe("unknown");
  });
});
