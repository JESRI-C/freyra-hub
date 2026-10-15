import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiPublicFailure, requireBoundedAiText, withBoundedAiGateway } from "./ai-gateway.server";

const DraftInput = z.object({
  reportType: z.string().min(1).max(120),
  projectName: z.string().min(1).max(120),
  audience: z.string().min(1).max(120).optional(),
  context: z.string().min(1).max(6000),
});

const DraftSchema = z.object({
  title: z.string().min(1).max(200),
  executiveSummary: z.string().min(1).max(2000),
  keyFindings: z.array(z.string().min(1).max(600)).min(2).max(6),
  risks: z.array(z.string().min(1).max(600)).min(1).max(5),
  recommendations: z.array(z.string().min(1).max(600)).min(2).max(6),
  nextSteps: z.array(z.string().min(1).max(600)).min(1).max(5),
});

export type ReportDraft = z.infer<typeof DraftSchema>;

export const generateReportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DraftInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { error: "missing_key" as const, draft: null };
    }

    const system =
      "Du er senior ESG- og bæredygtighedsrapport-forfatter for GoFreyra-platformen. " +
      "Du skriver danske AI-rapportudkast ud fra brugerens indsendte data, som ikke er verificeret her. " +
      "Udkastet er ikke fagligt godkendt eller dokumentation for CSRD/ESRS-overholdelse. " +
      "Alle udsagn skal baseres på de data, der gives, og datamangler skal fremgå. Brug korte, klare sætninger. " +
      "Ingen markdown — kun ren tekst pr. felt.";

    const prompt =
      `Rapporttype: ${data.reportType}\n` +
      `Projekt: ${data.projectName}\n` +
      `Målgruppe: ${data.audience ?? "Ledelse og rapporteringsteam"}\n\n` +
      `Datagrundlag:\n${data.context}\n\n` +
      `Producér et struktureret rapportudkast på dansk.`;

    try {
      const draft = await withBoundedAiGateway(key, async (limits) => {
        const { experimental_output } = await generateText({
          ...limits,
          system,
          prompt,
          maxOutputTokens: 1200,
          experimental_output: Output.object({ schema: DraftSchema }),
        });
        const parsed = DraftSchema.parse(experimental_output);
        requireBoundedAiText(JSON.stringify(parsed));
        return parsed;
      });
      return { error: null, draft };
    } catch (err) {
      return { error: aiPublicFailure(err), draft: null };
    }
  });
