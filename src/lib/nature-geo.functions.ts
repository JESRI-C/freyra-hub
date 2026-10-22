/**
 * Natur-geodata: henter rå §3- og vandløbs-GEOMETRIER fra Miljøportalens åbne
 * WFS (server-side, ingen CORS) og persisterer dem i geo_features +
 * nature_contexts via service-role-klienten, så kortet og get_project_geojson
 * kan vise ægte, gemte lag.
 *
 * Persistering er best-effort: mangler SUPABASE_SERVICE_ROLE_KEY (fx lokal dev)
 * returneres features stadig til kortet — blot med persisted=false.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  toFeatureCollection,
  buildGeoFeatureRows,
  buildNatureContextRow,
  type NatureFeatureCollection,
  type RawWfsFeature,
} from "@/services/nature-geo-transform";

const MP_WFS = "https://arealdata.miljoeportal.dk/gis/ows";

const Input = z.object({
  projectId: z.string().min(1).nullable().optional(),
  lat: z.number().gte(54).lte(58),
  lng: z.number().gte(7).lte(16),
});

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
export function isOpenDataLiveEnabled(env: Record<string, string | undefined> = process.env): boolean {
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

async function fetchWfsFeatures(typeNames: string, lat: number, lng: number, count = 100): Promise<RawWfsFeature[]> {
  const delta = 0.02;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`;
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames, outputFormat: "application/json",
    bbox, srsName: "EPSG:4326", count: String(count),
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

interface AdminClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: unknown): { maybeSingle(): Promise<{ data: unknown; error: unknown }>; limit(n: number): Promise<{ data: unknown; error: unknown }> };
    };
    upsert(rows: unknown, opts?: { onConflict?: string }): Promise<{ error: { message: string } | null }>;
    update(patch: unknown): { eq(col: string, v: unknown): Promise<{ error: unknown }> };
    insert(rows: unknown): Promise<{ error: { message: string } | null }>;
  };
}

/** Sikrer at et map_layers-lag findes og er markeret live; returnerer id. */
async function ensureLiveLayer(admin: AdminClient, slug: string, name: string, category: string): Promise<string | null> {
  const existing = (await admin
    .from("map_layers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()) as { data: { id: string } | null };
  if (existing.data?.id) {
    await admin.from("map_layers").update({ status: "live" }).eq("id", existing.data.id);
    return existing.data.id;
  }
  const inserted = await admin.from("map_layers").upsert(
    [{ slug, name, category, layer_type: "wfs", provider: "Danmarks Miljøportal", is_active: true, status: "live" }],
    { onConflict: "slug" },
  );
  if (inserted.error) return null;
  const re = (await admin
    .from("map_layers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()) as { data: { id: string } | null };
  return re.data?.id ?? null;
}

async function persistFeatures(
  projectId: string | null | undefined,
  p3: NatureFeatureCollection,
  water: NatureFeatureCollection,
): Promise<{ persisted: boolean; counts: { paragraph3: number; watercourses: number } }> {
  const none = { persisted: false, counts: { paragraph3: 0, watercourses: 0 } };
  let admin: AdminClient;
  try {
    const mod = await import("@/integrations/supabase/client.server");
    admin = mod.supabaseAdmin as unknown as AdminClient;
    // Proxy-klienten kaster først ved brug — trig et kald for at validere env.
    await admin.from("map_layers").select("id").eq("slug", "__probe__").maybeSingle();
  } catch {
    return none; // Service-role ikke konfigureret — skip persistering.
  }

  try {
    const counts = { paragraph3: 0, watercourses: 0 };

    const p3LayerId = await ensureLiveLayer(admin, "protected_nature", "Beskyttet natur (§3)", "nature");
    if (p3LayerId && p3.features.length > 0) {
      const rows = buildGeoFeatureRows(p3LayerId, p3, "paragraph3");
      const { error } = await admin.from("geo_features").upsert(rows, { onConflict: "layer_id,external_id" });
      if (!error) counts.paragraph3 = rows.length;
    }

    const waterLayerId = await ensureLiveLayer(admin, "watercourses", "Vandløb", "water");
    if (waterLayerId && water.features.length > 0) {
      const rows = buildGeoFeatureRows(waterLayerId, water, "watercourse");
      const { error } = await admin.from("geo_features").upsert(rows, { onConflict: "layer_id,external_id" });
      if (!error) counts.watercourses = rows.length;
    }

    if (projectId) {
      const context = buildNatureContextRow(projectId, {
        paragraph3AreasHa: p3.features.length > 0 ? 1 : 0,
        natureTypes: [...new Set(p3.features.map((f) => String(f.properties["natureType"] ?? "")).filter(Boolean))],
        watercourseCount: water.features.length,
        nearestWatercourseM: null,
        natura2000WithinM: null,
        natura2000Name: null,
      });
      const existing = (await admin
        .from("nature_contexts")
        .select("id")
        .eq("project_id", projectId)
        .maybeSingle()) as { data: { id: string } | null };
      if (existing.data?.id) {
        await admin.from("nature_contexts").update(context).eq("id", existing.data.id);
      } else {
        await admin.from("nature_contexts").insert([context]);
      }

      await admin.from("connector_fetch_logs").insert([
        {
          connector_id: "miljoeportal-arealdata",
          project_id: projectId,
          mode: "live",
          status: counts.paragraph3 + counts.watercourses > 0 ? "success" : "empty",
          latency_ms: 0,
          source_type: "wfs",
          geometry_used: true,
          fetched_at: new Date().toISOString(),
        },
      ]);
    }

    return { persisted: true, counts };
  } catch {
    return none;
  }
}

/**
 * Henter §3- og vandløbs-geometrier omkring et punkt og persisterer dem
 * (best-effort). Returnerer FeatureCollections klar til Leaflet.
 */
export const fetchAndIngestNatureGeo = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }): Promise<NatureGeoResult> => {
    if (!isOpenDataLiveEnabled()) {
      return { paragraph3: EMPTY_FC, watercourses: EMPTY_FC, mode: "preview", persisted: false, persistedCounts: { paragraph3: 0, watercourses: 0 } };
    }

    const [p3Raw, waterRaw] = await Promise.all([
      Promise.all(
        P3_TYPES.map(async ({ code, label }) => {
          const feats = await fetchWfsFeatures(`mp:${code}`, data.lat, data.lng, 50);
          return toFeatureCollection(feats, { idPrefix: code, extraProperties: { natureType: label } }).features;
        }),
      ).then((groups) => ({ type: "FeatureCollection" as const, features: groups.flat() })),
      fetchWfsFeatures("mp:vandloeb", data.lat, data.lng, 100).then((feats) =>
        toFeatureCollection(feats, { idPrefix: "vandloeb", extraProperties: { natureType: "Vandløb" } }),
      ),
    ]);

    const { persisted, counts } = await persistFeatures(data.projectId, p3Raw, waterRaw);

    return {
      paragraph3: p3Raw,
      watercourses: waterRaw,
      mode: "live",
      persisted,
      persistedCounts: counts,
    };
  });
