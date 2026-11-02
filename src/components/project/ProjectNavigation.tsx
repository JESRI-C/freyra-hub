import { PROJECT_AREAS, sameProjectView, type ProjectView } from "@/lib/project-navigation";

export function ProjectNavigation({
  view,
  onNavigate,
}: {
  view: ProjectView;
  onNavigate: (view: ProjectView) => void;
}) {
  const area = PROJECT_AREAS.find((item) =>
    item.destinations.some((d) => sameProjectView(d.view, view)),
  )!;
  const isOverview = view.kind === "tab" && view.id === "overblik";
  return (
    <div className="space-y-3">
      {!isOverview && (
        <button
          type="button"
          className="min-h-11 rounded-xl border bg-card px-4 py-2 text-sm font-medium"
          onClick={() => onNavigate({ kind: "tab", id: "overblik" })}
        >
          ← Til projektets forløb
        </button>
      )}
      <details key={`${view.kind}:${view.id}`} className="rounded-xl border bg-card p-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
          {isOverview ? "Alle projektets værktøjer" : `Flere værktøjer · ${area.label}`}
        </summary>
        <nav
          aria-label="Projektets arbejdsområder"
          className="grid grid-cols-2 gap-2 lg:grid-cols-3"
        >
          {PROJECT_AREAS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={area.id === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.destinations[0].view)}
              className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-medium ${area.id === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <label className="block text-sm font-medium md:hidden">
          Værktøj i {area.label.toLowerCase()}
          <select
            className="mt-2 min-h-11 w-full rounded-lg border bg-background p-2 text-base"
            value={`${view.kind}:${view.id}`}
            onChange={(event) => {
              const destination = area.destinations.find(
                (d) => `${d.view.kind}:${d.view.id}` === event.target.value,
              );
              if (destination) onNavigate(destination.view);
            }}
          >
            {area.destinations.map((d) => (
              <option key={`${d.view.kind}:${d.view.id}`} value={`${d.view.kind}:${d.view.id}`}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label={`Værktøjer: ${area.label}`} className="hidden flex-wrap gap-2 md:flex">
          {area.destinations.map((d) => (
            <button
              key={`${d.view.kind}:${d.view.id}`}
              type="button"
              aria-current={sameProjectView(d.view, view) ? "page" : undefined}
              onClick={() => onNavigate(d.view)}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm ${sameProjectView(d.view, view) ? "bg-secondary font-medium" : "underline underline-offset-4"}`}
            >
              {d.label}
            </button>
          ))}
        </nav>
      </details>
    </div>
  );
}
