import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  runQualityEvaluation: vi.fn(),
  runAlertEvaluation: vi.fn(),
  runIndicatorAggregation: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock("@/services/monitoring/quality-engine", () => ({
  runQualityEvaluation: mocks.runQualityEvaluation,
}));

vi.mock("@/services/monitoring/alert-engine", () => ({
  runAlertEvaluation: mocks.runAlertEvaluation,
}));

vi.mock("@/services/monitoring/indicator-aggregation-engine", () => ({
  runIndicatorAggregation: mocks.runIndicatorAggregation,
}));

import { handleMonitoringEvaluatePost } from "@/routes/api/public/monitoring.evaluate";
import { handleObservationsPost } from "@/routes/api/public/observations";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const DEDICATED_SECRET = "dedicated-server-secret-for-tests";
const PUBLIC_SUPABASE_KEY = "sb_publishable_public-test-key";
const SECRET_SUPABASE_KEY = "sb_secret_backend-test-key";
const SERVICE_ROLE_SUPABASE_JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test-signature";

const AUTH_ENV_NAMES = [
  "OBSERVATIONS_INGEST_API_SECRET",
  "MONITORING_CRON_API_SECRET",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
] as const;

type RouteHandler = (input: { request: Request }) => Promise<Response>;

interface EndpointCase {
  name: string;
  secretEnvName: (typeof AUTH_ENV_NAMES)[0] | (typeof AUTH_ENV_NAMES)[1];
  handler: RouteHandler;
  request: (headers?: Record<string, string>) => Request;
}

function observationRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/public/observations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      project_id: PROJECT_ID,
      observation: { indicator_key: "water_level", value: 1.25, unit: "m" },
    }),
  });
}

function monitoringRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/public/monitoring/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ project_id: PROJECT_ID }),
  });
}

const endpoints: EndpointCase[] = [
  {
    name: "observations ingest",
    secretEnvName: "OBSERVATIONS_INGEST_API_SECRET",
    handler: handleObservationsPost,
    request: observationRequest,
  },
  {
    name: "monitoring cron",
    secretEnvName: "MONITORING_CRON_API_SECRET",
    handler: handleMonitoringEvaluatePost,
    request: monitoringRequest,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const envName of AUTH_ENV_NAMES) vi.stubEnv(envName, "");

  mocks.from.mockImplementation((table: string) => {
    if (table === "projects") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: PROJECT_ID } }),
          }),
        }),
      };
    }
    if (table === "observations") {
      return { insert: async () => ({ error: null }) };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
  mocks.runQualityEvaluation.mockResolvedValue({ evaluated: 1 });
  mocks.runAlertEvaluation.mockResolvedValue({ evaluated: 1 });
  mocks.runIndicatorAggregation.mockResolvedValue({ updated: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(endpoints)("$name endpoint authentication", (endpoint) => {
  it("fails closed with 503 when its dedicated server secret is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", PUBLIC_SUPABASE_KEY);

    const response = await endpoint.handler({
      request: endpoint.request({ "x-api-key": PUBLIC_SUPABASE_KEY }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Server secret not configured" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns 401 when the credential is missing or wrong", async () => {
    vi.stubEnv(endpoint.secretEnvName, DEDICATED_SECRET);

    const missing = await endpoint.handler({ request: endpoint.request() });
    const wrong = await endpoint.handler({
      request: endpoint.request({ Authorization: "Bearer wrong-secret" }),
    });

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("explicitly rejects a public Supabase key", async () => {
    vi.stubEnv(endpoint.secretEnvName, DEDICATED_SECRET);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", PUBLIC_SUPABASE_KEY);

    const response = await endpoint.handler({
      request: endpoint.request({ "x-api-key": PUBLIC_SUPABASE_KEY }),
    });

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ["Supabase secret key", "SUPABASE_SECRET_KEY", SECRET_SUPABASE_KEY],
    ["legacy service_role JWT", "SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_SUPABASE_JWT],
  ])("rejects a %s supplied as the request credential", async (_label, envName, credential) => {
    vi.stubEnv(endpoint.secretEnvName, DEDICATED_SECRET);
    vi.stubEnv(envName, credential);

    const response = await endpoint.handler({
      request: endpoint.request({ Authorization: `Bearer ${credential}` }),
    });

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ["Supabase secret key", SECRET_SUPABASE_KEY],
    ["legacy service_role JWT", SERVICE_ROLE_SUPABASE_JWT],
  ])("fails closed when the dedicated secret is configured as a %s", async (_label, credential) => {
    vi.stubEnv(endpoint.secretEnvName, credential);

    const response = await endpoint.handler({
      request: endpoint.request({ "x-api-key": credential }),
    });

    expect(response.status).toBe(503);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not accept the legacy apikey header", async () => {
    vi.stubEnv(endpoint.secretEnvName, DEDICATED_SECRET);

    const response = await endpoint.handler({
      request: endpoint.request({ apikey: DEDICATED_SECRET }),
    });

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ["x-api-key", { "x-api-key": DEDICATED_SECRET }],
    ["Bearer", { Authorization: `Bearer ${DEDICATED_SECRET}` }],
  ])("succeeds with the correct dedicated secret via %s", async (_label, headers) => {
    vi.stubEnv(endpoint.secretEnvName, DEDICATED_SECRET);

    const response = await endpoint.handler({ request: endpoint.request(headers) });

    expect(response.status).toBe(200);
  });
});
