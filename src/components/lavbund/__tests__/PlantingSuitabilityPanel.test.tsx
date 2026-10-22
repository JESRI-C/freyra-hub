import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import type { PlantingResult } from "@/services/planting/planting-suitability";

const state = vi.hoisted(() => ({
  actor: "owner" as string | null,
  data: undefined as { snapshot: PublicBaselineSnapshot; result: PlantingResult } | undefined,
  error: false,
  options: undefined as { queryKey: unknown[]; enabled: boolean } | undefined,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: state.actor ? { id: state.actor } : null }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/public-baseline.functions", () => ({
  getProjectBaseline: vi.fn(),
  listProjectBaselines: vi.fn(),
}));
vi.mock("@/lib/survey-round.functions", () => ({ getSurveyRound: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
    state.options = options;
    return {
      data: state.data,
      isError: state.error,
      isLoading: false,
      isSuccess: !state.error,
    };
  },
}));

import { PlantingSuitabilityPanel } from "../PlantingSuitabilityPanel";
import { makeSnapshot } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { buildPlantingFromBaseline } from "@/services/planting/planting-baseline";

beforeEach(async () => {
  state.actor = "owner";
  state.error = false;
  const snapshot = await makeSnapshot();
  state.data = { snapshot, result: buildPlantingFromBaseline(snapshot) };
});

describe("planting view access and source context", () => {
  it("partitions the cache by actor, project and selected investigation", () => {
    renderToStaticMarkup(<PlantingSuitabilityPanel projectId="case" selectedRoundId="round-a" />);
    expect(state.options?.queryKey).toEqual(["planting-suitability", "owner", "case", "round-a"]);
    state.actor = "reader";
    renderToStaticMarkup(<PlantingSuitabilityPanel projectId="case" selectedRoundId="round-b" />);
    expect(state.options?.queryKey).toEqual(["planting-suitability", "reader", "case", "round-b"]);
  });

  it("hides cached map and source data after a denied refetch", () => {
    state.error = true;
    const html = renderToStaticMarkup(<PlantingSuitabilityPanel projectId="case" />);
    expect(html).toContain("Beplantningsskitsen kunne ikke åbnes");
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("Delstrækninger A–E");
    expect(html).not.toContain("Kilder og hentetid");
  });

  it("disables reads and hides previously cached data after logout", () => {
    state.actor = null;
    const html = renderToStaticMarkup(<PlantingSuitabilityPanel projectId="case" />);
    expect(state.options?.enabled).toBe(false);
    expect(html).toContain("Log ind for at se");
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("Delstrækninger A–E");
  });

  it("labels the standalone map as the latest unpinned source version", () => {
    const html = renderToStaticMarkup(<PlantingSuitabilityPanel projectId="case" />);
    expect(html).toContain("Seneste gemte kildeversion, uafhængigt af en valgt undersøgelse");
    expect(state.options?.queryKey.at(-1)).toBe("latest");
  });

  it("labels an investigation view as its saved source version", () => {
    const html = renderToStaticMarkup(
      <PlantingSuitabilityPanel projectId="case" selectedRoundId="round-a" />,
    );
    expect(html).toContain("Den valgte undersøgelses datagrundlag");
    expect(html).not.toContain("Seneste gemte kildeversion");
  });
});
