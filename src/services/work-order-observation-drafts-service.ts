import {
  CreateWorkOrderObservationDraftInputSchema,
  GetWorkOrderObservationDraftInputSchema,
  GetWorkOrderObservationDraftReceiptSchema,
  ListWorkOrderObservationSourcesInputSchema,
  ObservationSourceReceiptSchema,
  WorkOrderObservationOriginSchema,
  type ObservationDraftSource,
  type ObservationSourcePage,
  type WorkOrderObservationOrigin,
} from "@/lib/work-order-observation-drafts";
import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import { checkActor, request, type WorkOrderRequestClient } from "./work-order-access-service";

type Scope = { organizationId: string; projectId: string };
function scope(
  row: { organization_id: string; project_id: string; user_id: string },
  actorId: string,
  input: Scope,
) {
  if (
    row.organization_id !== input.organizationId ||
    row.project_id !== input.projectId ||
    row.user_id !== actorId
  )
    throw new WorkOrderRequestError("access");
}
function sourceScope(sources: ObservationDraftSource[], input: Scope) {
  if (sources.some((source) => source.snapshot.project_id !== input.projectId))
    throw new WorkOrderRequestError("access");
}

export async function listObservationSources(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
): Promise<ObservationSourcePage> {
  const input = parseWorkOrderInput(ListWorkOrderObservationSourcesInputSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = ObservationSourceReceiptSchema.safeParse(
    await request(client, "list_work_order_observation_sources", {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_after_observation_id: input.cursor,
      p_page_size: input.pageSize,
      p_search: input.search,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const page = parsed.data;
  scope(page, actorId, input);
  sourceScope(page.items, input);
  if (page.items.length > input.pageSize + 1) throw new WorkOrderRequestError("unavailable");
  let previous = input.cursor;
  for (const source of page.items) {
    if (previous !== null && source.observation_id <= previous)
      throw new WorkOrderRequestError("unavailable");
    previous = source.observation_id;
  }
  const items = page.items.slice(0, input.pageSize);
  return {
    items,
    nextCursor: page.items.length > input.pageSize ? items.at(-1)!.observation_id : null,
  };
}

export async function createObservationDraft(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
): Promise<WorkOrderObservationOrigin> {
  const input = parseWorkOrderInput(CreateWorkOrderObservationDraftInputSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderObservationOriginSchema.safeParse(
    await request(client, "create_work_order_observation_draft", {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_title: input.title,
      p_description: input.description,
      p_sources: input.sources,
      p_request_id: input.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const origin = parsed.data;
  scope(origin, actorId, input);
  sourceScope(origin.sources, input);
  if (origin.action_id !== input.actionId) throw new WorkOrderRequestError("access");
  if (
    origin.request_id !== input.requestId ||
    origin.created_by !== actorId ||
    origin.title !== input.title ||
    origin.description !== input.description ||
    origin.sources.length !== input.sources.length
  )
    throw new WorkOrderRequestError("unavailable");
  const hashes = new Map(input.sources.map((source) => [source.observationId, source.sourceHash]));
  if (origin.sources.some((source) => hashes.get(source.observation_id) !== source.source_hash))
    throw new WorkOrderRequestError("unavailable");
  // The server hashes source metadata. This client does not recompute it or
  // interpret a matching source hash as verification of referenced file bytes.
  return origin;
}

export async function getObservationDraft(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
): Promise<WorkOrderObservationOrigin | null> {
  const input = parseWorkOrderInput(GetWorkOrderObservationDraftInputSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = GetWorkOrderObservationDraftReceiptSchema.safeParse(
    await request(client, "get_work_order_observation_draft", {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const receipt = parsed.data;
  scope(receipt, actorId, input);
  if (receipt.action_id !== input.actionId) throw new WorkOrderRequestError("access");
  if (receipt.origin) {
    scope(receipt.origin, actorId, input);
    if (receipt.origin.action_id !== input.actionId) throw new WorkOrderRequestError("access");
    sourceScope(receipt.origin.sources, input);
  }
  return receipt.origin;
}
