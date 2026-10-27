import { supabase } from "@/lib/supabase/client";
import {
  validateCenterline,
  validateSegments,
  centerlineLength,
  WATERCOURSE_METHOD,
  type WatercourseVersion,
  type WatercourseSegment,
} from "./watercourse-geometry";
// New additive table has its own narrow contract until generated database types are refreshed.
function table() {
  if (!supabase) throw new Error("Database ikke konfigureret");
  return supabase.from("watercourse_versions" as never);
}
export async function getWatercourseVersions(
  projectId: string,
  organizationId: string,
): Promise<WatercourseVersion[]> {
  const { data, error } = await table()
    .select("*")
    .eq("project_id", projectId)
    .eq("organization_id", organizationId)
    .order("version", { ascending: false });
  if (error) throw error;
  return data as unknown as WatercourseVersion[];
}
export async function saveWatercourseVersion(input: {
  projectId: string;
  organizationId: string;
  version: number;
  geometry: unknown;
  direction: WatercourseVersion["direction"];
  source: string;
  segments: WatercourseSegment[];
}): Promise<WatercourseVersion> {
  const geometry = validateCenterline(input.geometry);
  const lengthM = centerlineLength(geometry);
  validateSegments(input.segments, lengthM);
  if (!input.source.trim()) throw new Error("Angiv linjens datakilde.");
  const { data, error } = await table()
    .insert({
      project_id: input.projectId,
      organization_id: input.organizationId,
      version: input.version,
      geometry,
      crs: "EPSG:4326",
      direction: input.direction,
      source: input.source.trim(),
      length_m: lengthM,
      method: WATERCOURSE_METHOD,
      segments: input.segments,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Versionen blev ikke gemt.");
  return data as unknown as WatercourseVersion;
}
