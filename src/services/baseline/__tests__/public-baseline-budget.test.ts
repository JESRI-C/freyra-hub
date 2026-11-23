import { describe, expect, it } from "vitest";
import { makeManifest } from "./public-baseline.fixtures";
import { baselineSha256, validatePublicBaselineManifest } from "../public-baseline-service";
import {
  fitCollectedBaselineBudget,
  jsonbTextBytes,
  PUBLIC_BASELINE_SQL_BYTE_LIMIT,
} from "../public-baseline-budget";

describe("whole snapshot SQL storage budget", () => {
  it("counts PostgreSQL separator whitespace, UTF-8 and decimal expansion", () => {
    expect(jsonbTextBytes({ x: [1, 2], name: "Bæk" })).toBe(
      new TextEncoder().encode('{"x": [1, 2], "name": "Bæk"}').length,
    );
    expect(jsonbTextBytes(1e-7)).toBe("0.0000001".length);
    expect(jsonbTextBytes(1e21)).toBe("1000000000000000000000".length);
  });
  it("preserves an ordinary preview and its hashes unchanged", async () => {
    const manifest = await makeManifest();
    const source = manifest.sources.find((s) => s.id === "orthophoto-preview")!;
    const payload = {
      schema: "freyra.orthophoto-preview/v1",
      dataUrl: `data:image/jpeg;base64,${"a".repeat(400_000)}`,
    };
    Object.assign(source, {
      mode: "live",
      status: "partial",
      error: null,
      payload,
      payloadSha256: await baselineSha256(payload),
    });
    const hash = await baselineSha256(manifest);
    expect(fitCollectedBaselineBudget(manifest)).toBe(manifest);
    expect(await baselineSha256(manifest)).toBe(hash);
  });
  it("omits only an oversized source with unknown coverage while preserving immutable originals and the ortho image", async () => {
    const manifest = await makeManifest();
    for (const [id, size] of [
      ["orthophoto-preview", 400_000],
      ["planting-lowland", 1_650_000],
      ["sentinel-2-scenes", 300_000],
    ] as const) {
      const source = manifest.sources.find((s) => s.id === id)!;
      const payload = { fixture: "a".repeat(size) };
      Object.assign(source, {
        mode: "live",
        status: "partial",
        error: null,
        payload,
        payloadSha256: await baselineSha256(payload),
      });
    }
    const original = structuredClone(manifest);
    expect(jsonbTextBytes(manifest)).toBeGreaterThan(PUBLIC_BASELINE_SQL_BYTE_LIMIT);
    const fitted = fitCollectedBaselineBudget(manifest);
    expect(jsonbTextBytes(fitted)).toBeLessThan(PUBLIC_BASELINE_SQL_BYTE_LIMIT);
    expect(fitted.sources.find((s) => s.id === "planting-lowland")).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      coverage: { returnedCount: null },
      error: { code: "BASELINE_BYTE_BUDGET" },
    });
    expect(fitted.sources.find((s) => s.id === "orthophoto-preview")).toEqual(
      original.sources.find((s) => s.id === "orthophoto-preview"),
    );
    expect(manifest).toEqual(original);
    await expect(validatePublicBaselineManifest(fitted)).resolves.toEqual(fitted);
  });
});
