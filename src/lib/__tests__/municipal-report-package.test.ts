import { describe, expect, it } from "vitest";
import { makeMunicipalReportFixture } from "@/services/monitoring/__tests__/municipal-report.fixtures";
import {
  municipalReportPhotoCsv,
  municipalReportCameraGeoJson,
  municipalReportZip,
} from "../municipal-report-package";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
async function report() {
  const f = await makeMunicipalReportFixture();
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    version: 1,
    manifest: f.manifest,
    manifestSha256: await baselineSha256(f.manifest),
  } as never;
}
describe("municipal report exports", () => {
  it("exports camera points with explicit unverified object/footprint roles", async () => {
    const data = JSON.parse(municipalReportCameraGeoJson(await report()));
    expect(data.type).toBe("FeatureCollection");
    expect(data.features).toHaveLength(1);
    expect(data.features[0].geometry.type).toBe("Point");
    expect(data.features[0].properties.geometryRole).toBe("camera_position_only");
    expect(data.features[0].properties.objectLocationVerified).toBe(false);
    expect(data.features[0].properties.footprintVerified).toBe(false);
  });
  it("exports a quoted semicolon register with stable photo and report hash references", async () => {
    const value = await report();
    const csv = municipalReportPhotoCsv(value);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"camera_position_only"');
    expect(csv).toContain('"original_sha256"');
    expect(csv.split("\r\n")).toHaveLength(3);
  });
  it("rejects archive path traversal and duplicate entries before producing bytes", () => {
    expect(() =>
      municipalReportZip([{ name: "../rapport.pdf", bytes: new Uint8Array() }]),
    ).toThrow();
    expect(() =>
      municipalReportZip([
        { name: "rapport.pdf", bytes: new Uint8Array() },
        { name: "rapport.pdf", bytes: new Uint8Array() },
      ]),
    ).toThrow();
  });
});
