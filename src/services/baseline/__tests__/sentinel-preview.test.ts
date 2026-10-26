import { describe, expect, it } from "vitest";
import { isSafeSentinelThumbnailUrl, selectSentinelPreview } from "../sentinel-preview";
const href =
  "https://datahub.creodias.eu/odata/v1/Assets(98eacd8c-8c85-4888-895a-a45544410c46)/$value";
const scene = (id: string, date: string, cloud: number | null) => ({
  id,
  datetime: `${date}T10:00:00Z`,
  globalCloudCoverPct: cloud,
  thumbnail: { href, mediaType: "image/jpeg" as const },
});
describe("safe nearest Sentinel preview", () => {
  it("prefers zero-cloud catalogue scenes and does not invent local quality", () => {
    expect(
      selectSentinelPreview(
        [scene("near", "2026-08-24", 2), scene("zero", "2026-08-23", 0)],
        "2026-08-24",
      )?.id,
    ).toBe("zero");
  });
  it("ranks low-cloud candidates by distance from flight day, excluding unknown/high cloud", () => {
    expect(
      selectSentinelPreview(
        [
          scene("old", "2026-08-20", 1),
          scene("new", "2026-08-25", 8),
          scene("unknown", "2026-08-24", null),
          scene("cloudy", "2026-08-24", 80),
        ],
        "2026-08-24",
      )?.id,
    ).toBe("new");
    expect(selectSentinelPreview([scene("unknown", "2026-08-24", null)], "2026-08-24")).toBeNull();
  });
  it.each([
    "https://evil.example/thumbnail.jpg",
    `${href}?token=secret`,
    "data:image/svg+xml,example",
    href.replace("https:", "http:"),
    href.replace("datahub.creodias.eu", "user:secret@datahub.creodias.eu"),
  ])("rejects unsafe asset %s", (url) => {
    expect(isSafeSentinelThumbnailUrl(url)).toBe(false);
  });
});
