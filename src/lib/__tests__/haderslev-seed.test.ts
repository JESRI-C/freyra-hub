import { describe, expect, it } from "vitest";
// CLI shares the exact validation used before any remote writes.
import {
  stableUuid,
  validateSeedMetadata,
  assertStagingTarget,
} from "../../../scripts/haderslev-seed-lib.mjs";

const metadata = {
  Make: "DJI",
  Model: "FC3411",
  DateTimeOriginal: "2026:08:24 12:00:00",
  latitude: 55,
  longitude: 9,
  ExifImageWidth: 5472,
  ExifImageHeight: 3648,
};
describe("Haderslev originalseed", () => {
  it("uses stable, scoped identifiers", () => {
    expect(stableUuid("org:A")).toBe(stableUuid("org:A"));
    expect(stableUuid("org:A")).not.toBe(stableUuid("org:B"));
  });
  it("requires original pixel dimensions, flight date, camera and GPS", () => {
    expect(validateSeedMetadata(metadata, { width: 5472, height: 3648 }).date).toBe("2026-08-24");
    expect(() => validateSeedMetadata(metadata, { width: 800, height: 533 })).toThrow(
      "dimensioner",
    );
    expect(() =>
      validateSeedMetadata(
        { ...metadata, DateTimeOriginal: "2026:09:07" },
        { width: 5472, height: 3648 },
      ),
    ).toThrow("24.08.2026");
    expect(() =>
      validateSeedMetadata({ ...metadata, latitude: NaN }, { width: 5472, height: 3648 }),
    ).toThrow("GPS");
  });
  it("fails closed without an exact staging target", () => {
    expect(() => assertStagingTarget("https://prod.supabase.co", "staging")).toThrow();
    expect(() => assertStagingTarget("https://staging.supabase.co.evil.test", "staging")).toThrow();
    expect(() => assertStagingTarget("https://staging.supabase.co", "staging")).not.toThrow();
  });
});
