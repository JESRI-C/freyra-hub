import { describe, expect, it, vi } from "vitest";
import {
  executeNatureGeoRequest,
  parseNatureGeoInput,
  persistNatureGeoFeatures,
  type NatureGeoAdminClient,
  type NatureGeoExecutionDependencies,
} from "@/lib/nature-geo.functions";
import {
  ProjectAccessDeniedError,
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import type { NatureFeatureCollection } from "@/services/nature-geo-transform";

const PROJECT_A = "10000000-0000-4000-8000-000000000001";
const PROJECT_B = "10000000-0000-4000-8000-000000000002";
const ORGANIZATION_A = "20000000-0000-4000-8000-000000000001";
const ORGANIZATION_B = "20000000-0000-4000-8000-000000000002";
const USER_A = "30000000-0000-4000-8000-000000000001";
const SEED_PROJECT = "10000000-0000-0000-0000-000000000001";

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

const PARAGRAPH_3: NatureFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "p3-1",
      geometry: { type: "Point", coordinates: [9.487, 55.249] },
      properties: { natureType: "Eng" },
    },
  ],
};

const WATERCOURSES: NatureFeatureCollection = { type: "FeatureCollection", features: [] };
const UNUSED_AUTH_CLIENT = {} as ProjectAuthorizationClient;
const ADMIN_CLIENT = {} as NatureGeoAdminClient;

function createPersistenceClient(failTable?: string) {
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const mutations: string[] = [];

  const client = {
    from(table: string) {
      const error = table === failTable ? { message: "write failed" } : null;
      return {
        select: () => ({
          eq: (_column: string, value: unknown) => ({
            maybeSingle: async () => ({
              data:
                table === "map_layers"
                  ? { id: value === "protected_nature" ? "layer-p3" : "layer-water" }
                  : null,
              error: null,
            }),
            limit: async () => ({ data: [], error: null }),
          }),
        }),
        upsert: async () => {
          mutations.push(`upsert:${table}`);
          return { error };
        },
        update: () => ({
          eq: async () => {
            mutations.push(`update:${table}`);
            return { error };
          },
        }),
        insert: async (rows: unknown) => {
          mutations.push(`insert:${table}`);
          inserts.push({ table, rows });
          return { error };
        },
      };
    },
  } as NatureGeoAdminClient;

  return { client, inserts, mutations };
}

function executionDependencies(access: ProjectNatureAccess) {
  const authorizeProject = vi.fn().mockResolvedValue(access);
  const fetchCollections = vi.fn().mockResolvedValue({
    paragraph3: PARAGRAPH_3,
    watercourses: WATERCOURSES,
  });
  const loadAdminClient = vi.fn().mockResolvedValue(ADMIN_CLIENT);
  const persist = vi.fn().mockResolvedValue({
    persisted: true,
    counts: { paragraph3: 1, watercourses: 0 },
  });

  const dependencies: Partial<NatureGeoExecutionDependencies> = {
    isLiveEnabled: () => true,
    authorizeProject,
    fetchCollections,
    loadAdminClient,
    persist,
  };

  return { dependencies, authorizeProject, fetchCollections, loadAdminClient, persist };
}

describe("executeNatureGeoRequest", () => {
  const input = { projectId: PROJECT_A, lat: 55.1, lng: 9.1 };

  it("rejects unauthorized projects before WFS, admin load, or persistence", async () => {
    const calls = executionDependencies({
      canPersist: true,
      centroid: { lat: 55.2, lng: 9.2 },
      role: "editor",
    });
    calls.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());

    await expect(
      executeNatureGeoRequest(input, USER_A, UNUSED_AUTH_CLIENT, calls.dependencies),
    ).rejects.toEqual(new ProjectAccessDeniedError());
    expect(calls.fetchCollections).not.toHaveBeenCalled();
    expect(calls.loadAdminClient).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it("keeps field/viewer data read-only and uses the server-stored centroid", async () => {
    const calls = executionDependencies({
      canPersist: false,
      centroid: { lat: 55.249, lng: 9.487 },
      role: "viewer",
    });

    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      UNUSED_AUTH_CLIENT,
      calls.dependencies,
    );

    expect(calls.fetchCollections).toHaveBeenCalledWith(55.249, 9.487);
    expect(calls.loadAdminClient).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: "live", persisted: false, paragraph3: PARAGRAPH_3 });
  });

  it("loads service-role only after writer access and persists the verified actor", async () => {
    const calls = executionDependencies({
      canPersist: true,
      centroid: { lat: 55.249, lng: 9.487 },
      role: "editor",
    });

    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      UNUSED_AUTH_CLIENT,
      calls.dependencies,
    );

    expect(calls.authorizeProject).toHaveBeenCalledWith(UNUSED_AUTH_CLIENT, USER_A, PROJECT_A);
    expect(calls.fetchCollections).toHaveBeenCalledWith(55.249, 9.487);
    expect(calls.loadAdminClient).toHaveBeenCalledOnce();
    expect(calls.persist).toHaveBeenCalledWith(
      ADMIN_CLIENT,
      PROJECT_A,
      USER_A,
      PARAGRAPH_3,
      WATERCOURSES,
    );
    expect(calls.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      calls.loadAdminClient.mock.invocationCallOrder[0],
    );
    expect(result.persisted).toBe(true);
    expect(result.persistedCounts).toEqual({ paragraph3: 1, watercourses: 0 });
  });

  it("never persists from caller coordinates when the project has no valid stored centroid", async () => {
    const calls = executionDependencies({ canPersist: true, centroid: null, role: "editor" });

    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      UNUSED_AUTH_CLIENT,
      calls.dependencies,
    );

    expect(calls.fetchCollections).toHaveBeenCalledWith(input.lat, input.lng);
    expect(calls.loadAdminClient).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
    expect(result.persisted).toBe(false);
  });

  it("falls back to read-only data when service-role configuration is unavailable", async () => {
    const calls = executionDependencies({
      canPersist: true,
      centroid: { lat: 55.249, lng: 9.487 },
      role: "editor",
    });
    calls.loadAdminClient.mockResolvedValue(null);

    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      UNUSED_AUTH_CLIENT,
      calls.dependencies,
    );

    expect(calls.persist).not.toHaveBeenCalled();
    expect(result.persisted).toBe(false);
  });

  it("authorizes preview scope but avoids WFS and privileged dependencies when live data is off", async () => {
    const calls = executionDependencies({
      canPersist: true,
      centroid: { lat: 55.249, lng: 9.487 },
      role: "editor",
    });
    calls.dependencies.isLiveEnabled = () => false;

    const result = await executeNatureGeoRequest(
      input,
      USER_A,
      UNUSED_AUTH_CLIENT,
      calls.dependencies,
    );

    expect(calls.authorizeProject).toHaveBeenCalledWith(UNUSED_AUTH_CLIENT, USER_A, PROJECT_A);
    expect(calls.fetchCollections).not.toHaveBeenCalled();
    expect(calls.loadAdminClient).not.toHaveBeenCalled();
    expect(result).toEqual({
      paragraph3: { type: "FeatureCollection", features: [] },
      watercourses: { type: "FeatureCollection", features: [] },
      mode: "preview",
      persisted: false,
      persistedCounts: { paragraph3: 0, watercourses: 0 },
    });
  });
});

describe("persistNatureGeoFeatures", () => {
  it("records the verified actor and only reports success when every write succeeds", async () => {
    const persistence = createPersistenceClient();

    const result = await persistNatureGeoFeatures(
      persistence.client,
      PROJECT_A,
      USER_A,
      PARAGRAPH_3,
      WATERCOURSES,
    );

    expect(result).toEqual({ persisted: true, counts: { paragraph3: 1, watercourses: 0 } });
    const logInsert = persistence.inserts.find((entry) => entry.table === "connector_fetch_logs");
    expect(logInsert?.rows).toEqual([
      expect.objectContaining({
        project_id: PROJECT_A,
        metadata: expect.objectContaining({ requested_by: USER_A }),
      }),
    ]);
  });

  it.each(["geo_features", "nature_contexts", "connector_fetch_logs"])(
    "reports persisted=false when %s fails instead of claiming a complete write",
    async (failTable) => {
      const persistence = createPersistenceClient(failTable);

      const result = await persistNatureGeoFeatures(
        persistence.client,
        PROJECT_A,
        USER_A,
        PARAGRAPH_3,
        WATERCOURSES,
      );

      expect(result).toEqual({ persisted: false, counts: { paragraph3: 0, watercourses: 0 } });
    },
  );
});

describe("parseNatureGeoInput", () => {
  it("accepts a scoped UUID and rejects missing or malformed project identifiers", () => {
    expect(parseNatureGeoInput({ projectId: PROJECT_A, lat: 55.1, lng: 9.1 })).toEqual({
      projectId: PROJECT_A,
      lat: 55.1,
      lng: 9.1,
    });
    expect(() => parseNatureGeoInput({ lat: 55.1, lng: 9.1 })).toThrow();
    expect(() => parseNatureGeoInput({ projectId: "project-a", lat: 55.1, lng: 9.1 })).toThrow();
    expect(parseNatureGeoInput({ projectId: SEED_PROJECT, lat: 55.1, lng: 9.1 }).projectId).toBe(
      SEED_PROJECT,
    );
  });
});
