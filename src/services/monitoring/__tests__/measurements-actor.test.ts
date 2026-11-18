import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ bound: vi.fn(), canonical: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { from: mocks.canonical },
  createActorBoundSupabaseClient: mocks.bound,
}));
import { listMeasurements } from "../measurements-service";
it("uses an actor-bound client for the exact device and latest-reading limit", async () => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };
  const from = vi.fn(() => query);
  mocks.bound.mockReturnValue({ from });
  expect(await listMeasurements("device", { actorId: "actor", limit: 1 })).toEqual([]);
  expect(mocks.canonical).not.toHaveBeenCalled();
  expect(mocks.bound).toHaveBeenCalledWith("actor");
  expect(from).toHaveBeenCalledWith("device_measurements");
  expect(query.eq).toHaveBeenCalledWith("device_id", "device");
  expect(query.limit).toHaveBeenCalledWith(1);
});
