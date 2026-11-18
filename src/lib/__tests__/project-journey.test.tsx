// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROJECT_JOURNEY, projectJourneySearch } from "../project-journey";
import { resolveProjectView, PROJECT_AREAS } from "../project-navigation";
import { ProjectJourneyOverview } from "@/components/project/ProjectJourneyOverview";

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});
async function mount(description: string | null, editable = true) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const choose = vi.fn(),
    edit = vi.fn(),
    openReviewQueue = vi.fn();
  await act(async () =>
    root.render(
      <ProjectJourneyOverview
        description={description}
        onChoose={choose}
        onEditPurpose={editable ? edit : undefined}
        onOpenReviewQueue={openReviewQueue}
      />,
    ),
  );
  return {
    host,
    choose,
    edit,
    openReviewQueue,
    click: async (name: string) => {
      const button = [...host.querySelectorAll("button")].find(
        (node) => node.textContent?.trim() === name,
      );
      expect(button, name).toBeTruthy();
      await act(async () => button!.click());
    },
  };
}

describe("project leader journey using existing workspaces", () => {
  it("offers a review queue directly from the project overview", async () => {
    const overview = await mount("Pleje af engen");
    await overview.click("Se afleveringer der kræver handling");
    expect(overview.openReviewQueue).toHaveBeenCalledOnce();
  });

  it("opens the project overview by default rather than image intake", () => {
    expect(projectJourneySearch()).toEqual({ tab: "overblik" });
    for (const step of PROJECT_JOURNEY) {
      expect(resolveProjectView(projectJourneySearch(step.id))).toEqual(step.view);
      expect(
        PROJECT_AREAS.some((area) =>
          area.destinations.some(
            (destination) =>
              destination.view.kind === step.view.kind && destination.view.id === step.view.id,
          ),
        ),
      ).toBe(true);
    }
  });
  it("keeps task and round identity while clearing an unrelated previous editor", () => {
    const context = {
      task: "exact-task",
      round: "exact-round",
      tab: "handlinger",
      work: "field" as const,
    };
    expect(projectJourneySearch("execution", context)).toEqual({
      task: "exact-task",
      round: "exact-round",
      tab: "handlinger",
      work: "execution",
    });
    expect(projectJourneySearch("assessment", context)).toEqual({
      task: "exact-task",
      round: "exact-round",
      step: "sammenligning",
    });
    expect(projectJourneySearch("plan", context).work).toBe("plan");
    expect(projectJourneySearch("submission", context)).toEqual({
      task: "exact-task",
      round: "exact-round",
      tab: "handlinger",
      work: "submission",
    });
    expect(projectJourneySearch("submission", { taskList: "calendar" })).toEqual({
      tab: "handlinger",
      work: "submission",
      taskList: "tasks",
    });
  });
  it("starts an empty project with its purpose and preserves an existing description verbatim", async () => {
    const empty = await mount(null);
    await empty.click("Begynd med formålet");
    expect(empty.edit).toHaveBeenCalledOnce();
    expect(empty.choose).not.toHaveBeenCalled();
    const existing = await mount("Problem: tilgroning.\nMål: lysåben eng.");
    expect(existing.host.textContent).toContain("Problem: tilgroning.\nMål: lysåben eng.");
    await existing.click("Planlæg indsatsen");
    expect(existing.choose).toHaveBeenLastCalledWith("plan");
    await existing.click("Åbn udført arbejde");
    expect(existing.choose).toHaveBeenLastCalledWith("execution");
    await existing.click("Åbn opgavens aflevering");
    expect(existing.choose).toHaveBeenLastCalledWith("submission");
  });
  it("does not offer editing to a reader or claim completion from a description", async () => {
    const reader = await mount("Eksisterende projektbeskrivelse", false);
    expect(reader.host.textContent).not.toContain("Redigér problem og mål");
    expect(reader.host.textContent).not.toContain("godkendt");
    expect(
      [...reader.host.querySelectorAll("button")].some((node) =>
        node.textContent?.includes("Beskriv problem og mål"),
      ),
    ).toBe(false);
    expect(reader.edit).not.toHaveBeenCalled();
  });
});
