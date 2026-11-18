import { z } from "zod";
import { CalendarDate, type ExecutionRevision } from "./action-execution";
import type { WorkspaceEntry } from "./project-workspace";
import { latestEntries } from "./project-workspace";
export const WorkflowFollowupSchema = z
  .object({
    schema: z.literal("freyra.workflow-followup/v1"),
    eventKey: z.string().trim().min(1).max(1000),
    title: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(3000),
    sourceIds: z.array(z.string().uuid()).min(1).max(20),
    status: z.enum(["proposed", "assigned", "dismissed", "completed"]),
    assignee: z.string().trim().max(500).nullable(),
    dueDate: CalendarDate.nullable(),
    notes: z.string().trim().max(2000),
    resolutionReason: z.string().trim().max(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.sourceIds).size !== value.sourceIds.length)
      ctx.addIssue({ code: "custom", message: "Dublerede kildehenvisninger." });
    if (value.status === "assigned" && !value.assignee)
      ctx.addIssue({ code: "custom", message: "En tildelt opgave kræver en ansvarlig." });
    if (["dismissed", "completed"].includes(value.status) && !value.resolutionReason)
      ctx.addIssue({ code: "custom", message: "Afvisning eller afslutning kræver begrundelse." });
  });
export type WorkflowFollowup = z.infer<typeof WorkflowFollowupSchema>;
export type FollowupCandidate = Pick<
  WorkflowFollowup,
  "eventKey" | "title" | "reason" | "sourceIds"
>;
export function executionFollowupCandidates(
  executions: ExecutionRevision[],
  pairedRevisionIds: Set<string>,
): FollowupCandidate[] {
  return executions.flatMap(({ entry, execution: e }) => {
    const result: FollowupCandidate[] = [];
    const add = (code: string, title: string, reason: string) =>
      result.push({
        eventKey: code + ":" + entry.id,
        title,
        reason,
        sourceIds: [entry.id],
      });
    if (e.stage === "performed" && !pairedRevisionIds.has(entry.id))
      add(
        "after-series",
        "Afklar efterserie",
        "Registreret udførelse mangler et fotopar på den aktuelle udførelsesversion.",
      );
    if (e.stage === "performed" && !e.method)
      add(
        "work-method",
        "Afklar faktisk skæremetode",
        "Skæremetoden er ukendt i den registrerede udførelse.",
      );
    if (e.coverage === "unknown")
      add(
        "coverage",
        "Afklar faktisk undersøgelsesdækning",
        "Kamerapositioner dokumenterer ikke undersøgelsesdækning.",
      );
    return result;
  });
}
export function latestWorkflowFollowups(entries: WorkspaceEntry[]) {
  return latestEntries(entries)
    .filter((e) => e.kind === "decision_note" && e.payload.source?.startsWith("workflow-followup:"))
    .map((entry) => {
      const followup = WorkflowFollowupSchema.parse(JSON.parse(entry.payload.decision));
      if (entry.payload.source !== "workflow-followup:" + entry.entry_id)
        throw new Error("Opfølgningens identitet stemmer ikke overens.");
      return { entry, followup };
    });
}
export async function followupEntryId(organizationId: string, projectId: string, eventKey: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        "freyra.workflow-followup/v1:" + organizationId + ":" + projectId + ":" + eventKey,
      ),
    ),
  );
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-" +
    h.slice(12, 16) +
    "-" +
    h.slice(16, 20) +
    "-" +
    h.slice(20)
  );
}
