import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleGpsPositionPost } from "@/routes/api/public/gps-position";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

const project = "00000000-0000-4000-8000-000000000001";
const secret = "test-only-tracker-secret";
const position = {
  event_id: "00000000-0000-4000-8000-000000000002",
  device_id: "00000000-0000-4000-8000-000000000003",
  measured_at: "2026-11-17T10:00:00Z",
  latitude: 55.6,
  longitude: 9.6,
};

function post(body: string, key?: string) {
  return handleGpsPositionPost({
    request: new Request("https://tracker.example/api/public/gps-position", {
      method: "POST",
      body,
      headers: key ? { "x-api-key": key } : {},
    }),
  });
}

beforeEach(() => {
  vi.stubEnv("GPS_INGEST_API_SECRET", secret);
  vi.stubEnv("GPS_INGEST_PROJECT_ID", project);
  rpc.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

it("rejects missing credentials, injected scope, invalid coordinates and oversized requests", async () => {
  expect((await post(JSON.stringify(position))).status).toBe(401);
  expect((await post(JSON.stringify(position), "wrong")).status).toBe(401);
  expect((await post(JSON.stringify({ ...position, project_id: project }), secret)).status).toBe(
    400,
  );
  expect((await post(JSON.stringify({ ...position, latitude: 91 }), secret)).status).toBe(400);
  expect((await post(" ".repeat(4097), secret)).status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});

it("passes the server project scope and reports inserts and idempotent retries", async () => {
  rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: false });
  const first = await post(JSON.stringify(position), secret);
  expect(first.status).toBe(201);
  expect(await first.json()).toEqual({ event_id: position.event_id, inserted: true });
  expect(rpc).toHaveBeenCalledWith("ingest_gps_position", {
    p_project_id: project,
    p_device_id: position.device_id,
    p_event_id: position.event_id,
    p_measured_at: position.measured_at,
    p_latitude: position.latitude,
    p_longitude: position.longitude,
  });
  const retry = await post(JSON.stringify(position), secret);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ event_id: position.event_id, inserted: false });
});

it("reports wrong scope and conflicting events without exposing database details", async () => {
  rpc
    .mockResolvedValueOnce({ error: { code: "P0002", message: "private reason" } })
    .mockResolvedValueOnce({ error: { code: "23505", message: "private reason" } });
  const missing = await post(JSON.stringify(position), secret);
  expect(missing.status).toBe(404);
  expect(await missing.text()).not.toContain("private reason");
  const conflict = await post(JSON.stringify(position), secret);
  expect(conflict.status).toBe(409);
  expect(await conflict.text()).not.toContain("private reason");
  vi.stubEnv("GPS_INGEST_PROJECT_ID", "");
  expect((await post(JSON.stringify(position), secret)).status).toBe(503);
});
