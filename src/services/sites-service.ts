import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Site, Observation, Sensor, DataSource, Indicator } from "@/lib/supabase/types";
import { logAuditEvent } from "@/services/audit-service";

type UnsafeClient = {
  from: (t: string) => {
    insert: (v: Record<string, unknown>) => {
      select: (cols: string) => { single: () => Promise<{ data: Site | null; error: { message: string } | null }> };
    };
    update: (v: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order?: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      } & Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

function client(): UnsafeClient {
  if (!isSupabaseConfigured || !supabase) throw new Error("Backend ikke konfigureret");
  return supabase as unknown as UnsafeClient;
}

export type SiteInput = {
  project_id: string;
  name: string;
  site_type?: string | null;
  area_ha?: number | null;
  description?: string | null;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
  baseline_status?: string | null;
  geometry_geojson?: Record<string, unknown> | null;
};

export async function createSite(input: SiteInput): Promise<Site> {
  const db = client();
  const { data, error } = await db
    .from("sites")
    .insert({ ...input, status: "active" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ingen data returneret");
  void logAuditEvent({
    project_id: input.project_id,
    event_type: "site_created",
    title: `Site oprettet: ${input.name}`,
    actor: "Bruger",
    source: "manual",
  });
  return data;
}

export async function updateSite(id: string, projectId: string, patch: Partial<SiteInput>): Promise<void> {
  const db = client();
  const { error } = await db.from("sites").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  void logAuditEvent({
    project_id: projectId,
    event_type: "site_updated",
    title: `Site opdateret`,
    actor: "Bruger",
    source: "manual",
  });
}

export async function archiveSite(id: string, projectId: string): Promise<void> {
  const db = client();
  const { error } = await db
    .from("sites")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  void logAuditEvent({
    project_id: projectId,
    event_type: "site_archived",
    title: `Site arkiveret`,
    actor: "Bruger",
    source: "manual",
  });
}

export async function unarchiveSite(id: string, projectId: string): Promise<void> {
  const db = client();
  const { error } = await db
    .from("sites")
    .update({ status: "active", archived_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  void logAuditEvent({
    project_id: projectId,
    event_type: "site_unarchived",
    title: `Site genaktiveret`,
    actor: "Bruger",
    source: "manual",
  });
}

// ─── Site relations ───────────────────────────────────────────────────────────

export type SiteRelations = {
  observations: Observation[];
  sensors: Sensor[];
  dataSources: DataSource[];
  indicators: Indicator[];
};

export async function getSiteRelations(site: Site): Promise<SiteRelations> {
  if (!isSupabaseConfigured || !supabase) {
    return { observations: [], sensors: [], dataSources: [], indicators: [] };
  }
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, val: string) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
  const [obs, sens] = await Promise.all([
    db.from("observations").select("*").eq("site_id", site.id),
    db.from("sensors").select("*").eq("site_id", site.id),
  ]);
  const observations = (obs.data ?? []) as Observation[];
  const sensors = (sens.data ?? []) as Sensor[];
  // Derive data sources & indicators referenced by observations
  const sourceIds = Array.from(new Set(observations.map((o) => o.source_id).filter(Boolean))) as string[];
  const indicatorKeys = Array.from(new Set(observations.map((o) => o.indicator_key).filter(Boolean))) as string[];
  let dataSources: DataSource[] = [];
  let indicators: Indicator[] = [];
  if (site.project_id) {
    const [ds, ind] = await Promise.all([
      db.from("data_sources").select("*").eq("project_id", site.project_id),
      db.from("indicators").select("*").eq("project_id", site.project_id),
    ]);
    dataSources = ((ds.data ?? []) as DataSource[]).filter((d) => sourceIds.includes(d.id));
    indicators = ((ind.data ?? []) as Indicator[]).filter((i) => indicatorKeys.includes(i.key));
  }
  return { observations, sensors, dataSources, indicators };
}
