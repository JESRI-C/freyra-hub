import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { DEMO_MODE } from "@/lib/demo-mode";

export const WORKSPACE_TOOLS = [
  {
    to: "/app/overview",
    label: "Samlet overblik",
    description: "Se projekter, indikatorer og handlinger på tværs.",
  },
  {
    to: "/app/reports",
    label: "Rapporter",
    description: "Åbn rapportbibliotek, skabeloner og rapportværktøjer.",
  },
  {
    to: "/app/connect/map",
    label: "Kort og zoner",
    description: "Arbejd med kortlag, arealer og geografiske data.",
  },
  {
    to: "/app/construction",
    label: "Byggeri og natur",
    description: "Åbn byggeprojekter og deres naturdokumentation.",
  },
  {
    to: "/app/connect",
    label: "Overvågning og feltdata",
    description: "Åbn enheder, datakilder, integrationer, live data og upload.",
  },
  {
    to: "/app/lavbund",
    label: "Kort og beplantning",
    description: "Åbn lavbundsprojekter med klima, fosfor og beregningsgrundlag.",
  },
  {
    to: "/app/decisions",
    label: "Projektindsigt",
    description: "Se anbefalinger, scenarier, risici og beslutningsnoter.",
  },
  {
    to: "/app/ledger",
    label: "Dokumentation og audit",
    description: "Se dokumenter, kilder, målinger og revisionsspor.",
  },
  {
    to: "/app/connect/registry",
    label: "Data og metoder",
    description: "Se kildekataloget og de eksisterende kildeindstillinger.",
  },
  {
    to: "/app/impact",
    label: "Finansiering og effekt",
    description: "Åbn portefølje, organisationer, kreditter og verifikation.",
  },
  {
    to: "/app/public-impact",
    label: "Offentlig effekt",
    description: "Åbn den eksisterende offentlige effektvisning.",
  },
  {
    to: "/app/settings",
    label: "Indstillinger",
    description: "Administrér projekter, adgang, moduler, sikkerhed og konto.",
  },
  {
    to: "/app/settings/users",
    label: "Brugere og roller",
    description: "Åbn organisationens brugeradministration.",
  },
  {
    to: "/app/system-test",
    label: "Systemtest",
    description: "Åbn de eksisterende tekniske kontroller.",
  },
] as const;

export function WorkspaceTools() {
  // Preserve the existing municipal release boundary as well as every full-app entry point.
  if (DEMO_MODE) return null;
  return (
    <details className="rounded-lg border bg-card p-5">
      <summary className="cursor-pointer text-sm font-medium">Flere fagværktøjer</summary>
      <p className="mt-3 text-sm text-muted-foreground">
        Alle fagværktøjer og deres indstillinger er samlet her. Vælg først den sag, du vil arbejde
        med.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WORKSPACE_TOOLS.map((tool) => (
          <Link key={tool.to} to={tool.to} className="rounded-lg border p-4 hover:border-primary">
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              {tool.label}
              <ArrowUpRight className="size-4 shrink-0" />
            </span>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{tool.description}</p>
          </Link>
        ))}
      </div>
    </details>
  );
}
