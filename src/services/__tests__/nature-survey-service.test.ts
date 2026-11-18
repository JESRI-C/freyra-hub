import { beforeEach, expect, it, vi } from "vitest";
import {
  listNatureSurveyAreas,
  saveNatureSurveyArea,
  saveNatureSurveyObservation,
} from "../nature-survey-service";

const mock = vi.hoisted(() => ({
  client: vi.fn(),
  from: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createActorBoundSupabaseClient: mock.client }));
vi.mock("../monitoring/observations-service", () => ({ createObservation: mock.create }));

const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [9, 55],
      [9.01, 55],
      [9.01, 55.01],
      [9, 55],
    ],
  ],
};
const zoneId = "499a5e29-183a-4e13-8999-daa0c4ee2d49";

beforeEach(() => {
  vi.resetAllMocks();
  mock.client.mockReturnValue({ from: mock.from });
});

it("validates drawn geometry and writes an actor-bound survey zone with its method", async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  mock.from.mockReturnValue({ insert });
  const input = {
    name: " Eng 1 ",
    method: "Visuel gennemgang af den tegnede zone",
    geometry: polygon,
    hectares: 2,
  };
  await expect(saveNatureSurveyArea("p1", "a1", { ...input, geometry: {} })).rejects.toThrow(
    "polygon",
  );
  expect(insert).not.toHaveBeenCalled();
  await saveNatureSurveyArea("p1", "a1", input);
  expect(mock.client).toHaveBeenCalledWith("a1");
  expect(mock.from).toHaveBeenCalledWith("monitoring_zones");
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: "p1",
      created_by: "a1",
      zone_type: "nature_survey",
      geometry: polygon,
      name: "Eng 1",
      description: input.method,
    }),
  );
});

it("reads only the project's nature survey zones and surfaces read errors", async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ error: { message: "denied" } }),
  };
  mock.from.mockReturnValue(query);
  await expect(listNatureSurveyAreas("p1", "a1")).rejects.toThrow("kunne ikke indlæses");
  expect(query.eq.mock.calls).toEqual([
    ["project_id", "p1"],
    ["zone_type", "nature_survey"],
  ]);
});

it("stores the determination level without promoting a possible species to a confirmed finding", async () => {
  const input = {
    zoneId,
    kind: "species",
    label: "Star",
    method: "Visuel",
    notes: "Ingen blomst synlig",
  };
  await expect(saveNatureSurveyObservation("p1", "a1", input)).rejects.toThrow(
    "bestemmelsesniveau",
  );
  await saveNatureSurveyObservation("p1", "a1", { ...input, determination: "uncertain" });
  expect(mock.create).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: "p1",
      zone_id: zoneId,
      species_name: "Star",
      visibility: "zone_only",
      metadata: expect.objectContaining({ determination: "uncertain", method: "Visuel" }),
    }),
    "a1",
  );
});
