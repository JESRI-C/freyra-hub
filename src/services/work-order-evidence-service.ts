import { z } from "zod";
import {
  EvidencePageSchema,
  EvidenceSourcesSchema,
  EvidenceVersionSchema,
  EvidenceSourceSchema,
  SaveEvidenceSchema,
} from "@/lib/work-order-evidence";
import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import {
  checkActor,
  checkScope,
  request,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";
export async function saveWorkOrderEvidence(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const i = parseWorkOrderInput(SaveEvidenceSchema, raw);
  checkActor(actorId, i.expectedActorId);
  const parsed = EvidenceVersionSchema.safeParse(
    await request(client, "save_work_order_evidence", {
      p_action_id: i.actionId,
      p_organization_id: i.organizationId,
      p_project_id: i.projectId,
      p_evidence_id: i.evidenceId,
      p_expected_version: i.expectedVersion,
      p_observation_version_id: i.observationVersionId,
      p_upload_id: i.uploadId,
      p_execution_revision_id: i.executionRevisionId,
      p_state: i.state,
      p_reason: i.reason,
      p_request_id: i.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const r = parsed.data;
  checkScope(r, i);
  if (
    r.created_by !== actorId ||
    r.request_id !== i.requestId ||
    r.evidence_id !== i.evidenceId ||
    r.version !== i.expectedVersion + 1 ||
    r.observation_version_id !== i.observationVersionId ||
    r.upload_id !== i.uploadId ||
    r.execution_revision_id !== i.executionRevisionId ||
    r.state !== i.state ||
    r.reason !== i.reason
  )
    throw new WorkOrderRequestError("unavailable");
  return r;
}
async function page<T extends { id: string }>(
  client: WorkOrderRequestClient,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
  afterId: string | null,
  size: number,
  check: (row: T) => void,
) {
  const { data, error } = await client.rpc(name, args);
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > size + 1)
    throw new WorkOrderRequestError("unavailable");
  let previous = afterId ?? "";
  const rows = data.map((raw) => {
    const result = schema.safeParse(raw);
    if (!result.success || result.data.id <= previous)
      throw new WorkOrderRequestError("unavailable");
    check(result.data);
    previous = result.data.id;
    return result.data;
  });
  return { items: rows.slice(0, size), nextAfterId: rows.length > size ? rows[size - 1].id : null };
}
export async function listWorkOrderEvidence(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const i = parseWorkOrderInput(EvidencePageSchema, raw);
  checkActor(actorId);
  return page(
    client,
    "list_work_order_evidence",
    {
      p_action_id: i.actionId,
      p_organization_id: i.organizationId,
      p_project_id: i.projectId,
      p_after_id: i.afterId,
      p_page_size: i.pageSize,
    },
    EvidenceVersionSchema,
    i.afterId,
    i.pageSize,
    (row) => checkScope(row, i),
  );
}
export async function listWorkOrderEvidenceSources(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const i = parseWorkOrderInput(EvidenceSourcesSchema, raw);
  checkActor(actorId);
  return page(
    client,
    "list_work_order_evidence_sources",
    {
      p_action_id: i.actionId,
      p_organization_id: i.organizationId,
      p_project_id: i.projectId,
      p_kind: i.kind,
      p_after_id: i.afterId,
      p_page_size: i.pageSize,
    },
    EvidenceSourceSchema,
    i.afterId,
    i.pageSize,
    (r) => {
      if (i.kind === "photo" ? !r.sha256 || r.version !== null : !r.version || r.sha256 !== null)
        throw new WorkOrderRequestError("unavailable");
    },
  );
}
