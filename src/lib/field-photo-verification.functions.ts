import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FieldPhotoVerificationInput, fieldPhotoVerificationForActor } from "./field-photo-upload";
import type { RequestClient } from "@/services/field-photo-verification.server";

export const verifyFieldPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FieldPhotoVerificationInput.parse(raw))
  .handler(async ({ data, context }) => {
    const input = fieldPhotoVerificationForActor(data, context.userId);
    const { executeVerifyFieldPhoto } = await import("@/services/field-photo-verification.server");
    return executeVerifyFieldPhoto(
      input,
      context.userId,
      context.supabase as unknown as RequestClient,
    );
  });
