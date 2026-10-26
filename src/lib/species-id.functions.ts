/**
 * Species Identification — server functions
 *
 * identifySpeciesFromImage:
 *   Tager et billede (base64 data-URL) og bruger Gemini vision via Lovable AI
 *   gateway til at identificere arter. Returnerer struktureret JSON med
 *   videnskabeligt navn, dansk navn, gruppe og konfidensgrad.
 *
 * Resultatet beriges efterfølgende client-side med GBIF + dansk rødliste.
 */

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiPublicFailure, requireBoundedAiText, withBoundedAiGateway } from "./ai-gateway.server";
import { AI_IMAGE_MAX_DATA_URL_CHARACTERS, isAllowedAiImageDataUrl } from "./ai-image-input";

const IdentifyInput = z.object({
  imageDataUrl: z
    .string()
    .min(32)
    .max(AI_IMAGE_MAX_DATA_URL_CHARACTERS)
    .refine(
      isAllowedAiImageDataUrl,
      "Billedet skal være JPEG, PNG eller WebP som base64-data (maks 2 MB).",
    ),
  hint: z.string().max(200).optional(), // valgfri kontekst, fx "fugl ved vandløb"
});

export interface IdentifiedSpecies {
  scientificName: string;
  danishName: string;
  group: string; // Fugle, Pattedyr, Padder, Planter, Insekter, Svampe …
  confidence: number; // 0-1
  notes?: string;
}

export interface SpeciesIdResult {
  species: IdentifiedSpecies[];
  rawText: string;
  error: boolean;
  message?: string;
}

const SYSTEM_PROMPT =
  "Du er en dansk biolog og naturkonsulent specialiseret i artsbestemmelse. " +
  "Du analyserer feltbilleder fra danske naturprojekter og identificerer arter. " +
  "Returnér KUN gyldig JSON — ingen markdown, ingen forklarende tekst udenom. " +
  'Format: {"species":[{"scientificName":"...","danishName":"...","group":"...","confidence":0.0,"notes":"..."}]}. ' +
  "group skal være én af: Fugle, Pattedyr, Padder, Krybdyr, Fisk, Insekter, Planter, Svampe, Laver, Andet. " +
  "confidence er 0-1. Identificér op til 5 arter, mest sikre først. " +
  'Hvis intet levende kan identificeres, returnér {"species":[]}.';

export const identifySpeciesFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdentifyInput.parse(input))
  .handler(async ({ data }): Promise<SpeciesIdResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        species: [],
        rawText: "",
        error: true,
        message: "LOVABLE_API_KEY mangler — aktivér Lovable AI.",
      };
    }

    const userText =
      "Identificér de arter du kan se på dette billede fra et dansk naturområde." +
      (data.hint ? ` Kontekst: ${data.hint}.` : "") +
      " Returnér kun JSON.";

    try {
      const result = await withBoundedAiGateway(key, async (limits) => {
        const generated = await generateText({
          ...limits,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                // Only validated inline bytes are accepted; no URL download is authorized.
                { type: "image", image: data.imageDataUrl },
              ],
            },
          ],
          maxOutputTokens: 600,
        });
        const text = requireBoundedAiText(generated.text, 4096);
        // Parsing stays inside the deadline and final credential-echo guard.
        // Neither caller uses rawText. Retain the API field without forwarding model
        // text or fields discarded by the species schema.
        return { species: parseSpeciesJson(text), rawText: "" };
      });
      return { ...result, error: false };
    } catch (err) {
      const reason = aiPublicFailure(err);
      const isCredit = reason === "credits";
      const isRate = reason === "rate_limit";
      return {
        species: [],
        rawText: "",
        error: true,
        message: isCredit
          ? "AI-credits opbrugt — tilføj under Settings → Workspace → Usage."
          : isRate
            ? "For mange forespørgsler — prøv igen om lidt."
            : "Kunne ikke analysere billedet lige nu.",
      };
    }
  });

/** Robust parsing af model-output (kan indeholde markdown-fences). */
function parseSpeciesJson(text: string): IdentifiedSpecies[] {
  let cleaned = text.trim();
  // Fjern evt. ```json … ``` fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // Find første { og sidste }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Ugyldigt AI-svar");
  return z
    .object({
      species: z
        .array(
          z.object({
            scientificName: z.string().trim().min(1).max(120),
            danishName: z.string().trim().min(1).max(120),
            group: z.enum([
              "Fugle",
              "Pattedyr",
              "Padder",
              "Krybdyr",
              "Fisk",
              "Insekter",
              "Planter",
              "Svampe",
              "Laver",
              "Andet",
            ]),
            confidence: z.number().finite().min(0).max(1),
            notes: z.string().max(500).optional(),
          }),
        )
        .max(5),
    })
    .parse(JSON.parse(cleaned.slice(start, end + 1))).species;
}
