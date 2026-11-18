import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

import { getProjectGeoJSON } from "@/services/geospatial-service";

describe("getProjectGeoJSON i preview-tilstand", () => {
  it("afviser eksport i stedet for at mærke seed-geometri canonical", async () => {
    await expect(
      getProjectGeoJSON("project-1", "Preview-projekt", {
        polygon: {
          type: "Polygon",
          coordinates: [
            [
              [9.48, 55.25],
              [9.49, 55.25],
              [9.49, 55.26],
              [9.48, 55.26],
              [9.48, 55.25],
            ],
          ],
        },
      }),
    ).rejects.toThrow("ikke tilgængelig i preview-tilstand");
  });
});
