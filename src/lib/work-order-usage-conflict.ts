type DatabaseError = { code?: string; details?: string | null } | null | undefined;

/** A stale usage version and a cancelled job both return HTTP 409, but need different guidance. */
export function workOrderUsageConflict(error: DatabaseError): "changed" | "cancelled" | undefined {
  if (
    error?.code === "40001" ||
    error?.code === "23505" ||
    (error?.code === "PT409" && error.details === "freyra.version_conflict")
  )
    return "changed";
  if (error?.code === "PT409" && !error.details) return "cancelled";
  return undefined;
}
