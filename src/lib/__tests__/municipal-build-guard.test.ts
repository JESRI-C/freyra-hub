import { describe, it, expect } from "vitest";
import {
  municipalBuildMetadata,
  municipalDemoProblems,
} from "../../../scripts/municipal-build-metadata.mjs";
describe("release build boundary", () => {
  it("accepts only customer data without a demo environment switch", () => {
    const metadata = municipalBuildMetadata({ mode: "staging", env: {} });
    expect(metadata).toMatchObject({
      municipalDemo: false,
      customerDataOnly: true,
      release: "1.0",
    });
    expect(municipalDemoProblems({}, metadata)).toEqual([]);
    expect(municipalDemoProblems({ VITE_DEMO_MODE: "true" }, metadata)).not.toEqual([]);
    expect(municipalDemoProblems({ VITE_APP_DATA_MODE: "demo" }, metadata)).not.toEqual([]);
  });
  it("rejects stale or foreign build metadata", () => {
    for (const metadata of [
      null,
      {},
      { schema: "freyra.build/v1", viteMode: "staging", municipalDemo: true },
      municipalBuildMetadata({ mode: "production", env: {} }),
    ])
      expect(municipalDemoProblems({}, metadata)).not.toEqual([]);
  });
});
