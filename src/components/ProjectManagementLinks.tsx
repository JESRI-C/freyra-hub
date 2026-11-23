import { Link } from "@tanstack/react-router";
import { projectManagementLinks } from "@/lib/project-management-navigation";

export function ProjectManagementLinks() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {projectManagementLinks.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          {label}
        </Link>
      ))}
    </div>
  );
}
