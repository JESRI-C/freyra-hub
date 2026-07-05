import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Archive, ArchiveRestore, Pencil, X, MapPin, Activity, Radio, Database, BarChart2 } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { Site } from "@/lib/supabase/types";
import {
  archiveSite,
  createSite,
  getSiteRelations,
  unarchiveSite,
  updateSite,
  type SiteInput,
  type SiteRelations,
} from "@/services/sites-service";

const SITE_TYPES = ["Naturareal", "Vådområde", "Skov", "Eng", "Kystzone", "Vandløb", "Andet"];
const BASELINE_STATUSES = ["Afventer baseline", "Delvist dokumenteret", "Dokumenteret"];

export function SitesPanel({ projectId, sites }: { projectId: string; sites: Site[] }) {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Site | "new" | null>(null);
  const [detailFor, setDetailFor] = useState<Site | null>(null);

  const activeSites = sites.filter((s) => (s.status ?? "active") === "active");
  const archivedSites = sites.filter((s) => s.status === "archived");
  const visibleSites = showArchived ? archivedSites : activeSites;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["sites", projectId] });
  }

  async function handleArchive(site: Site) {
    try {
      await archiveSite(site.id, projectId);
      toast.success(`Site arkiveret: ${site.name}`);
      await refresh();
    } catch (err) {
      toast.error(`Kunne ikke arkivere: ${(err as Error).message}`);
    }
  }

  async function handleUnarchive(site: Site) {
    try {
      await unarchiveSite(site.id, projectId);
      toast.success(`Site genaktiveret: ${site.name}`);
      await refresh();
    } catch (err) {
      toast.error(`Kunne ikke genaktivere: ${(err as Error).message}`);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Sites"
        subtitle="Delområder tilknyttet projektet — datakilder, observationer og sensorer knyttes til hvert site"
        action={
          <div className="flex items-center gap-2">
            <div className="flex text-xs rounded-lg border overflow-hidden">
              <button
                onClick={() => setShowArchived(false)}
                className={`px-3 py-1.5 ${!showArchived ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              >
                Aktive ({activeSites.length})
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`px-3 py-1.5 ${showArchived ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              >
                Arkiverede ({archivedSites.length})
              </button>
            </div>
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Nyt site
            </button>
          </div>
        }
      />

      {visibleSites.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          {showArchived ? "Ingen arkiverede sites." : "Ingen sites endnu. Opret dit første site for at komme i gang."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/30">
              <tr>
                <th className="px-5 py-2">Navn</th>
                <th className="py-2">Type</th>
                <th className="py-2 text-right">Areal (ha)</th>
                <th className="py-2">Baseline</th>
                <th className="py-2 text-right pr-5">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleSites.map((site) => (
                <tr key={site.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setDetailFor(site)}>
                  <td className="px-5 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {site.name}
                      {site.centroid_lat != null && <MapPin className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    {site.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{site.description}</div>
                    )}
                  </td>
                  <td className="py-3">{site.site_type ?? "—"}</td>
                  <td className="py-3 text-right tabular-nums">{site.area_ha ?? "—"}</td>
                  <td className="py-3">
                    <span
                      className={`text-xs ${
                        site.baseline_status === "Dokumenteret"
                          ? "text-emerald-600"
                          : site.baseline_status === "Delvist dokumenteret"
                            ? "text-amber-600"
                            : "text-muted-foreground"
                      }`}
                    >
                      {site.baseline_status ?? "—"}
                    </span>
                  </td>
                  <td className="py-3 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => setEditing(site)}
                        className="h-7 w-7 rounded-lg hover:bg-muted grid place-items-center"
                        title="Rediger"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {site.status === "archived" ? (
                        <button
                          onClick={() => handleUnarchive(site)}
                          className="h-7 w-7 rounded-lg hover:bg-muted grid place-items-center"
                          title="Genaktivér"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleArchive(site)}
                          className="h-7 w-7 rounded-lg hover:bg-muted grid place-items-center"
                          title="Arkivér"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SiteEditDialog
          projectId={projectId}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh();
            setEditing(null);
          }}
        />
      )}

      {detailFor && (
        <SiteDetailDrawer site={detailFor} onClose={() => setDetailFor(null)} />
      )}
    </Card>
  );
}

// ─── Edit / create dialog ─────────────────────────────────────────────────────

function SiteEditDialog({
  projectId,
  initial,
  onClose,
  onSaved,
}: {
  projectId: string;
  initial: Site | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [siteType, setSiteType] = useState(initial?.site_type ?? "Naturareal");
  const [areaHa, setAreaHa] = useState(initial?.area_ha != null ? String(initial.area_ha) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [baselineStatus, setBaselineStatus] = useState(initial?.baseline_status ?? "Afventer baseline");
  const [centroidLat, setCentroidLat] = useState(initial?.centroid_lat != null ? String(initial.centroid_lat) : "");
  const [centroidLng, setCentroidLng] = useState(initial?.centroid_lng != null ? String(initial.centroid_lng) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    const payload: SiteInput = {
      project_id: projectId,
      name: name.trim(),
      site_type: siteType,
      area_ha: areaHa ? Number(areaHa) : null,
      description: description.trim() || null,
      baseline_status: baselineStatus,
      centroid_lat: centroidLat ? Number(centroidLat) : null,
      centroid_lng: centroidLng ? Number(centroidLng) : null,
    };
    try {
      if (initial) await updateSite(initial.id, projectId, payload);
      else await createSite(payload);
      toast.success(initial ? "Site opdateret" : "Site oprettet");
      await onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl shadow-xl border w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card">
          <h2 className="font-semibold text-base">{initial ? "Rediger site" : "Nyt site"}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted grid place-items-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <Field label="Navn" required>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="input-base" />
          </Field>
          <Field label="Beskrivelse">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-base resize-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={siteType} onChange={(e) => setSiteType(e.target.value)} className="input-base">
                {SITE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Areal (ha)">
              <input type="number" step="0.1" min="0" value={areaHa} onChange={(e) => setAreaHa(e.target.value)} className="input-base" />
            </Field>
            <Field label="Baseline-status">
              <select value={baselineStatus} onChange={(e) => setBaselineStatus(e.target.value)} className="input-base">
                {BASELINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <div />
            <Field label="Centrum lat">
              <input type="number" step="0.0001" value={centroidLat} onChange={(e) => setCentroidLat(e.target.value)} className="input-base" placeholder="55.6761" />
            </Field>
            <Field label="Centrum lng">
              <input type="number" step="0.0001" value={centroidLng} onChange={(e) => setCentroidLng(e.target.value)} className="input-base" placeholder="12.5683" />
            </Field>
          </div>
          {err && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{err}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm hover:bg-muted">Annuller</button>
            <button type="submit" disabled={saving || !name.trim()} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Gemmer…" : initial ? "Gem" : "Opret site"}
            </button>
          </div>
        </form>
        <style>{`
          .input-base { width: 100%; border-radius: 0.75rem; border: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.3); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
          .input-base:focus { box-shadow: 0 0 0 2px hsl(var(--primary) / 0.4); }
        `}</style>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label} {required && <span className="text-destructive">*</span>}</label>
      {children}
    </div>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function SiteDetailDrawer({ site, onClose }: { site: Site; onClose: () => void }) {
  const [relations, setRelations] = useState<SiteRelations | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    let cancelled = false;
    getSiteRelations(site)
      .then((r) => { if (!cancelled) { setRelations(r); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-card w-full max-w-md h-full overflow-auto border-l shadow-xl">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card z-10">
          <div>
            <h2 className="font-semibold text-base">{site.name}</h2>
            <div className="text-xs text-muted-foreground">{site.site_type ?? "—"} · {site.area_ha ?? "—"} ha</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted grid place-items-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {site.status === "archived" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs px-3 py-2">
              Dette site er arkiveret{site.archived_at ? ` (${new Date(site.archived_at).toLocaleDateString("da-DK")})` : ""}.
            </div>
          )}
          {site.description && (
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Beskrivelse</div>
              <p className="text-sm">{site.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Baseline" value={site.baseline_status ?? "—"} />
            <MiniStat label="Areal" value={site.area_ha != null ? `${site.area_ha} ha` : "—"} />
            {site.centroid_lat != null && site.centroid_lng != null && (
              <MiniStat label="Centrum" value={`${site.centroid_lat.toFixed(4)}, ${site.centroid_lng.toFixed(4)}`} />
            )}
            <MiniStat label="Oprettet" value={new Date(site.created_at).toLocaleDateString("da-DK")} />
          </div>

          <RelationSection
            title="Tilknyttede datakilder"
            icon={<Database className="h-4 w-4" />}
            count={relations?.dataSources.length ?? 0}
            loading={loading}
          >
            {relations?.dataSources.length ? (
              <ul className="text-sm divide-y">
                {relations.dataSources.map((d) => (
                  <li key={d.id} className="py-2 flex items-center justify-between">
                    <span className="font-medium">{d.name}</span>
                    <Pill tone="info">{d.status ?? "—"}</Pill>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine text="Ingen datakilder har leveret observationer på dette site endnu." />}
          </RelationSection>

          <RelationSection
            title="Indikatorer"
            icon={<BarChart2 className="h-4 w-4" />}
            count={relations?.indicators.length ?? 0}
            loading={loading}
          >
            {relations?.indicators.length ? (
              <ul className="text-sm divide-y">
                {relations.indicators.map((i) => (
                  <li key={i.id} className="py-2 flex items-center justify-between">
                    <span className="font-medium">{i.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {i.value != null ? `${i.value}${i.unit ? ` ${i.unit}` : ""}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine text="Ingen indikatorer knyttet via observationer endnu." />}
          </RelationSection>

          <RelationSection
            title="Sensorer"
            icon={<Radio className="h-4 w-4" />}
            count={relations?.sensors.length ?? 0}
            loading={loading}
          >
            {relations?.sensors.length ? (
              <ul className="text-sm divide-y">
                {relations.sensors.map((s) => (
                  <li key={s.id} className="py-2 flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    <Pill tone={s.status === "online" ? "success" : "default"}>{s.status ?? "—"}</Pill>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine text="Ingen sensorer registreret på dette site." />}
          </RelationSection>

          <RelationSection
            title="Seneste observationer"
            icon={<Activity className="h-4 w-4" />}
            count={relations?.observations.length ?? 0}
            loading={loading}
          >
            {relations?.observations.length ? (
              <ul className="text-sm divide-y">
                {relations.observations.slice(0, 10).map((o) => (
                  <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="font-medium truncate">{o.indicator_key ?? o.observation_type ?? "obs"}</span>
                    <span className="tabular-nums">{o.value != null ? `${o.value}${o.unit ? ` ${o.unit}` : ""}` : "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.observed_at ? new Date(o.observed_at).toLocaleDateString("da-DK") : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine text="Ingen observationer registreret endnu." />}
          </RelationSection>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

function RelationSection({ title, icon, count, loading, children }: { title: string; icon: React.ReactNode; count: number; loading: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">{icon}</span>
        <div className="text-sm font-medium">{title}</div>
        <Pill tone="info">{loading ? "…" : count}</Pill>
      </div>
      {loading ? <div className="text-xs text-muted-foreground">Henter…</div> : children}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground italic">{text}</div>;
}
