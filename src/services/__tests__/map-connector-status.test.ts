import { describe, expect, it } from "vitest";
import { buildProjectEnvironmentalContext } from "../connector-service";
import { projectMapConnectorStatus } from "../map-connector-status";
import type { ProjectEnvironmentalContext } from "@/lib/supabase/types";

describe("project map source evidence", () => {
  const input = (context?: ProjectEnvironmentalContext) => ({
    projectId: "case",
    context,
    fetching: false,
    failed: false,
  });
  it("does not claim live access merely because a provider exists", () => {
    const statuses = projectMapConnectorStatus(input());
    expect(statuses).toHaveLength(4);
    expect(statuses.every((source) => source.status === "unverified")).toBe(true);
    expect(statuses.find((source) => source.slug === "dataforsyningen")?.note).toContain(
      "ikke hentet",
    );
  });
  it("uses the real environmental builder without inventing rainfall or satellite data", async () => {
    const context = await buildProjectEnvironmentalContext("case", "Demo", "Demo", "Demo");
    const statuses = projectMapConnectorStatus(input(context));
    expect(statuses.find((source) => source.slug === "dmi")).toMatchObject({
      status: "unverified",
      note: context.rainfallContext?.summary,
    });
    expect(statuses.find((source) => source.slug === "sentinel")?.status).toBe("unverified");
  });
  it("shows source response time and a successful empty overlap as retrieved evidence", async () => {
    const context = await buildProjectEnvironmentalContext("case", "Demo", "Demo", "Demo");
    context.natureContext = {
      ...context.natureContext!,
      status: "success",
      fetchedAt: "2026-11-18T00:00:00Z",
      data: { protected_nature_ha: 0 },
      summary: "Officiel screening: 0 ha.",
    };
    expect(
      projectMapConnectorStatus(input(context)).find((source) => source.slug === "miljodata"),
    ).toMatchObject({ status: "retrieved", lastChecked: "2026-11-18T00:00:00Z" });
  });
  it("rejects context and individual results from another case", async () => {
    const context = await buildProjectEnvironmentalContext("other", "Demo", "Demo", "Demo");
    context.natureContext = { ...context.natureContext!, status: "success", data: { value: 1 } };
    expect(
      projectMapConnectorStatus(input(context)).every((source) => source.status === "unverified"),
    ).toBe(true);
    context.projectId = "case";
    expect(
      projectMapConnectorStatus(input(context)).find((source) => source.slug === "miljodata")
        ?.status,
    ).toBe("unverified");
  });
  it.each(["fetching", "failed"] as const)("hides cached success when %s", async (state) => {
    const context = await buildProjectEnvironmentalContext("case", "Demo", "Demo", "Demo");
    context.natureContext = { ...context.natureContext!, status: "success", data: { value: 1 } };
    const source = projectMapConnectorStatus({ ...input(context), [state]: true }).find(
      (source) => source.slug === "miljodata",
    );
    expect(source?.status).toBe(state === "fetching" ? "checking" : "unavailable");
    expect(source?.lastChecked).toBeUndefined();
  });
  it("keeps provider failure and preview separate from measured results", async () => {
    const context = await buildProjectEnvironmentalContext("case", "Demo", "Demo", "Demo");
    context.natureContext!.status = "error";
    context.satelliteContext!.status = "fallback";
    const statuses = projectMapConnectorStatus(input(context));
    expect(statuses.find((source) => source.slug === "miljodata")?.status).toBe("unavailable");
    expect(statuses.find((source) => source.slug === "sentinel")?.status).toBe("preview");
  });
  it.each([
    { data: {}, fetchedAt: "2026-11-18T00:00:00Z" },
    { data: { value: 1 }, fetchedAt: "invalid" },
  ])("rejects an empty response or invalid receipt date", async ({ data, fetchedAt }) => {
    const context = await buildProjectEnvironmentalContext("case", "Demo", "Demo", "Demo");
    context.natureContext = {
      ...context.natureContext!,
      status: "success",
      data,
      fetchedAt,
    };
    expect(
      projectMapConnectorStatus(input(context)).find((source) => source.slug === "miljodata")
        ?.status,
    ).toBe("unverified");
  });
});
