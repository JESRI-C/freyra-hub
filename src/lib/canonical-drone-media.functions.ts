import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "./project-nature-access.server";
import {
  canonicalDroneMediaReference,
  validateCanonicalDroneMediaRead,
  type CanonicalDroneMediaReference,
} from "@/services/monitoring/canonical-drone-media-reference";
import type { DroneOriginalPromotionWriter } from "./drone-original-promotion.functions";

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
const Input = z.object({ projectId: Uuid, mediaId: Uuid }).strict();
export const CANONICAL_DRONE_URL_TTL_SECONDS = 60;
export interface CanonicalDroneMediaUrl {
  projectId: string;
  mediaId: string;
  signedUrl: string;
  expiresInSeconds: 60;
  originalSha256: string;
  reportEligible: false;
  georeferenced: false;
}
export interface CanonicalDroneMediaClient extends ProjectAuthorizationClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        ttl: number,
      ): Promise<{ data: { signedUrl: string } | null; error: { message?: string } | null }>;
    };
  };
}
export interface CanonicalDroneMediaDependencies {
  authorize: typeof requireProjectNatureAccess;
  loadMedia(
    client: CanonicalDroneMediaClient,
    input: z.infer<typeof Input>,
  ): Promise<CanonicalDroneMediaReference>;
  getReader(): Promise<DroneOriginalPromotionWriter>;
  prepare(
    reader: DroneOriginalPromotionWriter,
    input: z.infer<typeof Input>,
    actorId: string,
    expected: CanonicalDroneMediaReference,
  ): Promise<void>;
  sign(client: CanonicalDroneMediaClient, expected: CanonicalDroneMediaReference): Promise<string>;
}

export async function signCanonicalDroneMedia(
  client: CanonicalDroneMediaClient,
  expected: CanonicalDroneMediaReference,
  supabaseUrl = process.env.SUPABASE_URL,
): Promise<string> {
  if (!supabaseUrl) throw new Error("Serverens Storage-adresse er ikke konfigureret.");
  const { data, error } = await client.storage
    .from("monitoring-uploads")
    .createSignedUrl(expected.file_path, CANONICAL_DRONE_URL_TTL_SECONDS);
  if (error || !data)
    throw new Error("Originalfilen kunne ikke signeres med din aktuelle projektadgang.");
  const url = new URL(data.signedUrl);
  const path = `/storage/v1/object/sign/monitoring-uploads/${expected.file_path.split("/").map(encodeURIComponent).join("/")}`;
  if (
    url.origin !== new URL(supabaseUrl).origin ||
    url.pathname !== path ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("token")
  )
    throw new Error("Storage-adressen matcher ikke den gemte originalreference.");
  return data.signedUrl;
}
const DEFAULT_DEPENDENCIES: CanonicalDroneMediaDependencies = {
  authorize: requireProjectNatureAccess,
  loadMedia: async (client, input) => {
    const { data, error } = await client
      .from("project_media")
      .select("*")
      .eq("id", input.mediaId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    if (error || !data)
      throw new Error("Det kanoniske medie blev ikke fundet med din aktuelle projektadgang.");
    return canonicalDroneMediaReference(data, input.projectId, input.mediaId);
  },
  getReader: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as DroneOriginalPromotionWriter;
  },
  prepare: async (reader, input, actorId, expected) => {
    const { data, error } = await reader.rpc("prepare_project_media_original_read", {
      p_project_id: input.projectId,
      p_media_id: input.mediaId,
      p_actor_id: actorId,
    });
    if (error || !data)
      throw new Error("Originalens aktuelle filversion eller læseadgang kunne ikke bekræftes.");
    validateCanonicalDroneMediaRead(data, expected);
  },
  sign: signCanonicalDroneMedia,
};

export async function executeGetCanonicalDroneMediaUrl(
  raw: z.infer<typeof Input>,
  actorId: string,
  client: CanonicalDroneMediaClient,
  overrides: Partial<CanonicalDroneMediaDependencies> = {},
): Promise<CanonicalDroneMediaUrl> {
  const input = Input.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  await dependencies.authorize(client, actorId, input.projectId);
  const expected = await dependencies.loadMedia(client, input);
  // Reparse the caller-bound row before loading the privileged read client.
  canonicalDroneMediaReference(expected, input.projectId, input.mediaId);
  const reader = await dependencies.getReader();
  await dependencies.prepare(reader, input, actorId, expected);
  const signedUrl = await dependencies.sign(client, expected);
  // Do not return a link if membership/object changed during signing. Already
  // issued links remain bearer URLs until their short TTL, as with other Storage.
  await dependencies.prepare(reader, input, actorId, expected);
  return {
    projectId: input.projectId,
    mediaId: input.mediaId,
    signedUrl,
    expiresInSeconds: 60,
    originalSha256: expected.original_sha256,
    reportEligible: false,
    georeferenced: false,
  };
}
export const getCanonicalDroneMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(({ data, context }) =>
    executeGetCanonicalDroneMediaUrl(
      data,
      context.userId,
      context.supabase as unknown as CanonicalDroneMediaClient,
    ),
  );
