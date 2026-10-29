import { Link } from "@tanstack/react-router";
import { Camera, ClipboardList, FileText, Route } from "lucide-react";

/** Same project, permissions and saved survey round as the full workspace. */
export function ProjectFieldShortcuts({ projectId, round }: { projectId: string; round?: string }) {
  return (
    <div className="space-y-2">
      <nav
        aria-label="Genveje til feltarbejde"
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {[
          {
            label: "Jobkort",
            description: "Opgaver og registrering",
            icon: ClipboardList,
            search: { tab: "handlinger", round },
          },
          {
            label: "Fotos",
            description: "Kamera, billeder og GPS",
            icon: Camera,
            search: { tab: "medier", round },
          },
          {
            label: "Sagsforløb",
            description: "Fra billeder til aflevering",
            icon: Route,
            search: { step: "billeder" as const, round },
          },
          {
            label: "Rapporter",
            description: "Rapporter og filer",
            icon: FileText,
            search: { tab: "rapporter", round },
          },
        ].map(({ label, description, icon: Icon, search }) => (
          <Link
            key={label}
            to="/app/projects/$slug"
            params={{ slug: projectId }}
            search={search}
            className="flex min-h-20 min-w-0 items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
            </span>
          </Link>
        ))}
      </nav>
      <Link
        to="/felt"
        search={{ project: projectId, round }}
        className="inline-flex min-h-11 items-center rounded-xl border bg-card px-4 py-2 text-sm font-medium text-primary"
      >
        Gem feltarbejdet på telefonen til offlinebrug
      </Link>
    </div>
  );
}
