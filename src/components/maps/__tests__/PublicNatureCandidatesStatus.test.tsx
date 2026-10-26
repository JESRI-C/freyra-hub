import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { NatureGeoResult } from "@/lib/nature-geo.functions";
import { PublicNatureCandidatesStatus } from "../PublicNatureCandidatesStatus";

const candidateResult = {
  status: "partial",
  mode: "live",
  candidateCounts: { paragraph3: 2, watercourses: 1 },
  provenance: { catalogueDate: "2026-10-13" },
} as NatureGeoResult;
describe("public nature map feedback", () => {
  it("labels successful candidates as partial with unknown historic/accuracy/legal context", () => {
    const html = renderToStaticMarkup(
      <PublicNatureCandidatesStatus
        result={candidateResult}
        loading={false}
        requestFailed={false}
      />,
    );
    expect(html).toContain("delvist datagrundlag");
    expect(html).toContain("2 naturregistreringer og 1 vandløbsregistreringer");
    expect(html).toContain("2026-10-13");
    expect(html).toContain("tidligere perioder er ukendt");
    expect(html).toContain("juridisk naturbeskyttelse");
    expect(html).toContain("uden datum-/epochkorrektion");
  });
  it("suppresses cached candidate counts after a query failure", () => {
    const html = renderToStaticMarkup(
      <PublicNatureCandidatesStatus
        result={candidateResult}
        loading={false}
        requestFailed={true}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Antal og projektforhold er ukendte");
    expect(html).not.toContain("2 naturregistreringer");
  });
  it("does not claim absence of protection from a validated zero-match inventory", () => {
    const html = renderToStaticMarkup(
      <PublicNatureCandidatesStatus
        result={{ ...candidateResult, candidateCounts: { paragraph3: 0, watercourses: 0 } }}
        loading={false}
        requestFailed={false}
      />,
    );
    expect(html).toContain("0 naturregistreringer");
    expect(html).toContain("afgør ikke juridisk naturbeskyttelse");
    expect(html).not.toContain("Ingen beskyttet natur");
  });
  it("keeps disabled/missing/loading states unknown rather than0", () => {
    const disabled = renderToStaticMarkup(
      <PublicNatureCandidatesStatus loading={false} requestFailed={false} />,
    );
    expect(disabled).toContain("naturforhold er uafklarede");
    expect(disabled).not.toContain("0 naturregistreringer");
    const pending = renderToStaticMarkup(
      <PublicNatureCandidatesStatus loading={true} requestFailed={false} />,
    );
    expect(pending).toContain("Henter offentlige naturkandidater");
  });
});
