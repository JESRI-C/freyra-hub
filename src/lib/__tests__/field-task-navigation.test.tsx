import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  search: {} as { project?: string; round?: string; task?: string },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => state.search }),
}));
vi.mock("@/components/project/FieldOfflineWorkspace", () => ({
  FieldOfflineWorkspace: () => null,
}));
import { Route } from "@/routes/felt";

const project = "22222222-2222-4222-8222-222222222222";
const task = "a3333333-3333-4333-8333-333333333333";
describe("field task deep links", () => {
  it("accepts only a valid task with an explicit valid project", () => {
    const validate = Route.options.validateSearch as (raw: Record<string, unknown>) => {
      project?: string;
      round?: string;
      task?: string;
    };
    expect(validate({ project, task: task.toUpperCase() })).toEqual({ project, task });
    const legacy = "a1b2c3d4-5678-abcd-0123-456789abcdef";
    expect(validate({ project, task: legacy })).toEqual({ project, task: legacy });
    expect(validate({ task })).toEqual({});
    expect(validate({ project, task: "not-a-task" })).toEqual({ project });
    expect(validate({ project: "not-a-project", task })).toEqual({});
  });
  it("passes the exact task and round to a scope-keyed offline workspace", () => {
    state.search = { project, task, round: "round" };
    const Page = Route.options.component as () => ReactElement;
    const page = Page();
    expect(page.props).toEqual({
      requestedProject: project,
      requestedActionId: task,
      requestedRound: "round",
    });
    expect(page.key).toBe(`${project}:round:${task}`);
  });
});
