import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { Card, CardHeader, PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { getAllNatureProjectSummaries } from "@/services/projects-service";
import { ProjectMonitorCard } from "@/components/project/ProjectMonitorCard";
import { Leaf, FolderOpen, AlertCircle, BarChart2 } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { NatureProjectSummary } from "@/lib/supabase/types";
import { useAuth } from "@/lib/auth";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/app/projects/")({
  head: () => ({ meta: [{ title: "Projektoversigt — GoFreyra" }] }),
  component: ProjectsIndexPage,
});


const STATUS_FILTERS = ["Alle", "Under verifikation", "Verificeret", "Afsluttet"];

const PROJECT_TYPES = [
  "Naturgenopretning",
  "Biodiversitet",
  "Kystbeskyttelse",
  "Skovrejsning",
  "Vådområde",
] as const;

type ProjectType = (typeof PROJECT_TYPES)[number];
type ProjectStatus = "Aktiv" | "Planlægning" | "Afsluttet";

interface CreateProjectForm {
  name: string;
  description: string;
  projectType: ProjectType;
  location: string;
  status: ProjectStatus;
}

const FORM_DEFAULTS: CreateProjectForm = {
  name: "",
  description: "",
  projectType: "Naturgenopretning",
  location: "",
  status: "Planlægning",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProjectsIndexPage() {
  const { currentOrg, selectProject, refresh } = useAuth();
  const orgId = currentOrg?.id ?? "";
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateProjectForm>(FORM_DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localSummaries, setLocalSummaries] = useState<NatureProjectSummary[]>([]);

  const { data: querySummaries } = useSuspenseQuery({
    queryKey: ["nature-project-summaries", orgId],
    queryFn: () => getAllNatureProjectSummaries(orgId),
  });


  // Prepend any locally created projects so they appear immediately
  const summaries = useMemo(
    () => [...localSummaries, ...querySummaries],
    [localSummaries, querySummaries],
  );

  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      if (statusFilter !== "Alle" && s.project.status !== statusFilter) return false;
      if (q) {
        const search = q.toLowerCase();
        const text =
          `${s.project.name} ${s.project.location_name ?? ""} ${s.project.project_type ?? ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }, [summaries, q, statusFilter]);

  const totalOpenActions = useMemo(
    () => summaries.reduce((acc, s) => acc + s.openActions, 0),
    [summaries],
  );

  const avgReadiness = useMemo(() => {
    const vals = summaries
      .flatMap((s) => s.indicators)
      .filter((i) => i.key === "report_readiness" && i.value !== null)
      .map((i) => i.value as number);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [summaries]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function closeModal() {
    setShowCreateModal(false);
    setForm(FORM_DEFAULTS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();

    try {
      if (isSupabaseConfigured && supabase) {
        const db = supabase as unknown as { from: (t: string) => { insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } };
        const { error } = await db.from("projects").insert({
          id: newId,
          organization_id: orgId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          project_type: form.projectType,
          location_name: form.location.trim() || null,
          status: form.status,
          country: "Denmark",
          slug: null,
          municipality: null,
          start_date: null,
          end_date: null,
        });
        if (error) throw new Error(error.message);
      }

      // Add to local state so it appears immediately in the list
      const newSummary: NatureProjectSummary = {
        project: {
          id: newId,
          organization_id: orgId,
          name: form.name.trim(),
          slug: null,
          project_type: form.projectType,
          location_name: form.location.trim() || null,
          municipality: null,
          country: "Denmark",
          status: form.status,
          start_date: null,
          end_date: null,
          description: form.description.trim() || null,
          created_at: now,
          geometry_polygon: null,
          geometry_centroid_lat: null,
          geometry_centroid_lng: null,
          geometry_area_ha: null,
          geometry_source: "none",
        },
        indicators: [],
        activeDataSources: 0,
        openActions: 0,
        latestAuditEvent: null,
        latestReport: null,
      };

      setLocalSummaries((prev) => [newSummary, ...prev]);
      closeModal();
      showToast("Projekt oprettet");
    } catch (err) {
      console.error("Kunne ikke oprette projekt:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5 pb-16">
      <PageHeader
        title="Projektoversigt"
        description="Alle naturprojekter i din organisation"
        actions={
          <div className="flex items-center gap-2">
            <Pill tone="info">{summaries.length} projekter</Pill>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3.5 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Opret projekt
            </button>
          </div>
        }
      />

      {/* Stat bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Projekter i alt"
          value={String(summaries.length)}
          icon={<FolderOpen className="h-5 w-5" />}
        />
        <StatCard
          label="Sites"
          value="6+"
          icon={<Leaf className="h-5 w-5" />}
        />
        <StatCard
          label="Åbne handlinger"
          value={String(totalOpenActions)}
          icon={<AlertCircle className="h-5 w-5" />}
          accent="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Gns. rapportklarhed"
          value={avgReadiness !== null ? `${avgReadiness}%` : "—"}
          icon={<BarChart2 className="h-5 w-5" />}
        />
      </div>

      {/* Search + filter */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 bg-muted/40 border rounded-xl px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg efter projektnavn, placering eller type…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      {/* Result count */}
      <div className="text-sm text-muted-foreground">
        Viser <span className="font-medium text-foreground">{filtered.length}</span> af{" "}
        {summaries.length} projekter
      </div>

      {/* Project grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <ProjectMonitorCard key={s.project.id} summary={s} />
          ))}
        </div>
      ) : (
        <Card className="py-12 text-center">
          <CardHeader
            title="Ingen projekter fundet"
            subtitle="Prøv at justere din søgning eller filtrering"
          />
        </Card>
      )}

      {/* ── Create project modal ────────────────────────────────────────────────── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-card rounded-2xl shadow-xl border w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-base">Opret nyt projekt</h2>
              <button
                onClick={closeModal}
                className="h-8 w-8 rounded-lg hover:bg-muted grid place-items-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Projektnavn <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="F.eks. Vejle Ådal Genopretning"
                  className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Beskrivelse</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Kort beskrivelse af projektet…"
                  rows={3}
                  className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              {/* Type + Location */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Projekttype</label>
                  <select
                    value={form.projectType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, projectType: e.target.value as ProjectType }))
                    }
                    className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {PROJECT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Placering</label>
                  <input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="F.eks. Vejle"
                    className="w-full rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <div className="flex gap-2">
                  {(["Planlægning", "Aktiv", "Afsluttet"] as ProjectStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, status: s }))}
                      className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-colors ${
                        form.status === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Annuller
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.name.trim()}
                  className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Opretter…" : "Opret projekt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-foreground text-background px-4 py-2.5 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </main>
  );
}
