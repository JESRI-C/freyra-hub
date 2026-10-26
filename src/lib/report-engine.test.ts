import { expect, it } from "vitest";
import { generateProjectReportPreview } from "./report-engine";
import {
  SEED_PROJECTS,
  SEED_SITES,
  SEED_DATA_SOURCES,
  SEED_INDICATORS,
} from "@/data/platform-seed";

it("does not turn a populated project or old readiness indicator into verified report readiness", () => {
  const preview = generateProjectReportPreview({
    project: SEED_PROJECTS[0],
    sites: SEED_SITES,
    dataSources: SEED_DATA_SOURCES,
    indicators: SEED_INDICATORS,
    observations: [],
    actions: [],
    auditEvents: [],
    evidenceFiles: [],
  });
  expect(preview.readinessScore).toBeNull();
});
