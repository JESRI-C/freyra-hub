import type { DroneOriginalValidation } from "@/services/monitoring/drone-original-validation.server";

/** Browser admission only; the server repeats every condition against canonical rows. */
export const MAX_ORIGINAL_CHECK_BYTES = 32 * 1024 * 1024;
export type OriginalCheckStatus =
  | "queued"
  | "validating"
  | "raw_original_validated"
  | "review_required"
  | "rejected"
  | "failed"
  | "unprocessed";
export interface OriginalCheckState {
  status: OriginalCheckStatus;
  error?: string;
  cameraPositionEligible?: boolean;
  sha256?: string;
}
export interface OriginalCheckUpload {
  id: string;
  project_id: string | null;
  uploaded_by: string;
  file_name: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  upload_type: string;
  storage_path: string;
  intent_request_id: string | null;
  received_at: string | null;
  status: string;
  original_sha256?: string | null;
  original_validation?: unknown;
}
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Hash = /^[0-9a-f]{64}$/;
const StoredStatuses = new Set(["raw_original_validated", "review_required", "rejected"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function originalCheckAvailability(
  upload: OriginalCheckUpload,
  projectId: string,
): { eligible: boolean; reason: string | null } {
  if (upload.upload_type !== "drone_photo")
    return { eligible: false, reason: "Denne kontrol behandler kun originale dronefotos." };
  if (upload.mime_type !== "image/jpeg" || !/\.jpe?g$/i.test(upload.file_name))
    return {
      eligible: false,
      reason: "Ikke behandlet: serverkontrollen understøtter aktuelt kun JPEG-originaler.",
    };
  if (
    !Number.isInteger(upload.file_size) ||
    upload.file_size <= 0 ||
    upload.file_size > MAX_ORIGINAL_CHECK_BYTES
  )
    return { eligible: false, reason: "Ikke behandlet: JPEG-originaler skal være højst 32 MiB." };
  if (
    upload.project_id !== projectId ||
    !Uuid.test(projectId) ||
    !Uuid.test(upload.id) ||
    !Uuid.test(upload.uploaded_by)
  )
    return { eligible: false, reason: "Uploaden matcher ikke den valgte sag." };
  if (
    !upload.intent_request_id ||
    !Uuid.test(upload.intent_request_id) ||
    !upload.received_at ||
    !Number.isFinite(Date.parse(upload.received_at)) ||
    !["awaiting_validation", "validating", "rejected"].includes(upload.status) ||
    !/^[a-zA-Z0-9._-]+$/.test(upload.file_name) ||
    upload.storage_path !== `${upload.uploaded_by}/intents/${upload.id}/${upload.file_name}`
  ) {
    return {
      eligible: false,
      reason:
        "Ikke behandlet: filen er ikke en færdigmodtaget original i det aktuelle uploadforløb.",
    };
  }
  return { eligible: true, reason: null };
}

/** Stored server-owned results remain raw checks, never a report or footprint approval. */
export function storedOriginalCheckState(upload: OriginalCheckUpload): OriginalCheckState | null {
  if (upload.original_validation == null) return null;
  const value = record(upload.original_validation);
  const original = record(value?.original);
  if (
    !value ||
    !original ||
    value.schema !== "gofreyra.drone-original-validation/v1" ||
    value.uploadId !== upload.id ||
    value.projectId !== upload.project_id ||
    typeof value.status !== "string" ||
    !StoredStatuses.has(value.status) ||
    value.pixelDecoded !== false ||
    value.georeferenced !== false ||
    value.reportEligible !== false ||
    original.storagePath !== upload.storage_path ||
    original.sizeBytes !== upload.file_size ||
    original.receivedAt !== upload.received_at ||
    typeof original.sha256 !== "string" ||
    !Hash.test(original.sha256) ||
    (upload.original_sha256 != null && upload.original_sha256 !== original.sha256)
  ) {
    return {
      status: "failed",
      error: "Den gemte serverkontrol kunne ikke bekræftes. Originalen skal gennemgås.",
    };
  }
  return {
    status: value.status as "raw_original_validated" | "review_required" | "rejected",
    cameraPositionEligible: value.cameraPositionEligible === true,
    sha256: original.sha256,
  };
}

export function originalCheckStatusLabel(state: OriginalCheckState): string {
  const labels: Record<OriginalCheckStatus, string> = {
    queued: "Modtaget · originalkontrol i kø",
    validating: "Kontrollerer original",
    raw_original_validated: "Original kontrolleret · afventer faglig gennemgang",
    review_required: "Original kontrolleret · kræver gennemgang",
    rejected: "Original afvist",
    failed: "Modtaget · kontrol kunne ikke afsluttes",
    unprocessed: "Modtaget · ikke behandlet",
  };
  return labels[state.status];
}

export function isOriginalCheckComplete(state: OriginalCheckState | null | undefined): boolean {
  return Boolean(state && StoredStatuses.has(state.status));
}

// One FIFO queue is shared by the drawer and reload actions in this browser.
// A validation failure settles its own task without stopping later originals.
let originalCheckTail: Promise<void> = Promise.resolve();
function enqueueOriginalCheck<T>(operation: () => Promise<T>): Promise<T> {
  const next = originalCheckTail.then(operation);
  originalCheckTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function checkOriginalsSequentially(
  candidates: readonly { key: string; upload: OriginalCheckUpload }[],
  projectId: string,
  validate: (input: { projectId: string; uploadId: string }) => Promise<DroneOriginalValidation>,
  onUpdate: (key: string, state: OriginalCheckState) => void,
): Promise<void> {
  for (const candidate of candidates) {
    const stored = storedOriginalCheckState(candidate.upload);
    if (stored) {
      onUpdate(candidate.key, stored);
      continue;
    }
    const admission = originalCheckAvailability(candidate.upload, projectId);
    if (!admission.eligible) {
      onUpdate(candidate.key, { status: "unprocessed", error: admission.reason ?? undefined });
      continue;
    }
    onUpdate(candidate.key, { status: "queued" });
    await enqueueOriginalCheck(async () => {
      onUpdate(candidate.key, { status: "validating" });
      try {
        const result = await validate({ projectId, uploadId: candidate.upload.id });
        const state = storedOriginalCheckState({
          ...candidate.upload,
          original_validation: result,
          original_sha256: result.original.sha256,
        });
        if (!state || state.status === "failed")
          throw new Error("Invalid original validation response");
        onUpdate(candidate.key, state);
      } catch {
        onUpdate(candidate.key, {
          status: "failed",
          error:
            "Serverkontrollen kunne ikke afsluttes. Originalen er stadig modtaget. Kontrollér adgang, og prøv kontrollen igen.",
        });
      }
    });
  }
}
