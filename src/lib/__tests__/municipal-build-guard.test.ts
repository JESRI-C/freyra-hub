import { describe, expect, it } from "vitest";
import {
  municipalBuildMetadata,
  municipalDemoProblems,
} from "../../../scripts/municipal-build-metadata.mjs";

describe("municipal delivery build guard", () => {
  const enabled = { VITE_DEMO_MODE: "true" };
  it("requires the exact string compiled by the application", () => {
    for (const value of [undefined, "false", "TRUE", true, "demo"])
      expect(municipalDemoProblems({ VITE_DEMO_MODE: value })).not.toEqual([]);
    expect(municipalDemoProblems(enabled)).toEqual([]);
  });
  it("records the actual define override instead of assuming the environment won", () => {
    const metadata = municipalBuildMetadata({
      mode: "staging",
      env: enabled,
      define: { "import.meta.env.VITE_DEMO_MODE": '"false"' },
    });
    expect(metadata.municipalDemo).toBe(false);
    expect(municipalDemoProblems(enabled, metadata)).not.toEqual([]);
  });
  it("accepts staging compiled with the municipal flag and emits no other environment values", () => {
    const metadata = municipalBuildMetadata({
      mode: "staging",
      env: { ...enabled, SERVER_ONLY_FIXTURE: "must-not-be-emitted" },
      define: { "import.meta.env.VITE_DEMO_MODE": '"true"' },
    });
    expect(metadata).toEqual({
      schema: "freyra.build/v1",
      viteMode: "staging",
      municipalDemo: true,
    });
    expect(municipalDemoProblems(enabled, metadata)).toEqual([]);
  });
  it("rejects an old build even if the environment was enabled after compilation", () => {
    const old = municipalBuildMetadata({ mode: "staging", env: { VITE_DEMO_MODE: "false" } });
    expect(municipalDemoProblems(enabled, old)).not.toEqual([]);
  });
  it("rejects production, missing and malformed build metadata", () => {
    const production = municipalBuildMetadata({ mode: "production", env: enabled });
    for (const metadata of [
      production,
      null,
      {},
      { schema: "freyra.build/v1", municipalDemo: true },
    ])
      expect(municipalDemoProblems(enabled, metadata)).not.toEqual([]);
  });
  it("does not mistake a boolean define for the required string true", () => {
    const metadata = municipalBuildMetadata({
      mode: "staging",
      env: enabled,
      define: { "import.meta.env.VITE_DEMO_MODE": true },
    });
    expect(metadata.municipalDemo).toBe(false);
  });
});
