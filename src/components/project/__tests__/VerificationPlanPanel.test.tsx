import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import type {
  VerificationPlanVersion,
  VerificationPlanSummary,
} from "@/services/baseline/verification-plan-persistence";

const state = vi.hoisted(() => ({
  plan: null as VerificationPlanVersion | null,
  summaries: [] as VerificationPlanSummary[],
  listError: null as Error | null,
  readError: null as Error | null,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/survey-round.functions", () => ({
  saveSurveyRound: vi.fn(),
  getSurveyRound: vi.fn(),
  listSurveyRounds: vi.fn(),
  getSurveyRoundAccess: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/verification-plan.functions", () => ({
  saveVerificationPlan: vi.fn(),
  getVerificationPlan: vi.fn(),
  listVerificationPlans: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useMutation: () => ({ error: null, isPending: false, mutate: vi.fn() }),
  useInfiniteQuery: () => ({
    data: { pages: [{ items: state.summaries, nextBeforeVersion: null }] },
    error: state.listError,
    isPending: false,
    hasNextPage: false,
  }),
  useQuery: () => ({ data: state.plan, error: state.readError, isFetching: false }),
}));
import { VerificationPlanPanel } from "../VerificationPlanPanel";
import { makeSnapshot } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { makePlanRow } from "@/services/baseline/__tests__/verification-plan.fixtures";
import { verificationPlanVersionFromRow } from "@/services/baseline/verification-plan-persistence";

let snapshot: PublicBaselineSnapshot;
beforeEach(async () => {
  snapshot = await makeSnapshot();
  state.plan = await verificationPlanVersionFromRow(await makePlanRow(snapshot), snapshot);
  state.summaries = [state.plan];
  state.listError = null;
  state.readError = null;
});
describe("saved verification plan review panel", () => {
  it("shows the saved question as a draft with its baseline and missing sources", () => {
    const html = renderToStaticMarkup(<VerificationPlanPanel snapshot={snapshot} />);
    expect(html).toContain(state.plan!.manifest.questions[0].title);
    expect(html).toContain("Gemt udkast, version 1");
    expect(html).toContain("Registreringsrunder");
    expect(html).toContain(`Datagrundlag, version ${snapshot.version}`);
    expect(html).toContain(`Plan, version ${state.plan!.version}`);
    expect(html).toContain("Faglig godkendelse afventer");
    expect(html).toContain("endnu ikke en godkendt flyveplan");
    expect(html).toContain(state.plan!.manifest.baselineDataGaps[0].provider);
  });
  it("hides a cached plan and version list after the list is denied", () => {
    const cachedTitle = state.plan!.manifest.questions[0].title;
    state.listError = new Error("Planadgang er tilbagekaldt");
    const html = renderToStaticMarkup(<VerificationPlanPanel snapshot={snapshot} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Planadgang er tilbagekaldt");
    expect(html).not.toContain(cachedTitle);
    expect(html).not.toContain("Gemt udkast, version");
    expect(html).not.toContain("<option");
  });
  it("hides a cached manifest when its saved version cannot be reloaded", () => {
    const cachedTitle = state.plan!.manifest.questions[0].title;
    state.readError = new Error("Denne gemte plan kan ikke læses");
    const html = renderToStaticMarkup(<VerificationPlanPanel snapshot={snapshot} />);
    expect(html).toContain("Denne gemte plan kan ikke læses");
    expect(html).not.toContain(cachedTitle);
    expect(html).not.toContain("Gemt udkast, version");
  });
  it("keeps both saved versions selectable while displaying the latest saved draft", async () => {
    const first = state.plan!;
    const secondRow = {
      ...(await makePlanRow(snapshot, 2)),
      id: "70000000-0000-4000-8000-000000000002",
      request_id: "80000000-0000-4000-8000-000000000002",
    };
    state.plan = await verificationPlanVersionFromRow(secondRow, snapshot);
    state.summaries = [state.plan, first];
    const html = renderToStaticMarkup(<VerificationPlanPanel snapshot={snapshot} />);
    expect(html).toContain("Version 2");
    expect(html).toContain("Version 1");
    expect(html).toContain("Gemt udkast, version 2");
    expect(html).toContain(first.manifest.questions[0].title);
  });
});
