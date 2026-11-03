import { z } from "zod";
import { WorkOrderActionIdSchema, type WorkOrderScope } from "./work-order-access";

const sourceReference = z.object({
  id: z.string().uuid(),
  action_id: WorkOrderActionIdSchema,
  version: z.number().int().positive().max(2147483647),
});
type SourceReference = z.infer<typeof sourceReference>;

function draftKey(actorId: string, scope: WorkOrderScope) {
  return `freyra.follow-up-plan.v1:${actorId}:${scope.organizationId}:${scope.projectId}:${scope.actionId}`;
}

export function readFollowUpSource(actorId: string, scope: WorkOrderScope) {
  try {
    const raw = sessionStorage.getItem(draftKey(actorId, scope));
    return raw ? sourceReference.parse(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function rememberFollowUpSource(
  actorId: string,
  scope: WorkOrderScope,
  source?: SourceReference,
) {
  try {
    const key = draftKey(actorId, scope);
    if (source) {
      sessionStorage.setItem(key, JSON.stringify(sourceReference.parse(source)));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // The in-memory follow-up remains available if session storage is blocked.
  }
}
