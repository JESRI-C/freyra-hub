import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { openFieldOfflineStore } from "../field-offline-store";
import {
  FIELD_OFFLINE_LEASE_MS,
  type OfflinePhotoItem,
  type OfflineItem,
} from "@/lib/field-offline";
const actor = "11111111-1111-4111-8111-111111111111",
  project = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333";
function photo(): OfflinePhotoItem {
  return {
    id: crypto.randomUUID(),
    actorId: actor,
    projectId: project,
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
    fileLastModified: 50,
    originalBytes: 3,
    receipt: null,
    payload: {
      title: "Testfoto",
      description: null,
      category: "field_photo",
      tags: [],
      originalName: "photo.png",
      sha256: "a".repeat(64),
      sizeBytes: 3,
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
}
function verified(item: OfflinePhotoItem) {
  const upload = {
    id: item.id,
    project_id: project,
    created_by: actor,
    created_at: new Date(1000).toISOString(),
    storage_path: `${project}/field-uploads/${item.id}/original`,
    payload: item.payload,
    received_at: new Date(2000).toISOString(),
    object_id: crypto.randomUUID(),
    object_version: "one",
    object_updated_at: new Date(2000).toISOString(),
  };
  return {
    upload,
    receipt: {
      upload_id: item.id,
      project_id: project,
      object_id: upload.object_id,
      object_version: "one",
      object_updated_at: upload.object_updated_at,
      sha256: item.payload.sha256,
      size_bytes: 3,
      status: "verified",
      verified_by: actor,
      verified_at: new Date(3000).toISOString(),
      validator_version: "stream-sha256/v1",
    },
  };
}
function job(): Extract<OfflineItem, { kind: "job" }> {
  const identity = {
    id: crypto.randomUUID(),
    organization_id: other,
    project_id: project,
    version: 1,
    request_id: crypto.randomUUID(),
    created_by: actor,
    created_at: new Date(1000).toISOString(),
  };
  const template = {
    ...identity,
    template_id: crypto.randomUUID(),
    definition: {
      schema: "freyra.field-job-template/v1" as const,
      title: "Besøg",
      domain: "general" as const,
      fields: [
        { key: "seen", label: "Observeret", type: "boolean" as const, required: true },
        { key: "count", label: "Antal", type: "number" as const, required: true },
      ],
    },
  };
  const base = photo();
  return {
    ...base,
    kind: "job",
    originalBytes: 0,
    template,
    payload: {
      organizationId: other,
      actionId: crypto.randomUUID(),
      templateVersionId: template.id,
      expectedVersion: 1,
      values: { seen: false, count: 0 },
      status: "recorded",
      correctionReason: "Feltbesøg",
    },
  };
}
function jobReceipt(item: Extract<OfflineItem, { kind: "job" }>) {
  return {
    id: crypto.randomUUID(),
    organization_id: item.payload.organizationId,
    project_id: item.projectId,
    action_id: item.payload.actionId,
    template_version_id: item.template.id,
    version: item.payload.expectedVersion + 1,
    request_id: item.id,
    created_by: item.actorId,
    created_at: new Date(3000).toISOString(),
    values: { count: 0, seen: false },
    status: item.payload.status,
    correction_reason: item.payload.correctionReason,
  };
}
describe("durable field outbox", () => {
  it("rolls back metadata and capacity when storing the original throws a quota error", async () => {
    const store = await openFieldOfflineStore(new IDBFactory()),
      item = photo();
    const original = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      if (this.name === "blobs") throw new DOMException("Full", "QuotaExceededError");
      return original.apply(this, args);
    });
    try {
      await expect(
        store.enqueue(item, new Blob(["raw"], { type: "image/png" }), 3),
      ).rejects.toThrow("Full");
    } finally {
      spy.mockRestore();
    }
    expect(await store.items(actor)).toEqual([]);
    expect(await store.original(actor, item.id)).toBeNull();
    await store.enqueue(item, new Blob(["raw"], { type: "image/png" }), 3);
    store.close();
  });
  it("sends dependent job revisions only after a matching canonical receipt, preserving false and zero", async () => {
    const store = await openFieldOfflineStore(new IDBFactory()),
      first = job();
    const next = {
      ...first,
      id: crypto.randomUUID(),
      dependsOn: first.id,
      payload: { ...first.payload, expectedVersion: 2 },
    };
    await store.enqueue(first);
    await store.enqueue(next);
    const claim = (await store.claim(actor, 2000))!;
    expect(claim.id).toBe(first.id);
    expect(await store.claim(actor, 2001)).toBeNull();
    await expect(
      store.complete(
        actor,
        first.id,
        claim.leaseId!,
        { ...jobReceipt(first), created_by: other },
        3000,
      ),
    ).rejects.toThrow();
    expect(await store.complete(actor, first.id, claim.leaseId!, jobReceipt(first), 3000)).toBe(
      true,
    );
    expect((await store.claim(actor, 3001))?.id).toBe(next.id);
    store.close();
  });
  it("makes dependent conflicts visible without stopping unrelated photos", async () => {
    const store = await openFieldOfflineStore(new IDBFactory()),
      first = job();
    const next = {
      ...first,
      id: crypto.randomUUID(),
      dependsOn: first.id,
      payload: { ...first.payload, expectedVersion: 2 },
    };
    const image = photo();
    await store.enqueue(first);
    const claim = (await store.claim(actor, 2000))!;
    await store.enqueue(next);
    await store.enqueue(image, new Blob(["raw"], { type: "image/png" }));
    await store.fail(actor, first.id, claim.leaseId!, "conflict", 3000);
    expect((await store.claim(actor, 3001))?.id).toBe(image.id);
    expect((await store.items(actor)).find((i) => i.id === next.id)?.state).toBe("conflict");
    await expect(store.retry(actor, first.id)).rejects.toThrow();
    store.close();
  });
  it("reopens the same original and intent, without reading other users' files", async () => {
    const factory = new IDBFactory(),
      first = await openFieldOfflineStore(factory),
      item = photo();
    await first.enqueue(item, new Blob(["raw"], { type: "image/png" }));
    first.close();
    const reopened = await openFieldOfflineStore(factory);
    expect((await reopened.items(actor))[0].id).toBe(item.id);
    expect(await (await reopened.original(actor, item.id))!.text()).toBe("raw");
    expect(await reopened.items(other)).toEqual([]);
    expect(await reopened.original(other, item.id)).toBeNull();
    reopened.close();
  });
  it("enforces the device byte budget atomically across concurrent connections", async () => {
    const factory = new IDBFactory(),
      a = await openFieldOfflineStore(factory),
      b = await openFieldOfflineStore(factory);
    const results = await Promise.allSettled([
      a.enqueue(photo(), new Blob(["raw"], { type: "image/png" }), 3),
      b.enqueue(photo(), new Blob(["raw"], { type: "image/png" }), 3),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await a.items(actor)).toHaveLength(1);
    a.close();
    b.close();
  });
  it("permits one tab's lease and prevents a stale tab from completing or releasing its successor", async () => {
    const factory = new IDBFactory(),
      a = await openFieldOfflineStore(factory),
      b = await openFieldOfflineStore(factory),
      item = photo();
    await a.enqueue(item, new Blob(["raw"], { type: "image/png" }));
    const claims = await Promise.all([a.claim(actor, 2000), b.claim(actor, 2000)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    const next = await b.claim(actor, 2000 + FIELD_OFFLINE_LEASE_MS + 1);
    expect(next?.leaseId).not.toBe(first.leaseId);
    expect(
      await a.complete(
        actor,
        item.id,
        first.leaseId!,
        verified(item),
        2000 + FIELD_OFFLINE_LEASE_MS + 2,
      ),
    ).toBe(false);
    expect(
      await a.fail(actor, item.id, first.leaseId!, "retry", 2000 + FIELD_OFFLINE_LEASE_MS + 2),
    ).toBe(false);
    expect(await a.original(actor, item.id)).not.toBeNull();
    a.close();
    b.close();
  });
  it("retains an original on mismatched receipts and releases it only after matching verification commits", async () => {
    const store = await openFieldOfflineStore(new IDBFactory()),
      item = photo();
    await store.enqueue(item, new Blob(["raw"], { type: "image/png" }));
    const claim = (await store.claim(actor, 2000))!;
    const invalid = verified(item);
    invalid.receipt.sha256 = "b".repeat(64);
    await expect(store.complete(actor, item.id, claim.leaseId!, invalid, 3000)).rejects.toThrow();
    expect(await store.original(actor, item.id)).not.toBeNull();
    expect(await store.complete(actor, item.id, claim.leaseId!, verified(item), 3000)).toBe(true);
    expect(await store.original(actor, item.id)).toBeNull();
    expect((await store.items(actor))[0].state).toBe("complete");
    await store.enqueue(photo(), new Blob(["raw"], { type: "image/png" }), 3);
    store.close();
  });
  it("does not replace a previously acknowledged local intent with another payload", async () => {
    const store = await openFieldOfflineStore(new IDBFactory()),
      item = photo();
    await store.enqueue(item, new Blob(["raw"], { type: "image/png" }));
    await expect(
      store.enqueue(
        { ...item, payload: { ...item.payload, title: "Different" } },
        new Blob(["raw"], { type: "image/png" }),
      ),
    ).rejects.toThrow();
    const row = (await store.items(actor))[0];
    expect(row.kind).toBe("photo");
    if (row.kind === "photo") expect(row.payload.title).toBe("Testfoto");
    store.close();
  });
});
