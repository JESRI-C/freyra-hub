import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import type { OfflinePhotoItem } from "@/lib/field-offline";
import { sha256 } from "../monitoring/drone-ingest";
import { openFieldOfflineStore } from "../field-offline-store";
import { uploadQueuedBridgePhoto } from "../bridge-photo-queue-service";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../field-offline-service", () => ({
  offlineSyncDependencies: (isCurrent: () => boolean) => ({
    isCurrent,
    online: () => true,
    authorize: async () => {},
    sendPhoto: mocks.send,
    sendJob: async () => {
      throw new Error("Unrelated jobs must remain queued");
    },
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  mocks.send.mockReset();
});

async function original(): Promise<{ item: OfflinePhotoItem; file: File }> {
  const file = new File(["photo"], "bridge.jpg", { type: "image/jpeg" });
  const item: OfflinePhotoItem = {
    id: crypto.randomUUID(),
    actorId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    kind: "photo",
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
    fileLastModified: file.lastModified,
    originalBytes: file.size,
    payload: {
      title: "Brofoto",
      description: null,
      category: "field_photo",
      tags: [],
      originalName: file.name,
      sha256: await sha256(file),
      sizeBytes: file.size,
      mimeType: file.type,
      capturedAt: null,
      capture: {
        schema: "freyra.field-photo/v1",
        originalPosition: null,
        initialPosition: null,
        correctionReason: "",
      },
    },
  };
  return { item, file };
}
function verified(item: OfflinePhotoItem) {
  const timestamp = new Date().toISOString();
  const upload = {
    id: item.id,
    project_id: item.projectId,
    created_by: item.actorId,
    created_at: timestamp,
    received_at: timestamp,
    storage_path: `${item.projectId}/field-uploads/${item.id}/original`,
    payload: item.payload,
    object_id: crypto.randomUUID(),
    object_version: "one",
    object_updated_at: timestamp,
  };
  return {
    upload,
    receipt: {
      upload_id: item.id,
      project_id: item.projectId,
      object_id: upload.object_id,
      object_version: "one",
      object_updated_at: timestamp,
      sha256: item.payload.sha256,
      size_bytes: item.payload.sizeBytes,
      status: "verified",
      verified_by: item.actorId,
      verified_at: timestamp,
      validator_version: "stream-sha256/v1",
    },
  };
}

it("retains the original across closed connections and retries only that photo", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const { item, file } = await original();
  const unrelated = { ...item, id: crypto.randomUUID(), projectId: crypto.randomUUID() };
  let store = await openFieldOfflineStore();
  await store.enqueue(unrelated, file);
  store.close();
  mocks.send.mockRejectedValueOnce(new Error("Connection lost"));
  await expect(
    uploadQueuedBridgePhoto(item, file, new AbortController().signal, () => {}),
  ).rejects.toThrow("bevaret");
  store = await openFieldOfflineStore();
  expect(await (await store.original(item.actorId, item.id))!.text()).toBe("photo");
  expect((await store.items(item.actorId)).find((row) => row.id === unrelated.id)?.state).toBe(
    "queued",
  );
  store.close();
  mocks.send.mockImplementationOnce(async (sent: OfflinePhotoItem) => verified(sent));
  await expect(
    uploadQueuedBridgePhoto(item, file, new AbortController().signal, () => {}),
  ).resolves.toEqual({ id: item.id, title: "Brofoto" });
  expect(mocks.send.mock.calls.map((call) => call[0].id)).toEqual([item.id, item.id]);
  store = await openFieldOfflineStore();
  expect(await store.original(item.actorId, item.id)).toBeNull();
  expect((await store.items(item.actorId)).find((row) => row.id === item.id)?.state).toBe(
    "complete",
  );
  store.close();
});

it("keeps the original when the returned receipt fails verification", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const { item, file } = await original();
  const receipt = verified(item);
  receipt.receipt.sha256 = "0".repeat(64);
  mocks.send.mockResolvedValueOnce(receipt);
  await expect(
    uploadQueuedBridgePhoto(item, file, new AbortController().signal, () => {}),
  ).rejects.toThrow("bevaret");
  const store = await openFieldOfflineStore();
  expect(await store.original(item.actorId, item.id)).not.toBeNull();
  expect((await store.items(item.actorId))[0].state).not.toBe("complete");
  store.close();
});
