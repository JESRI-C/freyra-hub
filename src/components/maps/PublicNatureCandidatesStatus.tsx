import type { NatureGeoResult } from "@/lib/nature-geo.functions";

export function PublicNatureCandidatesStatus({
  result,
  loading,
  requestFailed,
}: {
  result?: NatureGeoResult;
  loading: boolean;
  requestFailed: boolean;
}) {
  if (requestFailed || result?.mode === "error")
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
      >
        <div className="font-medium">Naturregistreringer er ikke tilgængelige</div>
        <p>
          {requestFailed
            ? "Naturkilden kunne ikke læses. Antal og projektforhold er ukendte."
            : result?.error?.message}
        </p>
        <p>En kildefejl dokumenterer ikke fravær af beskyttet natur eller vandløb.</p>
      </div>
    );
  if (loading)
    return (
      <div role="status" className="rounded-xl border px-4 py-3 text-sm">
        Henter offentlige naturkandidater…
      </div>
    );
  if (!result || result.status === "disabled")
    return (
      <div role="status" className="rounded-xl border px-4 py-3 text-sm">
        Naturregistreringer er ikke hentet. Projektets naturforhold er uafklarede.
      </div>
    );
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
    >
      <div className="font-medium">Offentlige naturkandidater · delvist datagrundlag</div>
      <p>
        {result.candidateCounts.paragraph3 ?? "Ukendt antal"} naturregistreringer og{" "}
        {result.candidateCounts.watercourses ?? "ukendt antal"} vandløbsregistreringer modtaget i
        forespørgselsområdet.
      </p>
      <p>
        Registreringerne skal vurderes fagligt. Kortopslaget afgør ikke juridisk naturbeskyttelse,
        projektets konkrete overlap eller rapportgodkendelse.
      </p>
      <p className="mt-1 text-xs">
        Aktuel katalogvisning {result.provenance?.catalogueDate}. Dækning af tidligere perioder er
        ukendt. Positionerne er omregnet fra ETRS89/UTM32 til WGS84 uden datum-/epochkorrektion;
        opmålingsnøjagtighed og højder er ikke verificeret.
      </p>
    </div>
  );
}
