import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("official layers fail visibly", () => {
  it("does not report missing provider as empty live layer", async () => {
    vi.stubEnv("VITE_DMP_WFS_URL", "");
    const api = await import("../paragraph3-service");
    await expect(api.fetchWatercourses(55.2, 9.5)).rejects.toThrow("konfiguration");
    await expect(api.fetchParagraph3Overlap(55.2, 9.5, 10)).rejects.toThrow("konfiguration");
  });
  it("requires actual project polygon for overlap", async () => {
    vi.stubEnv("VITE_DMP_WFS_URL", "https://official.example/wfs");
    const api = await import("../paragraph3-service");
    await expect(api.fetchParagraph3Overlap(55.2, 9.5, 10)).rejects.toThrow("projektpolygon");
  });
  it("does not turn provider failure into zero overlap or demo species", async () => {
    vi.stubEnv("VITE_DMP_WFS_URL", "https://official.example/wfs");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const api = await import("../paragraph3-service");
    await expect(
      api.fetchParagraph3Overlap(55.2, 9.5, 10, 0.02, {
        type: "Polygon",
        coordinates: [
          [
            [9, 55],
            [10, 55],
            [10, 56],
            [9, 55],
          ],
        ],
      }),
    ).rejects.toThrow("kunne ikke hentes");
    await expect(api.fetchNatureData(55.2, 9.5, 10)).rejects.toThrow();
  });
  it("queries full project bbox and rejects invalid source geometry", async () => {
    vi.stubEnv("VITE_DMP_WFS_URL", "https://official.example/wfs");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ geometry: { type: "Point", coordinates: [9, 55] } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("../paragraph3-service");
    await expect(
      api.fetchParagraph3Overlap(55.2, 9.5, 10, 0.02, {
        type: "Polygon",
        coordinates: [
          [
            [9, 55],
            [10, 55],
            [10, 56],
            [9, 55],
          ],
        ],
      }),
    ).rejects.toThrow();
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("bbox")).toBe(
      "9,55,10,56,EPSG:4326",
    );
  });
});
