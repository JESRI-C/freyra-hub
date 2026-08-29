/**
 * Natur-geodata: henter rå §3- og vandløbs-GEOMETRIER fra Miljøportalens åbne
 * WFS (server-side, ingen CORS). En verificeret editor+ kan persistere dem i
 * geo_features + nature_contexts via service-role-klienten, så kortet og
 * get_project_geojson kan vise ægte, gemte lag.
 *
 * Persistering er best-effort: mangler SUPABASE_SERVICE_ROLE_KEY (fx lokal dev)
 * returneres features stadig til kortet — blot med persisted=false.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "@/lib/project-nature-access.server";
import {
  toFeatureCollection,
  buildGeoFeatureRows,
  buildNatureContextRow,
  type NatureFeatureCollection,
  type RawWfsFeature,
} from "@/services/nature-geo-transform";

const MP_WFS = "https://arealdata.miljoeportal.dk/gis/ows";
const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Input = z.object({
  // Postgres accepts the legacy seed UUIDs with version nibble 0; Zod's
  // strict uuid() validator does not. Keep canonical shape validation without
  // breaking the existing offline/preview projects.
  projectId: z.string().regex(POSTGRES_UUID, "Invalid project ID"),
  lat: z.number().gte(54).lte(58),
  lng: z.number().gte(7).lte(16),
});

export type NatureGeoInput = z.infer<typeof Input>;

export function parseNatureGeoInput(raw: unknown): NatureGeoInput {
  return Input.parse(raw);
}

export interface NatureGeoResult {
  paragraph3: NatureFeatureCollection;
  watercourses: NatureFeatureCollection;
  mode: "live" | "preview";
  persisted: boolean;
  persistedCounts: { paragraph3: number; watercourses: number };
}

const EMPTY_FC: NatureFeatureCollection = { type: "FeatureCollection", features: [] };

const P3_TYPES = [
  { code: "p3_soe", label: "Sø" },
  { code: "p3_mose", label: "Mose" },
  { code: "p3_eng", label: "Eng" },
  { code: "p3_hede", label: "Hede" },
  { code: "p3_overdrev", label: "Overdrev" },
  { code: "p3_strandeng", label: "Strandeng" },
];

/**
 * Live-gating for åbne datakilder: de er gratis og nøglefri, så de er slået
 * TIL medmindre ENABLE_LIVE_DATA/VITE_ENABLE_LIVE_DATA er sat eksplicit falsk.
 * (Nøglekrævende connectors gates separat i live-data-config.)
 */
export function isOpenDataLiveEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env["ENABLE_LIVE_DATA"] ?? env["VITE_ENABLE_LIVE_DATA"];
  if (raw === undefined || raw === "") return true;
  const v = raw.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "off" || v === "no");
}

async function safeFetch(url: string, ms = 10000): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchWfsFeatures(
  typeNames: string,
  lat: number,
  lng: number,
  count = 100,
): Promise<RawWfsFeature[]> {
  const delta = 0.02;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames,
    outputFormat: "application/json",
    bbox,
    srsName: "EPSG:4326",
    count: String(count),
  });
  const res = await safeFetch(`${MP_WFS}?${params}`);
  if (!res || !res.ok) return [];
  try {
    const fc = (await res.json()) as { features?: RawWfsFeature[] };
    return fc.features ?? [];
  } catch {
    return [];
  }
}

export interface NatureGeoAdminClient {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        v: unknown,
      ): {
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        limit(n: number): Promise<{ data: unknown; error: unknown }>;
      };
    };
    upsert(
      rows: unknown,
      opts?: { onConflict?: string },
    ): Promise<{ error: { message: string } | null }>;
    update(patch: unknown): { eq(col: string, v: unknown): Promise<{ error: unknown }> };
    insert(rows: unknown): Promise<{ error: { message: string } | null }>;
  };
}

/** Sikrer at et map_layers-lag findes og er markeret live; returnerer id. */
function assertPersistenceSucceeded(error: unknown): void {
  if (error) throw new Error("Nature persistence failed");
}

async function ensureLiveLayer(
  admin: NatureGeoAdminClient,
  slug: string,
  name: string,
  category: string,
): Promise<string | null> {
  const existing = (await admin.from("map_layers").select("id").eq("slug", slug).maybeSingle()) as {
    data: { id: string } | null;
    error: unknown;
  };
  assertPersistenceSucceeded(existing.error);
  if (existing.data?.id) {
    const updated = await admin
      .from("map_layers")
      .update({ status: "live" })
      .eq("id", existing.data.id);
    assertPersistenceSucceeded(updated.error);
    return existing.data.id;
  }
  const inserted = await admin.from("map_layers").upsert(
    [
      {
        slug,
        name,
        category,
        layer_type: "wfs",
        provider: "Danmarks Miljøportal",
        is_active: true,
        status: "live",
      },
    ],
    { onConflict: "slug" },
  );
  assertPersistenceSucceeded(inserted.error);
  const re = (await admin.from("map_layers").select("id").eq("slug", slug).maybeSingle()) as {
    data: { id: string } | null;
    error: unknown;
  };
  assertPersistenceSucceeded(re.error);
  if (!re.data?.id) throw new Error("Nature persistence failed");
  return re.data.id;
}

export async function persistNatureGeoFeatures(
  admin: NatureGeoAdminClient,
  projectId: string,
  requestedBy: string,
  p3: NatureFeatureCollection,
  water: NatureFeatureCollection,
): Promise<{ persisted: boolean; counts: { paragraph3: number; watercourses: number } }> {
  const none = { persisted: false, counts: { paragraph3: 0, watercourses: 0 } };
  try {
    const counts = { paragraph3: 0, watercourses: 0 };

    const p3LayerId = await ensureLiveLayer(
      admin,
      "protected_nature",
      "Beskyttet natur (§3)",
      "nature",
    );
    if (p3LayerId && p3.features.length > 0) {
      const rows = buildGeoFeatureRows(p3LayerId, p3, "paragraph3");
      const { error } = await admin
        .from("geo_features")
        .upsert(rows, { onConflict: "layer_id,external_id" });
      assertPersistenceSucceeded(error);
      counts.paragraph3 = rows.length;
    }

    const waterLayerId = await ensureLiveLayer(admin, "watercourses", "Vandløb", "water");
    if (waterLayerId && water.features.length > 0) {
      const rows = buildGeoFeatureRows(waterLayerId, water, "watercourse");
      const { error } = await admin
        .from("geo_features")
        .upsert(rows, { onConflict: "layer_id,external_id" });
      assertPersistenceSucceeded(error);
      counts.watercourses = rows.length;
    }

    const context = buildNatureContextRow(projectId, {
      paragraph3AreasHa: p3.features.length > 0 ? 1 : 0,
      natureTypes: [
        ...new Set(
          p3.features.map((f) => String(f.properties["natureType"] ?? "")).filter(Boolean),
        ),
      ],
      watercourseCount: water.features.length,
      nearestWatercourseM: null,
      natura2000WithinM: null,
      natura2000Name: null,
    });
    const existing = (await admin
      .from("nature_contexts")
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle()) as { data: { id: string } | null; error: unknown };
    assertPersistenceSucceeded(existing.error);
    if (existing.data?.id) {
      const updated = await admin
        .from("nature_contexts")
        .update(context)
        .eq("id", existing.data.id);
      assertPersistenceSucceeded(updated.error);
    } else {
      const inserted = await admin.from("nature_contexts").insert([context]);
      assertPersistenceSucceeded(inserted.error);
    }

    const logged = await admin.from("connector_fetch_logs").insert([
      {
        connector_id: "miljoeportal-arealdata",
        connector_name: "Danmarks Miljøportal Arealdata",
        project_id: projectId,
        status: counts.paragraph3 + counts.watercourses > 0 ? "success" : "empty",
        summary: `${counts.paragraph3} §3-features og ${counts.watercourses} vandløbsfeatures`,
        fetched_at: new Date().toISOString(),
        metadata: {
          requested_by: requestedBy,
          source_type: "wfs",
          geometry_used: true,
        },
      },
    ]);
    assertPersistenceSucceeded(logged.error);

    return { persisted: true, counts };
  } catch {
    return none;
  }
}

async function loadAdminClient(): Promise<NatureGeoAdminClient | null> {
  try {
    const mod = await import("@/integrations/supabase/client.server");
    return mod.supabaseAdmin as unknown as NatureGeoAdminClient;
  } catch {
    return null;
  }
}

interface NatureGeoCollections {
  paragraph3: NatureFeatureCollection;
  watercourses: NatureFeatureCollection;
}

async function fetchNatureGeoCollections(lat: number, lng: number): Promise<NatureGeoCollections> {
  const [paragraph3, watercourses] = await Promise.all([
    Promise.all(
      P3_TYPES.map(async ({ code, label }) => {
        const feats = await fetchWfsFeatures(`mp:${code}`, lat, lng, 50);
        return toFeatureCollection(feats, {
          idPrefix: code,
          extraProperties: { natureType: label },
        }).features;
      }),
    ).then((groups) => ({ type: "FeatureCollection" as const, features: groups.flat() })),
    fetchWfsFeatures("mp:vandloeb", lat, lng, 100).then((feats) =>
      toFeatureCollection(feats, {
        idPrefix: "vandloeb",
        extraProperties: { natureType: "Vandløb" },
      }),
    ),
  ]);

  return { paragraph3, watercourses };
}

export interface NatureGeoExecutionDependencies {
  isLiveEnabled(): boolean;
  authorizeProject: typeof requireProjectNatureAccess;
  fetchCollections(lat: number, lng: number): Promise<NatureGeoCollections>;
  loadAdminClient(): Promise<NatureGeoAdminClient | null>;
  persist(
    admin: NatureGeoAdminClient,
    projectId: string,
    requestedBy: string,
    paragraph3: NatureFeatureCollection,
    watercourses: NatureFeatureCollection,
  ): Promise<{ persisted: boolean; counts: { paragraph3: number; watercourses: number } }>;
}

const DEFAULT_EXECUTION_DEPENDENCIES: NatureGeoExecutionDependencies = {
  isLiveEnabled: isOpenDataLiveEnabled,
  authorizeProject: requireProjectNatureAccess,
  fetchCollections: fetchNatureGeoCollections,
  loadAdminClient,
  persist: persistNatureGeoFeatures,
};

/**
 * Testbar orchestration. Authorization is always resolved before the WFS call,
 * and the service-role client is only loaded for a verified writer using the
 * project's stored centroid.
 */
export async function executeNatureGeoRequest(
  data: NatureGeoInput,
  userId: string,
  authClient: ProjectAuthorizationClient,
  dependencyOverrides: Partial<NatureGeoExecutionDependencies> = {},
): Promise<NatureGeoResult> {
  const dependencies = { ...DEFAULT_EXECUTION_DEPENDENCIES, ...dependencyOverrides };
  const access = await dependencies.authorizeProject(authClient, userId, data.projectId);

  if (!dependencies.isLiveEnabled()) {
    return {
      paragraph3: EMPTY_FC,
      watercourses: EMPTY_FC,
      mode: "preview",
      persisted: false,
      persistedCounts: { paragraph3: 0, watercourses: 0 },
    };
  }

  const position = access.centroid ?? { lat: data.lat, lng: data.lng };
  const { paragraph3, watercourses } = await dependencies.fetchCollections(
    position.lat,
    position.lng,
  );

  // Low-privilege roles may still consume the public WFS data. Missing or
  // invalid stored geometry also stays read-only, so client coordinates can
  // never seed the shared database cache.
  if (!access.canPersist || !access.centroid) {
    return {
      paragraph3,
      watercourses,
      mode: "live",
      persisted: false,
      persistedCounts: { paragraph3: 0, watercourses: 0 },
    };
  }

  const admin = await dependencies.loadAdminClient();
  if (!admin) {
    return {
      paragraph3,
      watercourses,
      mode: "live",
      persisted: false,
      persistedCounts: { paragraph3: 0, watercourses: 0 },
    };
  }

  const { persisted, counts } = await dependencies.persist(
    admin,
    data.projectId,
    userId,
    paragraph3,
    watercourses,
  );

  return {
    paragraph3,
    watercourses,
    mode: "live",
    persisted,
    persistedCounts: counts,
  };
}

/**
 * Henter §3- og vandløbs-geometrier omkring et punkt og persisterer dem
 * (best-effort). Returnerer FeatureCollections klar til Leaflet.
 */
export const fetchAndIngestNatureGeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseNatureGeoInput)
  .handler(
    async ({ data, context }): Promise<NatureGeoResult> =>
      executeNatureGeoRequest(
        data,
        context.userId,
        context.supabase as unknown as ProjectAuthorizationClient,
      ),
  );
