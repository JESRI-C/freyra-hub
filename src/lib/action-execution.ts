import { z } from "zod";
import { latestEntries, type WorkspaceEntry } from "./project-workspace";

const optionalText = z.string().trim().max(2000).nullable();
export const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Angiv en gyldig kalenderdato.");

/** Actual execution is a separate statement from an action's planned status. */
export const ActionExecutionSchema = z
  .object({
    schema: z.literal("freyra.action-execution/v1"),
    actionId: z.string().uuid(),
    surveyRoundId: z.string().uuid().nullable(),
    dataBasis: z.enum(["real", "synthetic", "demo"]),
    workType: z.enum(["weed_cutting", "other"]),
    stage: z.enum(["planned", "performed"]),
    actualDate: CalendarDate.nullable(),
    actualEndDate: CalendarDate.nullable(),
    method: optionalText,
    reach: z.string().trim().max(2000),
    performedBy: optionalText,
    sourceReference: z.string().trim().max(2000),
    evidenceIds: z.array(z.string().uuid()).max(20),
    deviation: z.string().trim().max(2000),
    correctionReason: z.string().trim().max(2000),
    coverage: z.enum(["unknown", "limited", "documented"]),
    coverageDescription: z.string().trim().max(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (new Set(value.evidenceIds).size !== value.evidenceIds.length)
      issue("evidenceIds", "Vælg hvert bilag én gang.");
    if (value.actualEndDate && (!value.actualDate || value.actualEndDate < value.actualDate))
      issue("actualEndDate", "Slutdato kræver en startdato og må ikke ligge før den.");
    if (value.stage === "planned" && (value.actualDate || value.actualEndDate))
      issue("actualDate", "Planlagt arbejde har ingen faktisk udførelsesdato.");
    if (value.stage === "performed") {
      if (!value.actualDate) issue("actualDate", "Udført arbejde kræver faktisk dato.");
      if (!value.sourceReference) issue("sourceReference", "Angiv kilden til udførelsen.");
      if (!value.reach) issue("reach", "Angiv den udførte delstrækning.");
    }
    if (value.coverage !== "unknown" && !value.coverageDescription)
      issue("coverageDescription", "Beskriv faktisk dækning og begrænsninger.");
  });
export type ActionExecution = z.infer<typeof ActionExecutionSchema>;
export const executionSource = (actionId: string) => "action-execution:" + actionId;
export function emptyExecution(actionId: string): ActionExecution {
  return {
    schema: "freyra.action-execution/v1",
    actionId,
    surveyRoundId: null,
    dataBasis: "real",
    workType: "weed_cutting",
    stage: "planned",
    actualDate: null,
    actualEndDate: null,
    method: null,
    reach: "",
    performedBy: null,
    sourceReference: "",
    evidenceIds: [],
    deviation: "",
    correctionReason: "",
    coverage: "unknown",
    coverageDescription: "",
  };
}
export type ExecutionRevision = { entry: WorkspaceEntry; execution: ActionExecution };
export function executionRevisions(entries: WorkspaceEntry[]): ExecutionRevision[] {
  return entries
    .filter((e) => e.kind === "decision_note" && e.payload.source?.startsWith("action-execution:"))
    .map((entry) => {
      const execution = ActionExecutionSchema.parse(JSON.parse(entry.payload.decision));
      if (
        entry.payload.source !== executionSource(execution.actionId) ||
        entry.entry_id !== execution.actionId
      )
        throw new Error("Udførelsens kilde og handling stemmer ikke overens.");
      return { entry, execution };
    });
}
export function latestExecutions(entries: WorkspaceEntry[]): ExecutionRevision[] {
  return executionRevisions(latestEntries(entries));
}
export function executionGaps(execution: ActionExecution): string[] {
  return [
    ...(execution.stage !== "performed" ? ["Faktisk udførelse er ikke registreret."] : []),
    ...(!execution.method ? ["Skæremetode er uafklaret."] : []),
    ...(!execution.performedBy ? ["Udførende er uafklaret."] : []),
    ...(execution.coverage === "unknown" ? ["Faktisk dækning er ukendt."] : []),
  ];
}
