import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { validateProjectPolygon } from "./geo-service";
import { createObservation } from "./monitoring/observations-service";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SURVEY_ZONE_TYPE = "nature_survey";
export const NATURE_SURVEY_OBSERVATION = "nature_survey";
const title = z.string().trim().min(1, "Angiv et navn eller en betegnelse.").max(160);
const description = z
  .string()
  .trim()
  .min(1, "Beskriv den anvendte metode eller observation.")
  .max(2000);
const surveyClient = (actorId: string) =>
  createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient<Database>;

export async function listNatureSurveyAreas(projectId: string, actorId: string) {
  const { data, error } = await surveyClient(actorId)
    .from("monitoring_zones")
    .select("id,project_id,name,geometry,area_hectares,description,created_at")
    .eq("project_id", projectId)
    .eq("zone_type", SURVEY_ZONE_TYPE)
    .order("name");
  if (error) throw new Error("Naturens undersøgelsesområder kunne ikke indlæses.");
  return data;
}

export async function saveNatureSurveyArea(
  projectId: string,
  actorId: string,
  input: { name: string; method: string; geometry: unknown; hectares: number },
) {
  const geometry = validateProjectPolygon(input.geometry);
  if (!geometry.valid) throw new Error("Tegn et gyldigt polygon på kortet.");
  const { error } = await surveyClient(actorId)
    .from("monitoring_zones")
    .insert({
      project_id: projectId,
      zone_type: SURVEY_ZONE_TYPE,
      name: title.parse(input.name),
      description: description.parse(input.method),
      geometry: geometry.polygon as unknown as Json,
      area_hectares: z.number().finite().nonnegative().parse(input.hectares),
      created_by: actorId,
    });
  if (error) throw new Error("Undersøgelsesområdet kunne ikke gemmes.");
}

export const NatureSurveyObservationSchema = z
  .object({
    zoneId: z.uuid(),
    kind: z.enum(["species", "habitat"]),
    label: title,
    method: description,
    notes: description,
    determination: z.enum(["species", "genus", "group", "uncertain"]).optional(),
  })
  .refine((value) => value.kind !== "species" || value.determination !== undefined, {
    message: "Angiv bestemmelsesniveau for artsfundet.",
  });

export async function saveNatureSurveyObservation(
  projectId: string,
  actorId: string,
  raw: unknown,
) {
  const input = NatureSurveyObservationSchema.parse(raw);
  return createObservation(
    {
      project_id: projectId,
      observer_id: actorId,
      zone_id: input.zoneId,
      observation_type: NATURE_SURVEY_OBSERVATION,
      species_name: input.kind === "species" ? input.label : null,
      notes: input.notes,
      visibility: "zone_only",
      metadata: {
        schema: "freyra.nature-survey/v1",
        kind: input.kind,
        label: input.label,
        method: input.method,
        determination: input.kind === "species" ? (input.determination ?? null) : null,
      },
    },
    actorId,
  );
}
