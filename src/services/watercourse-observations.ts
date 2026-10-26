import { supabase } from "@/lib/supabase/client";
export type ObservationKind = "vegetation" | "water" | "tree" | "species" | "recommendation";
export interface PhotoComparison {
  beforeId: string;
  afterId: string | null;
  beforeLight: string | null;
  afterLight: string | null;
}
export function comparisonSelection(comparison: PhotoComparison) {
  return {
    beforeId: comparison.beforeId,
    afterId: comparison.afterId ?? "",
    beforeLight: comparison.beforeLight ?? "",
    afterLight: comparison.afterLight ?? "",
  };
}
export interface WatercourseObservation {
  id: string;
  project_id: string;
  organization_id: string;
  centerline_version_id: string;
  segment_id: string;
  kind: ObservationKind;
  text: string;
  feature_key: string;
  source_ids: string[];
  determination_level: "observed" | "screening" | "species_suggestion";
  quality_flags: string[];
  comparison: PhotoComparison | null;
  created_at: string;
  created_by: string;
  watercourse_observation_reviews: { approved_at: string; approved_by: string } | null;
}
function db() {
  if (!supabase) throw new Error("Database ikke konfigureret.");
  return supabase;
}
export async function listWatercourseObservations(
  projectId: string,
  organizationId: string,
): Promise<WatercourseObservation[]> {
  const { data, error } = await db()
    .from("watercourse_observations" as never)
    .select("*, watercourse_observation_reviews(approved_at,approved_by)")
    .eq("project_id", projectId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as WatercourseObservation[];
}
export function validateObservation(
  input: Pick<
    WatercourseObservation,
    "source_ids" | "text" | "feature_key" | "kind" | "determination_level"
  > & { comparison?: PhotoComparison | null },
) {
  if (!input.text.trim() || !input.feature_key.trim())
    throw new Error("Beskrivelse og entydigt objektmærke skal udfyldes.");
  if (!input.source_ids.length || new Set(input.source_ids).size !== input.source_ids.length)
    throw new Error("Vælg unikke kildefotos.");
  if (input.comparison) {
    const pair = input.comparison;
    if (
      !input.source_ids.includes(pair.beforeId) ||
      (pair.afterId != null &&
        (!input.source_ids.includes(pair.afterId) || pair.afterId === pair.beforeId))
    )
      throw new Error(
        "Fotoparrets før/efter-fotos skal være forskellige og indgå i observationens kilder.",
      );
    const lights = [null, "Overskyet", "Sol", "Skygge"];
    if (!lights.includes(pair.beforeLight) || !lights.includes(pair.afterLight))
      throw new Error("Ukendte lysforhold.");
    if (pair.afterId == null && pair.afterLight != null)
      throw new Error("Lysforhold for efterfoto kræver et efterfoto.");
  }
  if (input.kind === "species" && input.determination_level !== "species_suggestion")
    throw new Error("Artsbestemmelse registreres som forslag indtil faglig godkendelse.");
}
export async function createWatercourseObservation(
  input: Omit<
    WatercourseObservation,
    "id" | "created_at" | "created_by" | "watercourse_observation_reviews"
  >,
) {
  validateObservation(input);
  const { data, error } = await db()
    .from("watercourse_observations" as never)
    .insert(input as never)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Observation blev ikke gemt.");
  return data as unknown as WatercourseObservation;
}
export async function approveWatercourseObservation(id: string) {
  const { data, error } = await db()
    .from("watercourse_observation_reviews" as never)
    .insert({ observation_id: id } as never)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Godkendelsen blev ikke gemt.");
}
