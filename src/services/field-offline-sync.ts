import type { FieldOfflineStore } from "./field-offline-store";
import type { OfflineItem, OfflinePhotoItem } from "@/lib/field-offline";
import { sha256 } from "./monitoring/drone-ingest";

export class OfflineSyncError extends Error {
  constructor(readonly disposition: "retry" | "blocked" | "conflict") {
    super(disposition);
  }
}
function within<T>(work: Promise<T>, signal: AbortSignal, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const finish = (error?: unknown, value?: T) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(new OfflineSyncError("retry"));
    const timer = setTimeout(abort, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    work.then((value) => finish(undefined, value), finish);
  });
}
export interface FieldOfflineSyncDependencies {
  isCurrent(): boolean;
  online(): boolean;
  authorize(actorId: string, projectId: string): Promise<void>;
  sendPhoto(
    item: OfflinePhotoItem,
    file: File,
    signal: AbortSignal,
    progress: (percent: number) => void,
  ): Promise<unknown>;
  sendJob(item: Extract<OfflineItem, { kind: "job" }>, signal: AbortSignal): Promise<unknown>;
  progress?(id: string, percent: number): void;
}
/** Foreground-only drain. A closed/suspended page is recovered through expired local leases. */
export async function drainFieldOfflineQueue(
  store: FieldOfflineStore,
  actorId: string,
  deps: FieldOfflineSyncDependencies,
  outerSignal: AbortSignal,
  limit = 4,
) {
  let completed = 0;
  for (
    let index = 0;
    index < limit && deps.online() && deps.isCurrent() && !outerSignal.aborted;
    index++
  ) {
    const item = await store.claim(actorId);
    if (!item?.leaseId) break;
    const leaseId = item.leaseId;
    const transfer = new AbortController();
    const abort = () => transfer.abort();
    outerSignal.addEventListener("abort", abort, { once: true });
    if (outerSignal.aborted) transfer.abort();
    const heartbeat = setInterval(() => {
      void store
        .renew(actorId, item.id, leaseId)
        .then((ok) => {
          if (!ok || !deps.isCurrent()) transfer.abort();
        })
        .catch(abort);
    }, 20_000);
    try {
      await within(deps.authorize(actorId, item.projectId), transfer.signal, 20_000);
      if (!deps.isCurrent() || outerSignal.aborted || transfer.signal.aborted)
        throw new OfflineSyncError("retry");
      let result: unknown;
      if (item.kind === "photo") {
        const blob = await store.original(actorId, item.id);
        if (
          !blob ||
          blob.size !== item.payload.sizeBytes ||
          (await sha256(blob)) !== item.payload.sha256
        )
          throw new OfflineSyncError("blocked");
        const file = new File([blob], item.payload.originalName, {
          type: item.payload.mimeType,
          lastModified: item.fileLastModified,
        });
        result = await within(
          deps.sendPhoto(item, file, transfer.signal, (p) => deps.progress?.(item.id, p)),
          transfer.signal,
          10 * 60_000,
        );
      } else {
        result = await within(deps.sendJob(item, transfer.signal), transfer.signal, 60_000);
      }
      if (!deps.isCurrent() || outerSignal.aborted || transfer.signal.aborted)
        throw new OfflineSyncError("retry");
      const accepted = await store.complete(actorId, item.id, leaseId, result);
      if (accepted) completed++;
    } catch (error) {
      // Store only bounded classifications, never server text, tokens, private URLs or image data.
      const disposition =
        error instanceof OfflineSyncError
          ? error.disposition
          : /checksum|kvittering.*matcher|originalkvittering/i.test(
                error instanceof Error ? error.message : "",
              )
            ? "blocked"
            : "retry";
      await store.fail(actorId, item.id, leaseId, disposition).catch(() => false);
    } finally {
      transfer.abort();
      clearInterval(heartbeat);
      outerSignal.removeEventListener("abort", abort);
    }
  }
  return completed;
}
