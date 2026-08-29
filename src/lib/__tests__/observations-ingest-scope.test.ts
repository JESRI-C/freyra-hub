import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insertedRows: [] as Array<Record<string, unknown>>,
  insertError: null as { message: string } | null,
  relationError: null as { message: string } | null,
  projectOrganizationId: "11000000-0000-0000-0000-000000000001" as string | null,
  siteLookupChunks: [] as string[][],
  sourceLookupChunks: [] as string[][],
  relationEqCalls: [] as Array<{ table: string; column: string; projectId: string }>,
  relationInCalls: [] as Array<{ table: string; column: string; ids: string[] }>,
  runIndicatorAggregation: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock("@/services/monitoring/indicator-aggregation-engine", () => ({
  runIndicatorAggregation: mocks.runIndicatorAggregation,
}));

import { handleObservationsPost } from "@/routes/api/public/observations";

const PROJECT_A = "a0000000-0000-0000-0000-000000000001";
const PROJECT_B = "b0000000-0000-0000-0000-000000000002";
const ORGANIZATION_A = "c1000000-0000-0000-0000-000000000001";
const SITE_A = "d0000000-0000-0000-0000-000000000101";
const SITE_B = "d0000000-0000-0000-0000-000000000102";
const SOURCE_A = "e0000000-0000-0000-0000-000000000201";
const SOURCE_B = "e0000000-0000-0000-0000-000000000202";
const DEDICATED_SECRET = "dedicated-observations-secret-for-tests";

function requestFor(
  projectId: string,
  observation: Record<string, unknown> = { indicator_key: "water_level", value: 1.25 },
): Request {
  return new Request("https://example.test/api/public/observations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": DEDICATED_SECRET,
    },
    body: JSON.stringify({ project_id: projectId, observation }),
  });
}

function batchRequestFor(projectId: string, observations: Array<Record<string, unknown>>): Request {
  return new Request("https://example.test/api/public/observations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": DEDICATED_SECRET,
    },
    body: JSON.stringify({ project_id: projectId, observations }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertedRows.length = 0;
  mocks.insertError = null;
  mocks.relationError = null;
  mocks.projectOrganizationId = ORGANIZATION_A;
  mocks.siteLookupChunks.length = 0;
  mocks.sourceLookupChunks.length = 0;
  mocks.relationEqCalls.length = 0;
  mocks.relationInCalls.length = 0;
  vi.stubEnv("OBSERVATIONS_INGEST_API_SECRET", DEDICATED_SECRET);
  vi.stubEnv("OBSERVATIONS_INGEST_PROJECT_ID", PROJECT_A);

  mocks.from.mockImplementation((table: string) => {
    if (table === "projects") {
      return {
        select: () => ({
          eq: (_column: string, projectId: string) => ({
            maybeSingle: async () => ({
              data:
                projectId === PROJECT_A
                  ? { id: PROJECT_A, organization_id: mocks.projectOrganizationId }
                  : null,
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "sites" || table === "data_sources") {
      const validId = table === "sites" ? SITE_A : SOURCE_A;
      return {
        select: () => ({
          eq: (column: string, projectId: string) => {
            mocks.relationEqCalls.push({ table, column, projectId });
            return {
              in: async (idColumn: string, ids: string[]) => {
                mocks.relationInCalls.push({ table, column: idColumn, ids });
                return {
                  data: (() => {
                    (table === "sites" ? mocks.siteLookupChunks : mocks.sourceLookupChunks).push(
                      ids,
                    );
                    return projectId === PROJECT_A && ids.includes(validId)
                      ? [{ id: validId }]
                      : [];
                  })(),
                  error: mocks.relationError,
                };
              },
            };
          },
        }),
      };
    }

    if (table === "observations") {
      return {
        insert: async (rows: Array<Record<string, unknown>>) => {
          mocks.insertedRows.push(...rows);
          return { error: mocks.insertError };
        },
      };
    }

    throw new Error(`Unexpected table in test: ${table}`);
  });
  mocks.runIndicatorAggregation.mockResolvedValue({ updated: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("observations ingest project scope", () => {
  it.each([undefined, "not-a-uuid"])(
    "fails closed before database access when the configured project scope is %s",
    async (configuredScope) => {
      vi.stubEnv("OBSERVATIONS_INGEST_PROJECT_ID", configuredScope ?? "");

      const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "Ingest scope not configured" });
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("rejects a credential scoped to project A when the payload targets project B", async () => {
    const response = await handleObservationsPost({ request: requestFor(PROJECT_B) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("inserts observations only when site and source belong to the scoped project", async () => {
    const response = await handleObservationsPost({
      request: requestFor(PROJECT_A, {
        indicator_key: "water_level",
        value: 1.25,
        site_id: SITE_A,
        source_id: SOURCE_A,
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.insertedRows).toHaveLength(1);
    expect(mocks.insertedRows[0]).toMatchObject({
      project_id: PROJECT_A,
      site_id: SITE_A,
      source_id: SOURCE_A,
    });
    expect(mocks.relationEqCalls).toEqual([
      { table: "sites", column: "project_id", projectId: PROJECT_A },
      { table: "data_sources", column: "project_id", projectId: PROJECT_A },
    ]);
    expect(mocks.relationInCalls).toEqual([
      { table: "sites", column: "id", ids: [SITE_A] },
      { table: "data_sources", column: "id", ids: [SOURCE_A] },
    ]);
    expect(mocks.runIndicatorAggregation).toHaveBeenCalledWith(PROJECT_A, expect.any(Object));
  });

  it("normalizes uppercase Postgres GUIDs before lookup and insert", async () => {
    vi.stubEnv("OBSERVATIONS_INGEST_PROJECT_ID", PROJECT_A.toUpperCase());

    const response = await handleObservationsPost({
      request: requestFor(PROJECT_A.toUpperCase(), {
        indicator_key: "water_level",
        value: 1.25,
        site_id: SITE_A.toUpperCase(),
        source_id: SOURCE_A.toUpperCase(),
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.insertedRows[0]).toMatchObject({
      project_id: PROJECT_A,
      site_id: SITE_A,
      source_id: SOURCE_A,
    });
  });

  it("fails closed when the scoped project has no tenant organization", async () => {
    mocks.projectOrganizationId = null;

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalledWith("observations");
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it.each([
    ["site", { site_id: SITE_B }],
    ["source", { source_id: SOURCE_B }],
  ])("rejects a cross-project %s relation without inserting", async (_label, relation) => {
    const response = await handleObservationsPost({
      request: requestFor(PROJECT_A, {
        indicator_key: "water_level",
        value: 1.25,
        ...relation,
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid observation scope" });
    expect(mocks.insertedRows).toHaveLength(0);
    expect(mocks.from).not.toHaveBeenCalledWith("observations");
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("fails without inserting when relation validation cannot be completed", async () => {
    mocks.relationError = { message: "relation lookup failed" };

    const response = await handleObservationsPost({
      request: requestFor(PROJECT_A, {
        indicator_key: "water_level",
        value: 1.25,
        site_id: SITE_A,
      }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Relation validation failed" });
    expect(mocks.insertedRows).toHaveLength(0);
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("rejects a mixed batch atomically and deduplicates relation lookups", async () => {
    const response = await handleObservationsPost({
      request: batchRequestFor(PROJECT_A, [
        { indicator_key: "water_level", value: 1.25, site_id: SITE_A },
        { indicator_key: "water_level", value: 1.5, site_id: SITE_A },
        { indicator_key: "water_level", value: 1.75, site_id: SITE_B },
      ]),
    });

    expect(response.status).toBe(400);
    expect(mocks.siteLookupChunks).toEqual([[SITE_A, SITE_B]]);
    expect(mocks.insertedRows).toHaveLength(0);
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("skips relation lookups when IDs are omitted", async () => {
    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalledWith("sites");
    expect(mocks.from).not.toHaveBeenCalledWith("data_sources");
    expect(mocks.insertedRows[0]).toMatchObject({ site_id: null, source_id: null });
  });

  it("does not aggregate after a failed insert", async () => {
    mocks.insertError = { message: "insert failed" };

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(500);
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });
});
