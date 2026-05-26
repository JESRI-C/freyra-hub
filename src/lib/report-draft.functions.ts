import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const DraftInput = z.object({
  reportType: z.string().min(1).max(120),
  projectName: z.string().min(1).max(120),
  audience: z.string().min(1).max(120).optional(),
  context: z.string().min(1).max(6000),
});

const DraftSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  keyFindings: z.array(z.string()).min(2).max(6),
  risks: z.array(z.string()).min(1).max(5),
  recommendations: z.array(z.string()).min(2).max(6),
  nextSteps: z.array(z.string()).min(1).max(5),
});

export type ReportDraft = z.infer<typeof DraftSchema>;

export const generateReportDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DraftInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { error: "missing_key" as const, draft: null };
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system =
      "Du er senior ESG- og bæredygtighedsrapport-forfatter for GoFreyra-platformen. " +
      "Du skriver præcise, professionelle danske rapportudkast med fokus på CSRD/ESRS-niveau " +
      "kvalitet. Alle udsagn skal baseres på de data, der gives. Brug korte, klare sætninger. " +
      "Ingen markdown — kun ren tekst pr. felt.";

    const prompt =
      `Rapporttype: ${data.reportType}\n` +
      `Projekt: ${data.projectName}\n` +
      `Målgruppe: ${data.audience ?? "Ledelse og rapporteringsteam"}\n\n` +
      `Datagrundlag:\n${data.context}\n\n` +
      `Producér et struktureret rapportudkast på dansk.`;

    try {
      const { experimental_output } = await generateText({
        model,
        system,
        prompt,
        maxOutputTokens: 1200,
        experimental_output: Output.object({ schema: DraftSchema }),
      });
      return { error: null, draft: experimental_output as ReportDraft };
    } catch (err) {
      const message = err instanceof Error ? err.message : "ukendt";
      if (/429/.test(message)) return { error: "rate_limit" as const, draft: null };
      if (/402/.test(message)) return { error: "credits" as const, draft: null };
      return { error: "unknown" as const, draft: null };
    }
  });
