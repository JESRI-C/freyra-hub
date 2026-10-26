import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

/** Customer-safe replacement for the legacy static intelligence demonstrations. */
export function ProjectEvidenceStatus() {
  const { currentProject, currentOrg } = useAuth();
  return (
    <section className="m-6 rounded-2xl border bg-card p-6 space-y-4">
      <h2 className="text-xl font-semibold">{currentProject?.name ?? "Vælg et projekt"}</h2>
      <p className="text-muted-foreground">{currentOrg?.name}</p>
      <p>
        Der er endnu ikke et verificeret analysegrundlag i dette modul. Datakvalitet og
        rapportklarhed er ukendt, indtil projektets kilder og rapportversion er kontrolleret.
      </p>
      <p className="text-sm text-muted-foreground">
        Artsbestemmelse kræver faglig godkendelse. GPS-fotopunkter er ikke målfast ortofoto.
        RGB-fotos dokumenterer ikke biomasse, hydraulisk kapacitet eller NDVI.
      </p>
      <div className="flex gap-4">
        <Link to="/app/connect/map" className="text-primary underline">
          Se projektets kort og datagrundlag
        </Link>
        <Link to="/app/reports" className="text-primary underline">
          Åbn rapporter
        </Link>
      </div>
    </section>
  );
}
