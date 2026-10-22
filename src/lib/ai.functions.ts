import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const SummarizeInput = z.object({
  module: z.string().min(1).max(64),
  context: z.string().min(1).max(4000),
  tone: z.enum(["insight", "action", "risk"]).optional(),
});

export const generateModuleInsight = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SummarizeInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        headline: "AI utilgængelig",
        body: "LOVABLE_API_KEY mangler. Aktivér Lovable AI for at se indsigter.",
        error: true as const,
      };
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system =
      "Du er en ESG- og bæredygtighedsanalytiker for GoFreyra-platformen. " +
      "Du skriver KORTE, konkrete danske indsigter baseret på data. " +
      "Brug aldrig floskler. Maks 2 sætninger. Returnér KUN ren tekst — ingen markdown, ingen lister.";

    const prompt =
      `Modul: ${data.module}\n` +
      `Fokus: ${data.tone ?? "insight"}\n` +
      `Data:\n${data.context}\n\n` +
      `Skriv ét konkret, handlingsorienteret indsigt på dansk (maks 2 sætninger, ~200 tegn). ` +
      `Start med det vigtigste tal eller den vigtigste observation.`;

    try {
      const { text } = await generateText({
        model,
        system,
        prompt,
        maxOutputTokens: 160,
      });

      return {
        headline: "AI-indsigt",
        body: text.trim(),
        error: false as const,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukendt fejl";
      const isRate = /429/.test(message);
      const isCredit = /402/.test(message);
      return {
        headline: isCredit ? "AI-credits opbrugt" : isRate ? "Kortvarig grænse nået" : "AI utilgængelig",
        body: isCredit
          ? "Tilføj credits under Settings → Workspace → Usage for at fortsætte."
          : isRate
            ? "Prøv igen om lidt — for mange forespørgsler på kort tid."
            : "Kunne ikke hente AI-indsigt lige nu.",
        error: true as const,
      };
    }
  });
