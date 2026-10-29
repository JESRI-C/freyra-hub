import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FieldPhotoUuid } from "./field-photo-upload";
import type { RequestClient } from "@/services/field-photo-verification.server";

const Input = z.object({ projectId: FieldPhotoUuid, uploadId: FieldPhotoUuid }).strict();
export const verifyFieldPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const { executeVerifyFieldPhoto } = await import("@/services/field-photo-verification.server");
    return executeVerifyFieldPhoto(
      data,
      context.userId,
      context.supabase as unknown as RequestClient,
    );
  });
