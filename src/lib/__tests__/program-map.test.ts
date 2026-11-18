import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PROGRAM_FEATURES,
  PROGRAM_PAGES,
  SKYHOST_JOB_AREAS,
  programFeatureLink,
  programFeatureMatches,
  programPageGuide,
  projectToolGuide,
} from "../program-map";
import { PROJECT_AREAS } from "../project-navigation";
import { WORK_ORDER_PARTS, isWorkOrderView } from "../work-order-navigation";

function walk(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
describe("program map destinations", () => {
  it("finds the real workspaces using Skyhost terms without advertising a planned feature as active", () => {
    const field = PROGRAM_FEATURES.find((f) => f.id === "work:field")!;
    const submission = PROGRAM_FEATURES.find((f) => f.id === "work:submission")!;
    expect(programFeatureMatches(field, "job Geotag")).toBe(true);
    expect(programFeatureMatches(submission, "tjeklister")).toBe(true);
    expect(programFeatureMatches(field, "booking")).toBe(false);
  });
  it("covers every existing user-facing app route, including nested index aliases", () => {
    const routes = walk("src/routes").flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const route = source.match(/createFileRoute\(["']([^"']+)["']\)/)?.[1];
      return route &&
        (route.startsWith("/app/") || ["/felt", "/opgaver"].includes(route)) &&
        route !== "/app/program"
        ? [route]
        : [];
    });
    expect(routes.length).toBeGreaterThan(60);
    expect(routes.filter((route) => !programPageGuide(route))).toEqual([]);
  });
  it("keeps all existing project destinations explained without relying on their display name", () => {
    for (const area of PROJECT_AREAS)
      for (const d of area.destinations) {
        const guide = projectToolGuide(d.view);
        expect(guide.areaId).toBe(area.id);
        expect(guide.purpose.length).toBeGreaterThan(15);
      }
    expect(new Set(PROGRAM_FEATURES.map((f) => f.id)).size).toBe(PROGRAM_FEATURES.length);
    for (const area of SKYHOST_JOB_AREAS)
      for (const id of area.featureIds)
        expect(PROGRAM_FEATURES.find((f) => f.id === id)).toBeDefined();
  });
  it("does not inherit a neighboring or parent page's guide for an unknown URL", () => {
    expect(programPageGuide("/app/unknown")).toBeUndefined();
    expect(programPageGuide("/app/projects/project/unknown")).toBeUndefined();
    expect(programPageGuide("/app/projects/geometry/project")?.title).toBe("Projektområde");
    expect(programPageGuide("/app/settings/")?.id).toBe("/app/settings");
  });
  it("opens all five task parts on the exact task and round without retaining a conflicting step", () => {
    for (const part of WORK_ORDER_PARTS) {
      expect(isWorkOrderView(part.id)).toBe(true);
      const feature = PROGRAM_FEATURES.find((f) => f.id === `work:${part.id}`)!;
      expect(
        programFeatureLink(feature, "project-a", {
          task: "task-a",
          round: "round-a",
          step: "rapport",
        }),
      ).toEqual({
        to: "/app/projects/project-a",
        search: { task: "task-a", round: "round-a", tab: "handlinger", work: part.id },
      });
    }
    expect(isWorkOrderView("approve")).toBe(false);
  });
  it("requires a selection instead of using a nature-project ID for another domain", () => {
    for (const route of PROGRAM_PAGES.filter(
      (f) => f.destination?.kind === "route" && f.destination.selectAt,
    )) {
      const link = programFeatureLink(route, "nature-project");
      expect(link?.to).not.toContain("nature-project");
      expect(link?.to).not.toContain("$");
    }
    const task = PROGRAM_FEATURES.find((f) => f.id === "work:submission")!;
    expect(programFeatureLink(task)).toEqual({ to: "/app/projects", search: {} });
  });
  it("opens planning tools on the project list without retaining a selected task", () => {
    for (const view of ["calendar", "schedule"] as const) {
      const feature = PROGRAM_FEATURES.find((item) => item.id === "work:" + view)!;
      expect(feature.status).toBe("existing");
      expect(
        programFeatureLink(feature, "project-a", {
          task: "task-a",
          work: "submission",
          step: "rapport",
          round: "round-a",
        }),
      ).toEqual({
        to: "/app/projects/project-a",
        search: { tab: "handlinger", taskList: view, round: "round-a" },
      });
    }
    expect(PROGRAM_FEATURES.find((item) => item.id === "planned:capacity")?.status).toBe("planned");
  });
  it("never turns a planned capability into an active link", () => {
    for (const feature of PROGRAM_FEATURES.filter((f) => f.status === "planned"))
      expect(programFeatureLink(feature, "project-a")).toBeUndefined();
  });
});
