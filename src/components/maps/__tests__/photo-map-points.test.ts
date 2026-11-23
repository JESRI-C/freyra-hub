import { describe, expect, it } from "vitest";
import { getPhotoMapPoints } from "../photo-map-points";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
const photo = (
  id: string,
  coordinates?: { lat: number; lng: number },
  projectId = "a",
): ProjectMediaItem => ({
  id,
  projectId,
  title: id,
  category: "drone_image",
  source: "drone",
  url: "",
  uploadedAt: "2026-10-26",
  isReportReady: false,
  tags: [],
  status: "uploaded",
  coordinates,
});
describe("source photo map positions", () => {
  it("allows GPS-only project bounds without a polygon or centroid", () => {
    expect(getPhotoMapPoints([photo("one", { lat: 55, lng: 9 })], "a")[0].position).toEqual([
      55, 9,
    ]);
  });
  it("excludes missing, invalid and foreign-project GPS", () => {
    expect(
      getPhotoMapPoints(
        [
          photo("missing"),
          photo("invalid", { lat: NaN, lng: 9 }),
          photo("outside", { lat: 91, lng: 9 }),
          photo("foreign", { lat: 55, lng: 9 }, "b"),
        ],
        "a",
      ),
    ).toEqual([]);
  });
  it("includes newly arrived files and retains legitimate zero coordinates", () => {
    const old = [photo("one", { lat: 55, lng: 9 })];
    expect(getPhotoMapPoints([...old, photo("new", { lat: 0, lng: 0 })], "a")).toHaveLength(2);
  });
});
