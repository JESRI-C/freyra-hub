import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiPublicFailure, withBoundedAiGateway } from "./ai-gateway.server";

const ReplySchema = z.object({
  short: z.string().min(1).max(400),
  basis: z.array(z.string().min(1).max(120)).min(1).max(5),
  recommendation: z.string().min(1).max(280),
  uncertainty: z.string().min(1).max(280),
  nextAction: z.string().min(1).max(200),
});

const Input = z.object({
  question: z.string().min(1).max(2000),
  projectName: z.string().min(1).max(200),
  indicators: z
    .array(z.object({ key: z.string().max(120), value: z.number().finite().nullable().optional() }))
    .max(40),
  actions: z
    .array(
      z.object({
        title: z.string().max(300),
        priority: z.string().max(64).nullable().optional(),
        status: z.string().max(64).nullable().optional(),
        due_date: z.string().max(64).nullable().optional(),
      }),
    )
    .max(40),
  sensors: z
    .array(
      z.object({
        label: z.string().max(200),
        type: z.string().max(64),
        status: z.string().max(64),
        batteryPercent: z.number().finite().min(0).max(100),
      }),
    )
    .max(60),
});

export const askDecisionsAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        error: true as const,
        reason: "missing_key" as const,
        reply: null,
      };
    }

    const system =
      "Du er en ESG- og naturkapital-rådgiver i GoFreyra. " +
      "Du giver AI-forslag KUN på dansk, KUN baseret på brugerens indsendte projektdata, som ikke er verificeret her. " +
      "Svarene er ikke faglige godkendelser. " +
      "Hvis data mangler, skal du sige det eksplicit i 'uncertainty'. " +
      "Skriv konkret og kort — ingen floskler, ingen markdown.";

    const context =
      `Projekt: ${data.projectName}\n` +
      `Indikatorer: ${data.indicators.map((i) => `${i.key}=${i.value ?? "n/a"}`).join(", ") || "ingen"}\n` +
      `Åbne handlinger (${data.actions.length}): ${
        data.actions
          .slice(0, 10)
          .map(
            (a) =>
              `${a.title} [${a.priority ?? "?"}/${a.status ?? "?"}${a.due_date ? `, frist ${a.due_date}` : ""}]`,
          )
          .join("; ") || "ingen"
      }\n` +
      `Sensorer (${data.sensors.length}): ${
        data.sensors
          .slice(0, 12)
          .map((s) => `${s.label} (${s.type}, ${s.status}, bat ${s.batteryPercent}%)`)
          .join("; ") || "ingen"
      }`;

    const prompt =
      `Brugerens spørgsmål: "${data.question}"\n\n` +
      `Tilgængelige data:\n${context}\n\n` +
      `Returnér et struktureret svar med felterne short, basis (1-4 datapunkter), recommendation, uncertainty og nextAction.`;

    try {
      const reply = await withBoundedAiGateway(key, async (limits) => {
        const { experimental_output } = await generateText({
          ...limits,
          system,
          prompt,
          experimental_output: Output.object({ schema: ReplySchema }),
          maxOutputTokens: 600,
        });
        return ReplySchema.parse(experimental_output);
      });

      return {
        error: false as const,
        reason: null,
        reply,
      };
    } catch (err) {
      return { error: true as const, reason: aiPublicFailure(err), reply: null };
    }
  });
