import { beforeEach, expect, it, vi } from "vitest";
import { bridgeObservationInsert } from "@/lib/bridge-observation";
import { listBridgeObservations, saveBridgeObservation } from "../bridge-observation-service";

const mock = vi.hoisted(() => ({ create: vi.fn(), client: vi.fn() }));
vi.mock("../monitoring/observations-service", () => ({ createObservation: mock.create }));
vi.mock("@/lib/supabase/client", () => ({ createActorBoundSupabaseClient: mock.client }));
const input = () =>
  bridgeObservationInsert(
    {
      objectId: "BR-1",
      structureType: "culvert",
      latitude: 55.25,
      longitude: 9.5,
      accuracyM: 0,
      materials: "Beton",
      dimensions: "50 cm",
      conditions: "Synlig erosion",
      photoSourceIds: [],
    },
    "project",
    "actor",
    "observation",
  );

beforeEach(() => vi.resetAllMocks());

it("loads all bridge rows under the actor and project, including the second page", async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i) }));
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(async (start: number, end: number) => ({
      data: rows.slice(start, end + 1),
      error: null,
    })),
  };
  const from = vi.fn().mockReturnValue(query);
  mock.client.mockReturnValue({ from });
  expect(await listBridgeObservations("project", "actor")).toEqual(rows);
  expect(mock.client).toHaveBeenCalledWith("actor");
  expect(from.mock.calls).toEqual([["field_observations"], ["field_observations"]]);
  expect(query.eq.mock.calls).toEqual([
    ["project_id", "project"],
    ["observation_type", "bridge_visual"],
    ["project_id", "project"],
    ["observation_type", "bridge_visual"],
  ]);
  expect(query.order.mock.calls).toEqual([["id"], ["id"]]);
  expect(query.range.mock.calls).toEqual([
    [0, 499],
    [500, 999],
  ]);
});

it("confirms the original row after a response is lost and a retry encounters the existing ID", async () => {
  const observation = input();
  const stored = {
    ...observation,
    observed_at: "2026-11-17T10:00:00Z",
    metadata: Object.fromEntries(Object.entries(observation.metadata).reverse()),
  };
  mock.create
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockRejectedValueOnce({ code: "23505" });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: stored, error: null }),
  };
  const from = vi.fn().mockReturnValue(query);
  mock.client.mockReturnValue({ from });
  await expect(saveBridgeObservation(observation, "actor")).rejects.toThrow("Response lost");
  expect(mock.client).not.toHaveBeenCalled();
  expect(await saveBridgeObservation(observation, "actor")).toEqual(stored);
  expect(mock.client).toHaveBeenCalledWith("actor");
  expect(query.eq.mock.calls).toEqual([
    ["id", "observation"],
    ["project_id", "project"],
    ["observer_id", "actor"],
    ["observation_type", "bridge_visual"],
  ]);
  expect(mock.create).toHaveBeenNthCalledWith(2, observation, "actor");
});

it("rejects changed content, inaccessible rows and a different actor on retries", async () => {
  const observation = input();
  mock.create.mockRejectedValue({ code: "23505" });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValueOnce({ data: { ...observation, notes: "Ændret" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null }),
  };
  mock.client.mockReturnValue({ from: () => query });
  await expect(saveBridgeObservation(observation, "actor")).rejects.toThrow("andre oplysninger");
  await expect(saveBridgeObservation(observation, "actor")).rejects.toThrow("kunne ikke bekræftes");
  await expect(saveBridgeObservation(observation, "different")).rejects.toThrow("anden bruger");
  expect(mock.create).toHaveBeenCalledTimes(2);
});
