// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { NatureSurveyPanel } from "../NatureSurveyPanel";
import type { Project } from "@/lib/supabase/types";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/services/nature-survey-service", () => ({
  NATURE_SURVEY_OBSERVATION: "nature_survey",
  saveNatureSurveyObservation: mocks.save,
  saveNatureSurveyArea: vi.fn(),
  listNatureSurveyAreas: async () => [
    {
      id: "5516fcce-6840-4413-a622-779a5db697f7",
      project_id: "project",
      name: "Eng vest",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [9, 55],
            [9.01, 55],
            [9, 55.01],
            [9, 55],
          ],
        ],
      },
      area_hectares: 1,
      created_at: "2026-11-17T12:00:00Z",
    },
  ],
}));
vi.mock("@/services/monitoring/observations-service", () => ({ listObservations: async () => [] }));
vi.mock("@/components/maps/MapEditorMap", () => ({
  MapEditorMap: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="survey-map" data-readonly={String(readOnly)} />
  ),
}));

it("lets a field contributor record an observation while the survey map stays read-only", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient();
  const project = { id: "project", name: "Sag", geometry_polygon: null } as Project;
  const render = (canEdit: boolean) =>
    root.render(
      <QueryClientProvider client={cache}>
        <NatureSurveyPanel
          project={project}
          actorId="field-actor"
          canEdit={canEdit}
          canConfigureAreas={false}
        />
      </QueryClientProvider>,
    );
  mocks.save.mockResolvedValue({});
  try {
    await act(async () => {
      render(true);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await act(async () => {
      await vi.waitFor(() => expect(host.querySelector('input[name="label"]')).not.toBeNull());
    });
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Åbn naturkort")!
        .click(),
    );
    expect(host.querySelector('[data-testid="survey-map"]')?.getAttribute("data-readonly")).toBe(
      "true",
    );
    expect(host.querySelector('input[name="name"]')).toBeNull();
    host.querySelector<HTMLInputElement>('input[name="label"]')!.value = "Star";
    host.querySelector<HTMLInputElement>('input[name="method"]')!.value = "Visuel";
    host.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')!.value =
      "Ingen blomst synlig";
    host.querySelector<HTMLSelectElement>('select[name="determination"]')!.value = "uncertain";
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(mocks.save).toHaveBeenCalledWith(
      "project",
      "field-actor",
      expect.objectContaining({
        label: "Star",
        determination: "uncertain",
        zoneId: "5516fcce-6840-4413-a622-779a5db697f7",
      }),
    );
    await act(async () => render(false));
    expect(host.querySelector('button[type="submit"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
    vi.unstubAllGlobals();
  }
});
