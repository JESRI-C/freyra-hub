import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcileUploadIntentOrphans: vi.fn(),
  supabaseAdmin: { rpc: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));

vi.mock("@/services/monitoring/upload-orphan-reconciliation.server", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/services/monitoring/upload-orphan-reconciliation.server")
    >();
  return { ...original, reconcileUploadIntentOrphans: mocks.reconcileUploadIntentOrphans };
});

import { handleMonitoringReconcileUploadsPost } from "@/routes/api/public/monitoring.reconcile-uploads";

const DEDICATED_SECRET = "dedicated-monitoring-cron-secret";

function request(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("https://example.test/api/public/monitoring/reconcile-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MONITORING_CRON_API_SECRET", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
  mocks.reconcileUploadIntentOrphans.mockResolvedValue({
    claimed: 2,
    deleted: 1,
    failed: 1,
    items: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("monitoring upload reconciliation route", () => {
  it("fails closed before loading cleanup work when its secret is missing", async () => {
    const response = await handleMonitoringReconcileUploadsPost({
      request: request({ "x-api-key": DEDICATED_SECRET }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Server secret not configured" });
    expect(mocks.reconcileUploadIntentOrphans).not.toHaveBeenCalled();
  });

  it("rejects an incorrect or Supabase credential", async () => {
    vi.stubEnv("MONITORING_CRON_API_SECRET", DEDICATED_SECRET);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_service-role-value");

    const wrong = await handleMonitoringReconcileUploadsPost({
      request: request({ Authorization: "Bearer wrong-secret" }),
    });
    const supabaseCredential = await handleMonitoringReconcileUploadsPost({
      request: request({ "x-api-key": "sb_secret_service-role-value" }),
    });

    expect(wrong.status).toBe(401);
    expect(supabaseCredential.status).toBe(401);
    expect(mocks.reconcileUploadIntentOrphans).not.toHaveBeenCalled();
  });

  it("runs a bounded batch with the dedicated secret and returns no-store output", async () => {
    vi.stubEnv("MONITORING_CRON_API_SECRET", DEDICATED_SECRET);

    const response = await handleMonitoringReconcileUploadsPost({
      request: request(
        { Authorization: `Bearer ${DEDICATED_SECRET}` },
        { limit: 12, lease_seconds: 90 },
      ),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.reconcileUploadIntentOrphans).toHaveBeenCalledWith({
      client: mocks.supabaseAdmin,
      limit: 12,
      leaseSeconds: 90,
    });
    await expect(response.json()).resolves.toMatchObject({ claimed: 2, deleted: 1, failed: 1 });
  });

  it("does not expose internal or credential-bearing reconciliation errors", async () => {
    vi.stubEnv("MONITORING_CRON_API_SECRET", DEDICATED_SECRET);
    mocks.reconcileUploadIntentOrphans.mockRejectedValue(
      new Error("Storage failed with Bearer production-secret"),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleMonitoringReconcileUploadsPost({
      request: request({ "x-api-key": DEDICATED_SECRET }),
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toContain("Upload orphan reconciliation failed");
    expect(body).not.toContain("production-secret");
    expect(consoleError).toHaveBeenCalledWith(
      "[monitoring/reconcile-uploads] reconciliation failed",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("production-secret");
  });
});
