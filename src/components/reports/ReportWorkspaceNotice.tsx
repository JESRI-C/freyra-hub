import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, Pill } from "@/components/ui-bits";

export function ReportWorkspaceNotice() {
  const { currentProject } = useAuth();
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto">
      <Card>
        <CardHeader
          title="Rapportarbejdet foregår i projektet"
          action={<Pill>Kladdegrundlag</Pill>}
        />
        <div className="px-5 pb-5 space-y-3 text-sm">
          <p>
            Åbn projektet for at se dets rapportregistreringer og aktuelle datagrundlag. En
            registreret rapportstatus dokumenterer ikke i sig selv faglig godkendelse eller en gemt
            rapportfil.
          </p>
          <p className="text-muted-foreground">
            Den samlede rapport med daterede kilder, droneobservationer, fagligt review og en
            genhentelig fil er endnu ikke tilgængelig i denne rapportbygger.
          </p>
          <p>
            Næste skridt: gennemgå projektets grundlag og den gemte fototilknytning. Manuel
            observation, fagligt review og den endelige kommunale rapport følger som særskilte trin.
          </p>
          {currentProject ? (
            <Link
              to="/app/projects/$slug"
              params={{ slug: currentProject.slug || currentProject.id }}
              className="inline-flex rounded-lg bg-primary text-primary-foreground px-3 py-2"
            >
              Åbn {currentProject.name}
            </Link>
          ) : (
            <Link
              to="/app/projects"
              className="inline-flex rounded-lg bg-primary text-primary-foreground px-3 py-2"
            >
              Vælg et projekt
            </Link>
          )}
        </div>
      </Card>
    </main>
  );
}
