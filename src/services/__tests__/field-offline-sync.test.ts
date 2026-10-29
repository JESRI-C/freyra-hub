import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openFieldOfflineStore } from "../field-offline-store";
import {
  drainFieldOfflineQueue,
  OfflineSyncError,
  type FieldOfflineSyncDependencies,
} from "../field-offline-sync";
import { sha256 } from "../monitoring/drone-ingest";
import type { OfflinePhotoItem } from "@/lib/field-offline";
const actor = "11111111-1111-4111-8111-111111111111",
  project = "22222222-2222-4222-8222-222222222222";
async function fixture() {
  const blob = new Blob(["untouched original"], { type: "image/png" });
  const item: OfflinePhotoItem = {
    kind: "photo",
    id: crypto.randomUUID(),
    actorId: actor,
    projectId: project,
    createdAt: 1000,
    updatedAt: 1000,
    state: "queued",
    attempts: 0,
    nextAttemptAt: 0,
    leaseId: null,
    leaseUntil: 0,
    lastError: null,
    dependsOn: null,
    receipt: null,
    fileLastModified: 100,
    originalBytes: blob.size,
    payload: {
      title: "Test",
      description: null,
      category: "field_photo",
      tags: [],
      originalName: "original.png",
      sha256: await sha256(blob),
      sizeBytes: blob.size,
      mimeType: "image/png",
      capturedAt: null,
      capture: {
        schema: "freyra.field-photo/v1",
        originalPosition: null,
        initialPosition: null,
        correctionReason: "",
      },
    },
  };
  const upload = {
    id: item.id,
    project_id: project,
    created_by: actor,
    created_at: new Date(1000).toISOString(),
    payload: item.payload,
    storage_path: `${project}/field-uploads/${item.id}/original`,
    received_at: new Date(2000).toISOString(),
    object_id: crypto.randomUUID(),
    object_version: "one",
    object_updated_at: new Date(2000).toISOString(),
  };
  const result = {
    upload,
    receipt: {
      upload_id: item.id,
      project_id: project,
      object_id: upload.object_id,
      object_version: "one",
      object_updated_at: upload.object_updated_at,
      sha256: item.payload.sha256,
      size_bytes: blob.size,
      status: "verified",
      verified_by: actor,
      verified_at: new Date(3000).toISOString(),
      validator_version: "stream-sha256/v1",
    },
  };
  return { blob, item, result };
}
function dependencies(): FieldOfflineSyncDependencies {
  return {
    isCurrent: () => true,
    online: () => true,
    authorize: vi.fn(async () => {}),
    sendPhoto: vi.fn(),
    sendJob: vi.fn(),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("offline synchronization", () => {
  it("releases a hung authorization attempt to a bounded retry without sending bytes", async () => {
    const f = await fixture(),
      store = await openFieldOfflineStore(new IDBFactory()),
      deps = dependencies();
    await store.enqueue(f.item, f.blob);
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    deps.authorize = () => {
      began();
      return new Promise<void>(() => {});
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const draining = drainFieldOfflineQueue(store, actor, deps, new AbortController().signal);
    await started;
    await vi.advanceTimersByTimeAsync(20_001);
    await draining;
    expect(deps.sendPhoto).not.toHaveBeenCalled();
    expect((await store.items(actor))[0].state).toBe("retry");
    expect(await store.original(actor, f.item.id)).not.toBeNull();
    store.close();
  });
  it("recovers a lost server answer after reopening with exactly the same upload identity and bytes", async () => {
    const f = await fixture(),
      factory = new IDBFactory(),
      first = await openFieldOfflineStore(factory),
      deps = dependencies();
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await first.enqueue(f.item, f.blob);
    deps.sendPhoto = vi.fn(async () => {
      throw new Error("response lost");
    });
    await drainFieldOfflineQueue(first, actor, deps, new AbortController().signal);
    first.close();
    const reopened = await openFieldOfflineStore(factory);
    expect(await reopened.original(actor, f.item.id)).not.toBeNull();
    now += 60_001;
    deps.sendPhoto = vi.fn(async (item, file) => {
      expect(item.id).toBe(f.item.id);
      expect(await file.text()).toBe("untouched original");
      return f.result;
    });
    expect(await drainFieldOfflineQueue(reopened, actor, deps, new AbortController().signal)).toBe(
      1,
    );
    expect(await reopened.original(actor, f.item.id)).toBeNull();
    reopened.close();
  });
  it("keeps bytes when authorization is revoked and never starts the transfer", async () => {
    const f = await fixture(),
      store = await openFieldOfflineStore(new IDBFactory()),
      deps = dependencies();
    await store.enqueue(f.item, f.blob);
    deps.authorize = vi.fn(async () => {
      throw new OfflineSyncError("blocked");
    });
    await drainFieldOfflineQueue(store, actor, deps, new AbortController().signal);
    expect(deps.sendPhoto).not.toHaveBeenCalled();
    expect((await store.items(actor))[0].state).toBe("blocked");
    expect(await store.original(actor, f.item.id)).not.toBeNull();
    store.close();
  });
  it("does not release a locally stored original after an account switch during receipt delivery", async () => {
    const f = await fixture(),
      store = await openFieldOfflineStore(new IDBFactory()),
      deps = dependencies();
    await store.enqueue(f.item, f.blob);
    let current = true;
    deps.isCurrent = () => current;
    deps.sendPhoto = vi.fn(async () => {
      current = false;
      return f.result;
    });
    await drainFieldOfflineQueue(store, actor, deps, new AbortController().signal);
    expect(await store.original(actor, f.item.id)).not.toBeNull();
    expect((await store.items(actor))[0].state).not.toBe("complete");
    store.close();
  });
  it("blocks a corrupted local original before creating any remote upload", async () => {
    const f = await fixture(),
      store = await openFieldOfflineStore(new IDBFactory()),
      deps = dependencies();
    await store.enqueue(f.item, new Blob(["different original"], { type: "image/png" }));
    await drainFieldOfflineQueue(store, actor, deps, new AbortController().signal);
    expect(deps.sendPhoto).not.toHaveBeenCalled();
    expect((await store.items(actor))[0].state).toBe("blocked");
    store.close();
  });
});
