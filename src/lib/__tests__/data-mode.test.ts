import { describe, expect, it } from "vitest";
import { resolveDemoDataMode } from "../data-mode";

describe("customer versus demo data", () => {
  it("does not turn missing configuration or unknown flags into demo data", () => {
    for (const mode of [undefined, "", "customer", "preview", "true", "DEMO"]) {
      expect(resolveDemoDataMode(mode, false)).toBe(false);
    }
  });

  it("allows explicit offline demo but never mixes demo with a configured customer database", () => {
    expect(resolveDemoDataMode("demo", false)).toBe(true);
    expect(resolveDemoDataMode("demo", true)).toBe(false);
  });
});
