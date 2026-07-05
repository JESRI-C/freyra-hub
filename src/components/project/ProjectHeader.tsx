import { useState, useRef, useEffect } from "react";
import { MapPin, Calendar, Leaf, ChevronDown, Pencil, X, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pill } from "@/components/ui-bits";
import type { Project } from "@/lib/supabase/types";
import { updateProjectDetails } from "@/services/projects-service";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const STATUS_OPTIONS = ["Planlægning", "Aktiv", "Under verifikation", "Verificeret", "Afsluttet"];

function statusTone(status: string | null): "success" | "warning" | "info" | "default" {
  switch (status) {
    case "Verificeret":
      return "success";
    case "Under verifikation":
      return "warning";
    case "Afsluttet":
      return "info";
    default:
      return "default";
  }
}

interface ProjectHeaderProps {
  project: Project;
  sitesCount: number;
  activeDataSourcesCount: number;
  openActionsCount: number;
}

export function ProjectHeader({
  project,
  sitesCount,
  activeDataSourcesCount,
  openActionsCount,
}: ProjectHeaderProps) {
  const queryClient = useQueryClient();
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusOpen) return;
    const onClick = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [statusOpen]);

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-by-slug", project.slug] }),
      queryClient.invalidateQueries({ queryKey: ["nature-project-summaries"] }),
      queryClient.invalidateQueries({ queryKey: ["audit", project.id] }),
    ]);
  }

  async function changeStatus(next: string) {
    if (next === project.status) {
      setStatusOpen(false);
      return;
    }
    if (!isSupabaseConfigured) {
      toast.error("Backend ikke konfigureret");
      return;
    }
    setSavingStatus(true);
    try {
      await updateProjectDetails(project.id, { status: next });
      toast.success(`Status ændret til: ${next}`);
      await invalidate();
    } catch (err) {
      toast.error(`Kunne ikke ændre status: ${(err as Error).message}`);
    } finally {
      setSavingStatus(false);
      setStatusOpen(false);
    }
  }

  return (
    <div className="rounded-2xl bg-card border shadow-soft p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-leaf/20 grid place-items-center text-leaf shrink-0">
            <Leaf className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
              {project.project_type && <span>{project.project_type}</span>}
              {project.location_name && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {project.location_name}
                    {project.municipality && project.municipality !== project.location_name
                      ? `, ${project.municipality}`
                      : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status dropdown */}
          <div className="relative" ref={statusRef}>
            <button
              type="button"
              onClick={() => setStatusOpen((v) => !v)}
              disabled={savingStatus}
              className="inline-flex items-center gap-1 disabled:opacity-60"
              aria-label="Skift status"
            >
              <Pill tone={statusTone(project.status)}>
                <span className="inline-flex items-center gap-1">
                  {savingStatus ? "Gemmer…" : (project.status ?? "Ukendt status")}
                  <ChevronDown className="h-3 w-3" />
                </span>
              </Pill>
            </button>
            {statusOpen && (
              <div className="absolute right-0 mt-1 z-20 min-w-[200px] rounded-xl border bg-popover shadow-lg py-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => changeStatus(opt)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
                  >
                    <span>{opt}</span>
                    {opt === project.status && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rediger
          </button>
        </div>
      </div>

      {project.description && (
        <p className="text-sm text-muted-foreground">{project.description}</p>
      )}

      <div className="flex flex-wrap gap-4 pt-2 border-t text-sm text-muted-foreground">
        {(project.start_date || project.end_date) && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {project.start_date
              ? new Date(project.start_date).toLocaleDateString("da-DK", {
                  year: "numeric",
                  month: "short",
                })
              : ""}
            {project.start_date && project.end_date && " – "}
            {project.end_date
              ? new Date(project.end_date).toLocaleDateString("da-DK", {
                  year: "numeric",
                  month: "short",
                })
              : ""}
          </div>
        )}
        <span>{sitesCount} sites</span>
        <span>{activeDataSourcesCount} aktive datakilder</span>
        {openActionsCount > 0 && (
          <span className="text-amber-600 font-medium">{openActionsCount} åbne handlinger</span>
        )}
      </div>

      {editOpen && (
        <EditProjectDialog
          project={project}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            await invalidate();
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

const PROJECT_TYPES = [
  "Naturgenopretning",
  "Biodiversitet",
  "Kystbeskyttelse",
  "Skovrejsning",
  "Vådområde",
];

function EditProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [projectType, setProjectType] = useState(project.project_type ?? "Naturgenopretning");
  const [locationName, setLocationName] = useState(project.location_name ?? "");
  const [municipality, setMunicipality] = useState(project.municipality ?? "");
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [status, setStatus] = useState(project.status ?? "Planlægning");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isSupabaseConfigured) {
      setErr("Backend ikke konfigureret");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await updateProjectDetails(project.id, {
        name: name.trim(),
        description: description.trim(),
        project_type: projectType,
        location_name: locationName.trim(),
        municipality: municipality.trim(),
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        status,
      });
      toast.success("Projekt opdateret");
      await onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-2xl shadow-xl border w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card">
          <h2 className="font-semibold text-base">Rediger projekt</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted grid place-items-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <Field label="Projektnavn" required>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base"
            />
          </Field>
          <Field label="Beskrivelse">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-base resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Projekttype">
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)} className="input-base">
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-base">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Placering">
              <input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="input-base"
              />
            </Field>
            <Field label="Kommune">
              <input
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                className="input-base"
              />
            </Field>
            <Field label="Startdato">
              <input
                type="date"
                value={startDate?.slice(0, 10)}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-base"
              />
            </Field>
            <Field label="Slutdato">
              <input
                type="date"
                value={endDate?.slice(0, 10)}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-base"
              />
            </Field>
          </div>

          {err && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{err}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm hover:bg-muted">
              Annuller
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Gemmer…" : "Gem ændringer"}
            </button>
          </div>
        </form>
      </div>
      <style>{`
        .input-base {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.3);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input-base:focus { box-shadow: 0 0 0 2px hsl(var(--primary) / 0.4); }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
