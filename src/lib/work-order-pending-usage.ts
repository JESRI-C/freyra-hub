import { z } from "zod";

type UsageScope = {
  actorId: string;
  organizationId: string;
  projectId: string;
  actionId: string;
};

export function pendingUsageKey(kind: "time" | "material", scope: UsageScope) {
  return [
    "freyra.pending-usage.v1",
    kind,
    scope.actorId,
    scope.organizationId,
    scope.projectId,
    scope.actionId,
  ].join(":");
}

export const usageAttempt = z.object({ id: z.string().uuid() });

export function readPendingUsage<T>(key: string, schema: z.ZodType<T>): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return schema.parse(JSON.parse(raw));
  } catch {
    // Saving checks the same slot again and reports unavailable storage to the user.
  }
}

export function storePendingUsage<T extends { id: string }>(
  key: string,
  schema: z.ZodType<T>,
  pending: T,
) {
  try {
    const serialized = JSON.stringify(schema.parse(pending));
    const raw = localStorage.getItem(key);
    if (raw !== null && JSON.stringify(schema.parse(JSON.parse(raw))) !== serialized)
      throw new Error(
        "En anden fane har en ubekræftet registrering. Åbn jobbet igen for at fortsætte.",
      );
    localStorage.setItem(key, serialized);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("En anden fane")) throw error;
    throw new Error("Telefonen kunne ikke gemme registreringen lokalt. Behold fanen åben.");
  }
}

export function clearPendingUsage(key: string, id: string) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null && usageAttempt.parse(JSON.parse(raw)).id === id) localStorage.removeItem(key);
  } catch {
    // A surviving attempt retains the same id and can be verified again after reload.
  }
}
