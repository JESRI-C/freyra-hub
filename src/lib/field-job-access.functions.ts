import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "./project-nature-access.server";

export const getFieldJobAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).strict().parse(raw))
  .handler(async ({ data, context }) => {
    const access = await requireProjectNatureAccess(
      context.supabase as unknown as ProjectAuthorizationClient,
      context.userId,
      data.projectId,
    );
    return {
      projectId: data.projectId,
      userId: context.userId,
      canConfigure: access.canPersist,
      canContribute: access.canPersist || access.role === "field",
    };
  });
