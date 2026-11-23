import { z } from "zod";
import { EvidenceOriginalInputSchema, OriginalPinSchema } from "@/lib/work-order-evidence";
import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import {
  checkActor,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";
const ReadSchema = EvidenceOriginalInputSchema.omit({ expectedActorId: true }).extend({
  actorId: z.string().uuid(),
  original: OriginalPinSchema,
});
type Signer = {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        ttl: number,
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};
export async function signWorkOrderEvidenceOriginal(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
  deps?: { signer: () => Promise<Signer>; origin: string },
) {
  return signOriginal(client, actorId, raw, "get_work_order_evidence_original", deps);
}
export async function signWorkOrderCapturedPhotoOriginal(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
  deps?: { signer: () => Promise<Signer>; origin: string },
) {
  return signOriginal(client, actorId, raw, "get_work_order_captured_photo_original", deps);
}
async function signOriginal(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
  rpcName: "get_work_order_evidence_original" | "get_work_order_captured_photo_original",
  deps?: { signer: () => Promise<Signer>; origin: string },
) {
  const i = parseWorkOrderInput(EvidenceOriginalInputSchema, raw);
  checkActor(actorId, i.expectedActorId);
  try {
    const read = async () => {
      const { data, error } = await client.rpc(rpcName, {
        p_id: i.id,
        p_action_id: i.actionId,
        p_organization_id: i.organizationId,
        p_project_id: i.projectId,
      });
      if (error) workOrderRpcFailure(error);
      const parsed = ReadSchema.safeParse(data);
      if (!parsed.success) throw new WorkOrderRequestError("unavailable");
      const r = parsed.data;
      if (
        r.id !== i.id ||
        r.actionId !== i.actionId ||
        r.projectId !== i.projectId ||
        r.organizationId !== i.organizationId ||
        r.actorId !== actorId ||
        r.original.storagePath !== `${i.projectId}/field-uploads/${r.original.uploadId}/original`
      )
        throw new WorkOrderRequestError("access");
      if (
        rpcName === "get_work_order_captured_photo_original" &&
        (r.original.uploadId !== i.id ||
          r.original.workOrder?.actionId !== i.actionId ||
          r.original.workOrder.organizationId !== i.organizationId)
      )
        throw new WorkOrderRequestError("access");
      return r;
    };
    const pin = await read();
    const signer = deps
      ? await deps.signer()
      : (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const result = await signer.storage
      .from("project-media")
      .createSignedUrl(pin.original.storagePath, 60);
    if (result.error || !result.data) throw new WorkOrderRequestError("unavailable");
    const url = new URL(result.data.signedUrl);
    const origin = new URL(deps?.origin ?? process.env.SUPABASE_URL ?? "").origin;
    if (
      url.protocol !== "https:" ||
      url.origin !== origin ||
      decodeURIComponent(url.pathname) !==
        `/storage/v1/object/sign/project-media/${pin.original.storagePath}` ||
      url.username ||
      url.password ||
      url.hash ||
      !url.searchParams.get("token")
    )
      throw new WorkOrderRequestError("unavailable");
    if (JSON.stringify(await read()) !== JSON.stringify(pin))
      throw new WorkOrderRequestError("conflict");
    return { url: url.href, expiresIn: 60, sha256: pin.original.sha256 };
  } catch (error) {
    if (error instanceof WorkOrderRequestError) throw error;
    throw new WorkOrderRequestError("unavailable");
  }
}
