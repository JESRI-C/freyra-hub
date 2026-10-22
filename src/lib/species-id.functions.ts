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
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const IdentifyInput = z.object({
  imageDataUrl: z.string().min(32), // data:image/jpeg;base64,...
  hint: z.string().max(200).optional(), // valgfri kontekst, fx "fugl ved vandløb"
});

export interface IdentifiedSpecies {
  scientificName: string;
  danishName: string;
  group: string;        // Fugle, Pattedyr, Padder, Planter, Insekter, Svampe …
  confidence: number;   // 0-1
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
  "Format: {\"species\":[{\"scientificName\":\"...\",\"danishName\":\"...\",\"group\":\"...\",\"confidence\":0.0,\"notes\":\"...\"}]}. " +
  "group skal være én af: Fugle, Pattedyr, Padder, Krybdyr, Fisk, Insekter, Planter, Svampe, Laver, Andet. " +
  "confidence er 0-1. Identificér op til 5 arter, mest sikre først. " +
  "Hvis intet levende kan identificeres, returnér {\"species\":[]}.";

export const identifySpeciesFromImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdentifyInput.parse(input))
  .handler(async ({ data }): Promise<SpeciesIdResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { species: [], rawText: "", error: true, message: "LOVABLE_API_KEY mangler — aktivér Lovable AI." };
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const userText =
      "Identificér de arter du kan se på dette billede fra et dansk naturområde." +
      (data.hint ? ` Kontekst: ${data.hint}.` : "") +
      " Returnér kun JSON.";

    try {
      const { text } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              // AI SDK accepterer image som data-URL eller URL
              { type: "image", image: data.imageDataUrl },
            ],
          },
        ],
        maxOutputTokens: 600,
      });

      const parsed = parseSpeciesJson(text);
      return { species: parsed, rawText: text, error: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukendt fejl";
      const isCredit = /402/.test(message);
      const isRate = /429/.test(message);
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
  if (start === -1 || end === -1) return [];

  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as { species?: unknown };
    if (!Array.isArray(obj.species)) return [];
    return obj.species
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({
        scientificName: String(s["scientificName"] ?? "").trim(),
        danishName: String(s["danishName"] ?? s["scientificName"] ?? "Ukendt").trim(),
        group: String(s["group"] ?? "Andet").trim(),
        confidence: typeof s["confidence"] === "number" ? Math.max(0, Math.min(1, s["confidence"])) : 0.5,
        notes: s["notes"] ? String(s["notes"]).trim() : undefined,
      }))
      .filter((s) => s.scientificName.length > 0);
  } catch {
    return [];
  }
}
