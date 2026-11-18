import { sameOfflineValue, type OfflinePhotoItem } from "@/lib/field-offline";
import { openFieldOfflineStore } from "./field-offline-store";
import { drainFieldOfflineQueue } from "./field-offline-sync";
import { offlineSyncDependencies } from "./field-offline-service";

/** Persist the original before transfer; the existing field workspace can recover it. */
export async function uploadQueuedBridgePhoto(
  item: OfflinePhotoItem,
  file: File,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
) {
  const store = await openFieldOfflineStore();
  try {
    const find = async () =>
      (await store.items(item.actorId, item.projectId)).find((row) => row.id === item.id);
    const previous = await find();
    if (
      previous &&
      (previous.kind !== "photo" || !sameOfflineValue(previous.payload, item.payload))
    )
      throw new Error("Fotokøens original matcher ikke dette genforsøg.");
    if (!previous) await store.enqueue(item, file);
    else if (previous.state !== "complete" && previous.state !== "sending")
      await store.retry(item.actorId, item.id);
    const deps = offlineSyncDependencies(
      () => !signal.aborted,
      (_, value) => onProgress(value),
    );
    // A bridge upload must never send another project's queued job as a side effect.
    await drainFieldOfflineQueue(
      { ...store, claim: (actorId, now) => store.claim(actorId, now, item.id) },
      item.actorId,
      deps,
      signal,
      1,
    );
    const saved = await find();
    if (saved?.kind !== "photo" || saved.state !== "complete")
      throw new Error(
        "Fotoet er bevaret i feltfotokøen. Prøv igen her, eller fortsæt fra Freyra i felten.",
      );
    return { id: saved.id, title: saved.payload.title };
  } finally {
    store.close();
  }
}
