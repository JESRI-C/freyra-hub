import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  runIndicatorAggregation: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

vi.mock("@/services/monitoring/indicator-aggregation-engine", () => ({
  runIndicatorAggregation: mocks.runIndicatorAggregation,
}));

import { handleObservationsPost } from "@/routes/api/public/observations";

const PROJECT_A = "a0000000-0000-0000-0000-000000000001";
const PROJECT_B = "b0000000-0000-0000-0000-000000000002";
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

function rejectRpc(code: string, message: string): void {
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { code, message, details: null, hint: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OBSERVATIONS_INGEST_API_SECRET", DEDICATED_SECRET);
  vi.stubEnv("OBSERVATIONS_INGEST_PROJECT_ID", PROJECT_A);
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
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
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("rejects a credential scoped to project A when the payload targets project B", async () => {
    const response = await handleObservationsPost({ request: requestFor(PROJECT_B) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("sends one sanitized batch to the atomic RPC and aggregates only after success", async () => {
    const observedAt = "2026-08-29T10:15:00+02:00";
    const response = await handleObservationsPost({
      request: requestFor(PROJECT_A, {
        indicator_key: "water_level",
        value: 1.25,
        unit: "m",
        observed_at: observedAt,
        site_id: SITE_A,
        source_id: SOURCE_A,
        confidence: 0.95,
        metadata: { device: "sensor-a" },
        project_id: PROJECT_B,
        unsupported_field: "must be stripped",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      inserted: 1,
      project_id: PROJECT_A,
      aggregation: { updated: 1 },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("ingest_observations_atomic", {
      p_project_id: PROJECT_A,
      p_observations: [
        {
          site_id: SITE_A,
          source_id: SOURCE_A,
          observation_type: "ingest",
          indicator_key: "water_level",
          value: 1.25,
          unit: "m",
          confidence: 0.95,
          observed_at: observedAt,
          metadata: { device: "sensor-a" },
        },
      ],
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.runIndicatorAggregation).toHaveBeenCalledWith(PROJECT_A, expect.any(Object));
  });

  it("normalizes uppercase Postgres GUIDs before the RPC call", async () => {
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
    expect(mocks.rpc).toHaveBeenCalledWith(
      "ingest_observations_atomic",
      expect.objectContaining({
        p_project_id: PROJECT_A,
        p_observations: [expect.objectContaining({ site_id: SITE_A, source_id: SOURCE_A })],
      }),
    );
  });

  it("maps an unknown or tenantless project from the RPC to a safe 404", async () => {
    rejectRpc("P0002", "database detail that must not escape");

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown project_id" });
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("maps a late foreign-key scope rejection to a safe 400", async () => {
    rejectRpc("23503", "foreign-key diagnostic that must not escape");

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid observation scope" });
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it.each([
    ["site", { site_id: SITE_B }],
    ["source", { source_id: SOURCE_B }],
  ])("maps a cross-project %s relation to a safe 400", async (_label, relation) => {
    rejectRpc("23514", "relation database detail that must not escape");

    const response = await handleObservationsPost({
      request: requestFor(PROJECT_A, {
        indicator_key: "water_level",
        value: 1.25,
        ...relation,
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid observation scope" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("maps a database-rejected batch shape to the public payload error", async () => {
    rejectRpc("22023", "database detail that must not escape");

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("passes a mixed batch to exactly one RPC and never aggregates when it is rejected", async () => {
    rejectRpc("23514", "mixed relation scope");
    const observations = [
      { indicator_key: "water_level", value: 1.25, site_id: SITE_A },
      { indicator_key: "water_level", value: 1.5, site_id: SITE_A },
      { indicator_key: "water_level", value: 1.75, site_id: SITE_B },
    ];

    const response = await handleObservationsPost({
      request: batchRequestFor(PROJECT_A, observations),
    });

    expect(response.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const rpcArgs = mocks.rpc.mock.calls[0]?.[1] as { p_observations: unknown[] };
    expect(rpcArgs.p_observations).toHaveLength(3);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("uses explicit null relations when site and source are omitted", async () => {
    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "ingest_observations_atomic",
      expect.objectContaining({
        p_observations: [expect.objectContaining({ site_id: null, source_id: null })],
      }),
    );
  });

  it("fails closed without aggregation when the RPC returns an unexpected database error", async () => {
    rejectRpc("XX000", "secret provider diagnostic");

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Insert failed" });
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it("fails closed without leaking details when the RPC throws", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("secret transport diagnostic"));

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Insert failed" });
    expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
  });

  it.each([null, 0, 2, 1.5, "1"])(
    "rejects an impossible inserted count %j without aggregation",
    async (data) => {
      mocks.rpc.mockResolvedValueOnce({ data, error: null });

      const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Insert failed" });
      expect(mocks.runIndicatorAggregation).not.toHaveBeenCalled();
    },
  );

  it("preserves best-effort aggregation after a committed atomic ingest", async () => {
    mocks.runIndicatorAggregation.mockRejectedValueOnce(new Error("aggregation unavailable"));

    const response = await handleObservationsPost({ request: requestFor(PROJECT_A) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      inserted: 1,
      project_id: PROJECT_A,
      aggregation: { error: "aggregation unavailable" },
    });
  });
});
