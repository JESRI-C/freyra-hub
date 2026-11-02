import { describe, expect, it } from "vitest";
import {
  PROJECT_AREAS,
  PROJECT_TABS,
  projectViewSearch,
  resolveProjectView,
} from "../project-navigation";
import { MUNICIPAL_CORE_STEP_IDS } from "../municipal-workflow";

describe("project navigation compatibility", () => {
  it("keeps every existing workflow step reachable", () => {
    const destinations = PROJECT_AREAS.flatMap((area) => area.destinations);
    for (const step of [...MUNICIPAL_CORE_STEP_IDS, "beplantning" as const]) {
      const view = resolveProjectView({ step });
      expect(destinations.some((d) => d.view.kind === view.kind && d.view.id === view.id)).toBe(
        true,
      );
    }
  });
  it("retains a destination for every existing project tab", () => {
    const tabs = PROJECT_AREAS.flatMap((area) => area.destinations).flatMap((d) =>
      d.view.kind === "tab" ? [d.view.id] : [],
    );
    expect([...tabs].sort()).toEqual(PROJECT_TABS.map((tab) => tab.id).sort());
  });
  it("opens legacy execution and report links in the same canonical workspace", () => {
    expect(resolveProjectView({ step: "udfoerelse", task: "task", work: "execution" })).toEqual(
      resolveProjectView({ tab: "handlinger" }),
    );
    expect(resolveProjectView({ step: "rapport", round: "round" })).toEqual(
      resolveProjectView({ tab: "rapporter" }),
    );
    expect(resolveProjectView({ step: "baseline", round: "round" })).toEqual({
      kind: "step",
      id: "baseline",
    });
  });
  it("keeps explicit legacy utility links usable even with a retained step", () => {
    expect(resolveProjectView({ tab: "audit", step: "billeder" })).toEqual({
      kind: "tab",
      id: "audit",
    });
    expect(resolveProjectView({ tab: "roller", step: "rapport" })).toEqual({
      kind: "tab",
      id: "roller",
    });
  });
  it("changes only the view and preserves the exact task, round and work context", () => {
    const context = { round: "round", task: "task", work: "execution" as const };
    expect(
      projectViewSearch({ ...context, step: "udfoerelse" }, { kind: "tab", id: "rapporter" }),
    ).toEqual({ ...context, tab: "rapporter" });
    expect(
      projectViewSearch({ ...context, tab: "audit" }, { kind: "step", id: "sammenligning" }),
    ).toEqual({ ...context, step: "sammenligning" });
  });
});
