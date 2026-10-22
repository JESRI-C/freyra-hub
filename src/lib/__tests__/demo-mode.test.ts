import { describe, expect, it } from "vitest";
import { isMunicipalRoute, MUNICIPAL_PROJECT_TABS } from "../demo-mode";

describe("kommunens arbejdsflade", () => {
  it.each([
    "/app/projects",
    "/app/projects/bykaer",
    "/app/reports",
    "/app/lavbund/id/kort",
    "/app/lavbund/id/revisionsspor",
  ])("viser %s", (path) => {
    expect(isMunicipalRoute(path)).toBe(true);
  });
  it.each([
    "/app/credits",
    "/app/impact",
    "/app/public-impact",
    "/app/decisions",
    "/app/connect/sensors",
    "/app/system-test",
    "/app/lavbund/id/klima",
    "/app/projects-extra",
  ])("skjuler også direkte navigation til %s", (path) => {
    expect(isMunicipalRoute(path)).toBe(false);
  });
  it("viser kun de leverbare projektfaner", () => {
    expect([...MUNICIPAL_PROJECT_TABS]).toEqual([
      "arbejde",
      "rapporter",
      "grundlag",
      "audit",
      "roller",
    ]);
  });
});
