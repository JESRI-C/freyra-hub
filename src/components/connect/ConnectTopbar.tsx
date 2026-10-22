import { useState } from "react";
import { Calendar, ChevronsUpDown, Search, MapPin } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useConnectContext, RANGE_OPTIONS, type ConnectRangeKey } from "@/lib/connect-context";

export function ConnectTopbar() {
  const { project, projects, range, setProject, setRange } = useConnectContext();
  const [q, setQ] = useState("");

  return (
    <div className="border-b bg-card/80 backdrop-blur">
      <div className="w-full px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2 min-w-0">
        {/* Project selector */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm min-w-0 hover:bg-muted transition">
              <span className="h-5 w-5 rounded bg-leaf/30 text-primary grid place-items-center text-[10px] font-semibold shrink-0">
                {project?.name?.slice(0, 2).toUpperCase() ?? "—"}
              </span>
              <span className="truncate max-w-[220px] font-medium">
                {project?.name ?? "Vælg projekt"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-1">
            {projects.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                Ingen projekter du har adgang til.
              </div>
            ) : (
              <ul className="max-h-72 overflow-auto">
                {projects.map((p) => {
                  const active = p.id === project?.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setProject(p.id)}
                        className={`w-full text-left px-2.5 py-2 text-sm rounded-md hover:bg-muted flex items-center gap-2 ${
                          active ? "bg-muted font-medium" : ""
                        }`}
                      >
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PopoverContent>
        </Popover>

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm hover:bg-muted transition">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{range.label}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            <ul>
              {RANGE_OPTIONS.map((o) => {
                const active = o.key === range.key;
                return (
                  <li key={o.key}>
                    <button
                      onClick={() => setRange(o.key as ConnectRangeKey)}
                      className={`w-full text-left px-2.5 py-2 text-sm rounded-md hover:bg-muted ${
                        active ? "bg-muted font-medium" : ""
                      }`}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>

        {/* Search — stub in Fase A, wired in Fase B */}
        <div className="ml-auto flex items-center gap-2 min-w-0">
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg enheder, zoner, observationer…"
              className="w-56 lg:w-72 rounded-lg border bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>
      </div>

      {/* Active range indicator — always visible so brugeren ved hvilken periode data dækker */}
      {range.from && (
        <div className="w-full px-4 sm:px-6 pb-2 text-[11px] text-muted-foreground">
          Viser data fra {range.from.toLocaleDateString("da-DK")} til{" "}
          {range.to.toLocaleDateString("da-DK")}
        </div>
      )}
    </div>
  );
}
