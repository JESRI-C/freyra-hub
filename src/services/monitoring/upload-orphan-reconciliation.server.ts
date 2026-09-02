// Trusted server-only cleanup for cancelled or expired upload intents.
// Storage objects are removed through the Storage API; database RPCs only
// claim and acknowledge the exact object identity.

export const MONITORING_UPLOAD_BUCKET = "monitoring-uploads";
export const DEFAULT_ORPHAN_RECONCILIATION_LIMIT = 25;
export const MAX_ORPHAN_RECONCILIATION_LIMIT = 100;
export const DEFAULT_ORPHAN_LEASE_SECONDS = 300;
export const MIN_ORPHAN_LEASE_SECONDS = 30;
export const MAX_ORPHAN_LEASE_SECONDS = 3_600;

const MAX_RECORDED_ERROR_LENGTH = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXACT_INTENT_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/intents\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/[a-zA-Z0-9._-]{1,180}$/i;

interface RpcError {
  message?: string;
}

interface StorageRemoveResult {
  error: unknown | null;
}

export interface UploadOrphanReconciliationClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<StorageRemoveResult>;
    };
  };
}

interface UploadOrphanClaim {
  upload_id: string;
  storage_path: string;
  claim_token: string;
}

export interface UploadOrphanReconciliationItem {
  uploadId: string | null;
  outcome: "deleted" | "failed";
  error?: string;
}

export interface UploadOrphanReconciliationResult {
  claimed: number;
  deleted: number;
  failed: number;
  items: UploadOrphanReconciliationItem[];
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value as number)));
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown reconciliation error";
}

/**
 * Produces a bounded diagnostic suitable for the private cleanup ledger.
 * Credentials, JWTs, URLs/query strings and control characters are removed.
 */
export function sanitizeOrphanReconciliationError(error: unknown): string {
  const sanitized = readErrorMessage(error)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bsb_(?:secret|publishable)_[^\s]+/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[URL REDACTED]")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (sanitized || "Unknown reconciliation error").slice(0, MAX_RECORDED_ERROR_LENGTH);
}

function isClaim(value: unknown): value is UploadOrphanClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<UploadOrphanClaim>;
  return (
    typeof claim.upload_id === "string" &&
    UUID_PATTERN.test(claim.upload_id) &&
    typeof claim.claim_token === "string" &&
    UUID_PATTERN.test(claim.claim_token) &&
    typeof claim.storage_path === "string"
  );
}

function isExactIntentStoragePath(storagePath: string, uploadId: string): boolean {
  const match = EXACT_INTENT_PATH_PATTERN.exec(storagePath);
  return match?.[1]?.toLowerCase() === uploadId.toLowerCase();
}

async function acknowledgeClaim(
  client: UploadOrphanReconciliationClient,
  claim: Pick<UploadOrphanClaim, "upload_id" | "claim_token">,
  error: string | null,
): Promise<RpcError | null> {
  const result = await client.rpc("complete_upload_intent_orphan_cleanup", {
    p_upload_id: claim.upload_id,
    p_claim_token: claim.claim_token,
    p_error: error,
  });
  return result.error;
}

/**
 * Claims bounded orphan work, removes each exact object through Supabase
 * Storage, and acknowledges success/failure using the unguessable claim token.
 * One bad object never prevents later claims in the same batch from running.
 */
export async function reconcileUploadIntentOrphans({
  client,
  limit,
  leaseSeconds,
}: {
  client: UploadOrphanReconciliationClient;
  limit?: number;
  leaseSeconds?: number;
}): Promise<UploadOrphanReconciliationResult> {
  const boundedLimit = boundedInteger(
    limit,
    DEFAULT_ORPHAN_RECONCILIATION_LIMIT,
    1,
    MAX_ORPHAN_RECONCILIATION_LIMIT,
  );
  const boundedLeaseSeconds = boundedInteger(
    leaseSeconds,
    DEFAULT_ORPHAN_LEASE_SECONDS,
    MIN_ORPHAN_LEASE_SECONDS,
    MAX_ORPHAN_LEASE_SECONDS,
  );
  let claimResult: { data: unknown; error: RpcError | null };
  try {
    claimResult = await client.rpc("claim_upload_intent_orphans", {
      p_limit: boundedLimit,
      p_lease_seconds: boundedLeaseSeconds,
    });
  } catch {
    throw new Error("Upload orphan reconciliation could not claim work");
  }
  if (claimResult.error) {
    // Do not retain the provider error as `cause`: the route logs thrown
    // errors, and upstream messages may contain request credentials.
    throw new Error("Upload orphan reconciliation could not claim work");
  }

  const claims = Array.isArray(claimResult.data) ? claimResult.data : [];
  const result: UploadOrphanReconciliationResult = {
    claimed: claims.length,
    deleted: 0,
    failed: 0,
    items: [],
  };

  for (const rawClaim of claims) {
    if (!isClaim(rawClaim)) {
      result.failed += 1;
      result.items.push({
        uploadId:
          rawClaim && typeof rawClaim === "object" && "upload_id" in rawClaim
            ? String((rawClaim as { upload_id: unknown }).upload_id)
            : null,
        outcome: "failed",
        error: "Invalid orphan claim returned by database",
      });
      continue;
    }

    const claim = rawClaim;
    if (!isExactIntentStoragePath(claim.storage_path, claim.upload_id)) {
      const safeError = "Invalid exact intent storage path returned by database";
      let acknowledgementError: RpcError | null = null;
      try {
        acknowledgementError = await acknowledgeClaim(client, claim, safeError);
      } catch (error) {
        acknowledgementError = { message: readErrorMessage(error) };
      }
      result.failed += 1;
      result.items.push({
        uploadId: claim.upload_id,
        outcome: "failed",
        error: acknowledgementError ? "Invalid path and failure acknowledgement failed" : safeError,
      });
      continue;
    }

    let storageError: unknown | null = null;
    try {
      const removal = await client.storage
        .from(MONITORING_UPLOAD_BUCKET)
        .remove([claim.storage_path]);
      storageError = removal.error;
    } catch (error) {
      storageError = error;
    }

    if (storageError) {
      const safeError = sanitizeOrphanReconciliationError(storageError);
      let acknowledgementError: RpcError | null = null;
      try {
        acknowledgementError = await acknowledgeClaim(client, claim, safeError);
      } catch (error) {
        acknowledgementError = { message: readErrorMessage(error) };
      }
      result.failed += 1;
      result.items.push({
        uploadId: claim.upload_id,
        outcome: "failed",
        error: acknowledgementError
          ? "Storage deletion and failure acknowledgement failed"
          : safeError,
      });
      continue;
    }

    try {
      const completionError = await acknowledgeClaim(client, claim, null);
      if (completionError) {
        result.failed += 1;
        result.items.push({
          uploadId: claim.upload_id,
          outcome: "failed",
          error: "Storage object deleted but completion acknowledgement failed",
        });
        continue;
      }
    } catch {
      result.failed += 1;
      result.items.push({
        uploadId: claim.upload_id,
        outcome: "failed",
        error: "Storage object deleted but completion acknowledgement failed",
      });
      continue;
    }

    result.deleted += 1;
    result.items.push({ uploadId: claim.upload_id, outcome: "deleted" });
  }

  return result;
}
