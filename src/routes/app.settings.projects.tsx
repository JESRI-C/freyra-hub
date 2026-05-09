import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, Drawer, StatusPill } from "@/components/settings/Primitives";
import { PROJECTS, type AdminProject } from "@/lib/settings-data";
import {
  FolderKanban,
  Plus,
  Search,
  Database,
  MapPin,
  Users,
  FileText,
  Settings as SettingsIcon,
  ExternalLink,
} from "lucide-react";
import { ReadinessScore } from "@/components/reports/Primitives";

export const Route = createFileRoute("/app/settings/projects")({
  head: () => ({ meta: [{ title: "Projekter — GoFreyra" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? PROJECTS.find((p) => p.id === openId) : null;
  const filtered = useMemo(
    () =>
      PROJECTS.filter((p) =>
        (p.name + p.location + p.owner + p.type).toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );
  const active = PROJECTS.filter((p) => p.status === "Aktiv").length;

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Projekter</h1>
            <p className="text-xs text-muted-foreground">
              Administrér projekter, ansvar og dataforbindelser
            </p>
          </div>
        </div>
        <button className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tilføj projekt
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Projekter i alt"
          value={String(PROJECTS.length)}
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <StatCard
          label="Aktive"
          value={String(active)}
          icon={<FolderKanban className="h-5 w-5" />}
          accent="bg-success/15 text-success"
        />
        <StatCard
          label="Datakilder tilknyttet"
          value={String(PROJECTS.reduce((a, p) => a + p.sources, 0))}
          icon={<Database className="h-5 w-5" />}
        />
        <StatCard
          label="Gns. rapportklarhed"
          value={`${Math.round(PROJECTS.reduce((a, p) => a + p.readiness, 0) / PROJECTS.length)}%`}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b gap-3">
          <div className="text-sm font-semibold">Alle projekter</div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 w-72 max-w-full">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg projekt, lokation, ejer..."
              className="bg-transparent outline-none text-sm flex-1 min-w-0"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {[
                  "Projekt",
                  "Type",
                  "Lokation",
                  "Ejer",
                  "Status",
                  "Datakvalitet",
                  "Kilder",
                  "Moduler",
                  "Klarhed",
                  "Senest",
                  "",
                ].map((h) => (
                  <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => setOpenId(p.id)}
                >
                  <td className="px-4 py-3 font-medium">
                    {p.name}
                    <div className="text-[11px] text-muted-foreground">
                      {p.id} · {p.area}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.type}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.location}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.owner}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium tabular-nums ${p.dataQuality >= 85 ? "text-success" : p.dataQuality >= 70 ? "text-warning-foreground" : "text-destructive"}`}
                    >
                      {p.dataQuality}%
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.sources}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {p.modules.slice(0, 2).map((m) => (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                          {m}
                        </span>
                      ))}
                      {p.modules.length > 2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                          +{p.modules.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ReadinessScore value={p.readiness} size="sm" />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{p.updated}</td>
                  <td className="px-4 py-3 text-right">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        subtitle={open ? `${open.id} · ${open.type}` : ""}
        width="max-w-2xl"
        footer={
          <>
            <button className="rounded-lg border bg-card px-3 py-1.5 text-sm">Redigér</button>
            <button className="rounded-lg border bg-card px-3 py-1.5 text-sm">
              Administrér datakilder
            </button>
            <button className="rounded-lg border bg-card px-3 py-1.5 text-sm">Opret rapport</button>
            <button className="ml-auto rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm">
              Åbn dashboard
            </button>
          </>
        }
      >
        {open && <ProjectDetail p={open} />}
      </Drawer>
    </main>
  );
}

function ProjectDetail({ p }: { p: AdminProject }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Box label="Status" v={<StatusPill status={p.status} />} />
        <Box
          label="Datakvalitet"
          v={<span className="text-sm font-semibold">{p.dataQuality}%</span>}
        />
        <Box label="Klarhed" v={<ReadinessScore value={p.readiness} size="sm" />} />
      </div>
      <div className="rounded-xl border p-4">
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
          Beskrivelse
        </div>
        <p className="text-sm">{p.description}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {p.location}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FolderKanban className="h-3.5 w-3.5" /> {p.area}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Ejer: {p.owner}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Database className="h-3.5 w-3.5" /> {p.sources} datakilder
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
          Aktive moduler
        </div>
        <div className="flex flex-wrap gap-2">
          {p.modules.map((m) => (
            <span
              key={m}
              className="text-xs px-2 py-1 rounded-full bg-leaf/20 border border-primary/20"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Box
          label="Tilknyttede rapporter"
          v={<span className="text-sm">3 rapporter · 1 godkendt</span>}
        />
        <Box
          label="Impact Exchange profil"
          v={<span className="text-sm">Aktiv · 2 verifiers</span>}
        />
        <Box label="ESG Ledger records" v={<span className="text-sm">128 events</span>} />
        <Box
          label="Ansvarlige brugere"
          v={<span className="text-sm">{p.owner}, Emma Larsen</span>}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <SettingsIcon className="h-3.5 w-3.5" /> Senest opdateret {p.updated}
      </div>
    </>
  );
}

function Box({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1">{v}</div>
    </div>
  );
}
