import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOrthophotoPreviewSource } from "../orthophoto-preview.server";
import { PROJECT } from "./public-baseline.fixtures";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { baselineSha256 } from "../public-baseline-service";
const input = {
  polygon: PROJECT.geometry_polygon as GeoJSONPolygon,
  dateFrom: "2026-08-24",
  dateTo: "2026-08-24",
};
afterEach(() => vi.unstubAllEnvs());
describe("frozen credential-free ortho preview", () => {
  it("records missing server access without making a request", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    const fetchImpl = vi.fn();
    const result = await fetchOrthophotoPreviewSource(input, { fetchImpl });
    expect(result).toMatchObject({
      status: "not_configured",
      payload: null,
      coverage: { returnedCount: null },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("freezes returned image bytes with hashes and retains unknown capture date", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "private-test-key");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([255, 216, 1, 2, 255, 217]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
      );
    const result = await fetchOrthophotoPreviewSource(input, { fetchImpl });
    expect(result).toMatchObject({
      mode: "live",
      status: "partial",
      coverage: { temporal: "unknown" },
    });
    expect(result.payload).toMatchObject({
      schema: "freyra.orthophoto-preview/v1",
      capturedAt: null,
      dataUrl: "data:image/jpeg;base64,/9gBAv/Z",
    });
    expect(result.payloadSha256).toBe(await baselineSha256(result.payload));
    expect(JSON.stringify(result)).not.toContain("private-test-key");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("apikey=private-test-key");
  });
  it.each([
    new Response("private-test-key", { headers: { "Content-Type": "text/xml" } }),
    new Response("not a JPEG", { headers: { "Content-Type": "image/jpeg" } }),
    new Response(null, { status: 302, headers: { location: "https://untrusted.example" } }),
  ])("rejects non-images and redirects without exposing upstream content", async (response) => {
    vi.stubEnv("DATAFORDELER_API_KEY", "private-test-key");
    const result = await fetchOrthophotoPreviewSource(input, {
      fetchImpl: vi.fn().mockResolvedValue(response),
    });
    expect(result.mode).toBe("error");
    expect(result.payload).toBeNull();
    expect(JSON.stringify(result)).not.toContain("private-test-key");
  });
});
