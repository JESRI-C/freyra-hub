import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BaselineSourceData } from "../BaselineSourceData";
import { monitoringSource } from "@/services/baseline/__tests__/public-monitoring-stations-saved.fixtures";
import type { PublicMonitoringStationsPayload } from "@/services/baseline/public-monitoring-stations-source";

describe("saved public site candidates display", () => {
  it("shows identifiers and verification needs while keeping catalogue times separate from the requested period", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Saved render must not fetch"));
    try {
      const html = renderToStaticMarkup(<BaselineSourceData source={monitoringSource()} />);
      expect(html).toContain("Offentlige undersøgelsessteder · 7 stedkandidater");
      expect(html).toContain("38000000");
      expect(html).toContain("10000000-0000-4000-8000-000000000001");
      expect(html).toContain("Stedtype: Ukendt");
      expect(html).toContain("Vandløb og opland: Afventer kontrol");
      expect(html).toContain("Vandstand og vandføring er ikke hentet");
      expect(html).toContain("2026-08-24–2026-09-09");
      expect(html).toContain("hentetidspunktet er ikke et måletidspunkt");
      expect(html).toContain("Kildens katalogtidspunkt:");
      expect(html).toContain("CC0 1.0");
      expect(html).not.toContain("Synthetic omitted label");
      expect(html).not.toContain("7 målestationer");
      expect(html).not.toContain("l/sec");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it("shows an actual empty received inventory without claiming that hydrometric stations or water are absent", () => {
    const html = renderToStaticMarkup(<BaselineSourceData source={monitoringSource(0)} />);
    expect(html).toContain("0 stedkandidater");
    expect(html).toContain("Ingen stedkandidater i denne gemte kildeforespørgsel");
    expect(html).toContain(
      "Det fastslår ikke fravær af målestationer i andre registre eller manglende vandføring",
    );
    expect(html).not.toContain("0 l/sec");
  });
  it.each(["failed", "timeout"] as const)(
    "shows %s as unavailable rather than rendering a cached candidate or a zero",
    (status) => {
      const source = monitoringSource();
      source.mode = "error";
      source.status = status;
      source.error = { code: "SOURCE_FAILED", message: "Safe failure" };
      const html = renderToStaticMarkup(<BaselineSourceData source={source} />);
      expect(html).toContain('role="alert"');
      expect(html).toContain("Kilden kunne ikke hentes");
      expect(html).not.toContain("38000000");
      expect(html).not.toContain("0 stedkandidater");
    },
  );
  it("keeps older unimplemented snapshots visible without rendering any new data", () => {
    const source = monitoringSource();
    source.status = "not_implemented";
    source.payload = null;
    const html = renderToStaticMarkup(<BaselineSourceData source={source} />);
    expect(html).toContain("Kilden er endnu ikke hentet eller tilsluttet");
    expect(html).not.toContain("38000000");
  });
  it.each(["label", "association", "credential", "point", "counts"])(
    "rejects corrupt saved %s without exposing candidate values",
    (field) => {
      const source = monitoringSource();
      const data = source.payload as unknown as PublicMonitoringStationsPayload;
      if (field === "label")
        Object.assign(data.product.candidates[0], { sourceName: "DO-NOT-RENDER" });
      if (field === "association")
        Object.assign(data.product.candidates[0], { watercourseRelation: "verified" });
      if (field === "credential") data.pages[0].queryUrl += "&apiKey=DO-NOT-RENDER";
      if (field === "point") data.product.candidates[0].nativeGeometry.coordinates[0] = 10;
      if (field === "counts") data.product.matchedCount++;
      const html = renderToStaticMarkup(<BaselineSourceData source={source} />);
      expect(html).toContain('role="alert"');
      expect(html).not.toContain("38000000");
      expect(html).not.toContain("DO-NOT-RENDER");
      expect(html).not.toContain("0 stedkandidater");
    },
  );
});
