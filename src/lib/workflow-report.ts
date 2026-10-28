import { z } from "zod";
import { WorkspaceEntrySchema } from "./project-workspace";
import { ActionExecutionSchema } from "./action-execution";
import { PhotoComparisonSchema } from "./photo-comparison";
import { WorkflowFollowupSchema } from "./workflow-followup";
const Uuid = z.string().uuid();
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Snapshot = z
  .object({ id: Uuid, sha256: Hash, manifest: z.record(z.string(), z.unknown()) })
  .strict();
export const WorkflowReportSnapshotSchema = z
  .object({
    schema: z.literal("freyra.workflow-report/v1"),
    generatorVersion: z.literal("workflow-report/v1"),
    projectId: Uuid,
    organizationId: Uuid,
    dataBasis: z.enum(["real", "synthetic"]),
    inputs: z.array(WorkspaceEntrySchema).min(1).max(300),
    baselines: z.array(Snapshot).max(20),
    plans: z.array(Snapshot).max(20),
    rounds: z
      .array(z.object({ id: Uuid, sha256: Hash, baselineId: Uuid, planId: Uuid }).strict())
      .max(20),
    limitations: z.array(z.string().max(3000)).max(100),
    review: z
      .object({
        scope: z.literal("documentation"),
        decision: z.enum(["accepted", "changes_requested"]),
        inputIds: z.array(Uuid).max(300),
        reason: z.string().trim().min(1).max(3000),
        sectionTexts: z.record(z.string(), z.string()),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(snapshot.inputs.map((e) => e.id)).size !== snapshot.inputs.length)
      issue("Dublerede inputversioner.");
    for (const entry of snapshot.inputs) {
      if (
        entry.project_id !== snapshot.projectId ||
        entry.organization_id !== snapshot.organizationId ||
        entry.kind !== "decision_note"
      )
        issue("Fremmed input i rapportgrundlaget.");
      try {
        const value = JSON.parse(entry.payload.decision);
        if (entry.payload.source.startsWith("action-execution:")) {
          const execution = ActionExecutionSchema.parse(value);
          if (entry.payload.source !== "action-execution:" + execution.actionId)
            issue("Ugyldig udførelsesreference.");
          if (snapshot.dataBasis === "real" && execution.dataBasis !== "real")
            issue("Eksempeldata må ikke indgå i kunderapport.");
        } else if (entry.payload.source.startsWith("photo-comparison:")) {
          const comparison = PhotoComparisonSchema.parse(value);
          if (
            entry.payload.source !== "photo-comparison:" + comparison.comparisonId ||
            !snapshot.inputs.some((e) => e.id === comparison.executionRevisionId)
          )
            issue("Sammenligningens udførelsesversion mangler.");
        } else if (entry.payload.source.startsWith("workflow-followup:")) {
          WorkflowFollowupSchema.parse(value);
          if (entry.payload.source !== "workflow-followup:" + entry.entry_id)
            issue("Ugyldig opfølgningsreference.");
        } else issue("Ukendt workflowkilde.");
      } catch {
        issue("Ugyldigt workflowinput.");
      }
    }
    if (
      snapshot.review &&
      (snapshot.review.inputIds.length !== snapshot.inputs.length ||
        new Set(snapshot.review.inputIds).size !== snapshot.review.inputIds.length ||
        snapshot.inputs.some((e) => !snapshot.review!.inputIds.includes(e.id)))
    )
      issue("Reviewet omfatter ikke præcis disse inputversioner.");
  });
export type WorkflowReportSnapshot = z.infer<typeof WorkflowReportSnapshotSchema>;
