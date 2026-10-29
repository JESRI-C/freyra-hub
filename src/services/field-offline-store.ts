import {
  FIELD_OFFLINE_DB,
  FIELD_OFFLINE_LEASE_MS,
  FIELD_OFFLINE_MAX_BYTES,
  FieldWorkPackSchema,
  OfflineItemSchema,
  offlineRetryDelay,
  sameOfflineOwner,
  sameOfflineValue,
  type FieldWorkPack,
  type OfflineItem,
} from "@/lib/field-offline";
import {
  FieldPhotoUuid,
  parseFieldPhotoReceipt,
  parseFieldPhotoUpload,
} from "@/lib/field-photo-upload";
import { FieldJobVersionSchema } from "@/lib/field-job-cards";

type Result<T> = (value: T) => void;
function transaction<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, result: Result<T>, fail: (error: Error) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Do not await non-IDB work inside a transaction: Safari can auto-commit it.
    const tx = db.transaction(stores, mode);
    let value: T;
    let failure: Error | null = null;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () =>
      reject(
        failure ?? tx.error ?? new Error("Telefonen kunne ikke gemme data. Behold originalen."),
      );
    tx.onerror = () => {
      /* onabort is authoritative; never acknowledge an uncommitted write. */
    };
    const fail = (error: Error) => {
      failure = error;
      tx.abort();
    };
    try {
      work(
        tx,
        (v) => {
          value = v;
        },
        fail,
      );
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Lokal transaktion fejlede."));
    }
  });
}
export async function openFieldOfflineStore(
  factory: IDBFactory = indexedDB,
  name = FIELD_OFFLINE_DB,
) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const items = request.result.createObjectStore("items", { keyPath: ["actorId", "id"] });
      items.createIndex("actor", "actorId");
      items.createIndex("project", ["actorId", "projectId"]);
      request.result.createObjectStore("blobs", { keyPath: ["actorId", "id"] });
      const packs = request.result.createObjectStore("packs", {
        keyPath: ["actorId", "projectId"],
      });
      packs.createIndex("actor", "actorId");
      request.result.createObjectStore("usage");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Telefonens lokale lager kunne ikke åbnes."));
    request.onblocked = () => reject(new Error("Luk en ældre feltfane, og prøv igen."));
  });
  db.onversionchange = () => db.close();
  const key = (actorId: string, id: string) => [
    FieldPhotoUuid.parse(actorId),
    FieldPhotoUuid.parse(id),
  ];
  function update<T>(
    actorId: string,
    id: string,
    stores: string[],
    change: (
      tx: IDBTransaction,
      row: OfflineItem,
      result: Result<T>,
      fail: (e: Error) => void,
    ) => void,
  ) {
    return transaction<T>(db, ["items", ...stores], "readwrite", (tx, result, fail) => {
      const req = tx.objectStore("items").get(key(actorId, id));
      req.onsuccess = () => {
        try {
          if (!req.result) throw new Error("Registreringen findes ikke for denne bruger.");
          const row = OfflineItemSchema.parse(req.result);
          if (!sameOfflineOwner(row, actorId)) throw new Error("Forkert lokal ejer.");
          change(tx, row, result, fail);
        } catch (error) {
          fail(error instanceof Error ? error : new Error("Ugyldig lokal registrering."));
        }
      };
    });
  }
  return {
    close: () => db.close(),
    async putPack(raw: FieldWorkPack) {
      const pack = FieldWorkPackSchema.parse(raw);
      for (const job of pack.jobs) {
        if (
          job.latest &&
          (job.latest.project_id !== pack.projectId ||
            job.latest.organization_id !== pack.organizationId ||
            job.latest.action_id !== job.actionId)
        )
          throw new Error("Jobkortet tilhører en anden sag.");
        if (
          job.template &&
          (job.template.project_id !== pack.projectId ||
            job.template.organization_id !== pack.organizationId ||
            job.latest?.template_version_id !== job.template.id)
        )
          throw new Error("Skabelonen matcher ikke jobkortet.");
      }
      return transaction<void>(db, ["packs"], "readwrite", (tx, result) => {
        tx.objectStore("packs").put(pack);
        result();
      });
    },
    async packs(actorId: string): Promise<FieldWorkPack[]> {
      FieldPhotoUuid.parse(actorId);
      return transaction(db, ["packs"], "readonly", (tx, result, fail) => {
        const request = tx.objectStore("packs").index("actor").getAll(actorId);
        request.onsuccess = () => {
          try {
            result(request.result.map((p) => FieldWorkPackSchema.parse(p)));
          } catch {
            fail(new Error("Opgavepakken kunne ikke læses."));
          }
        };
      });
    },
    async items(actorId: string, projectId?: string): Promise<OfflineItem[]> {
      FieldPhotoUuid.parse(actorId);
      if (projectId) FieldPhotoUuid.parse(projectId);
      return transaction(db, ["items"], "readonly", (tx, result, fail) => {
        // Metadata only. Reading the queue never materializes every original Blob.
        const req = projectId
          ? tx.objectStore("items").index("project").getAll([actorId, projectId])
          : tx.objectStore("items").index("actor").getAll(actorId);
        req.onsuccess = () => {
          try {
            result(
              req.result
                .map((i) => OfflineItemSchema.parse(i))
                .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
            );
          } catch {
            fail(new Error("Den lokale kø kunne ikke læses."));
          }
        };
      });
    },
    async enqueue(raw: OfflineItem, blob?: Blob, maxBytes = FIELD_OFFLINE_MAX_BYTES) {
      const item = OfflineItemSchema.parse(raw);
      if (item.state !== "queued" || item.attempts || item.leaseId || item.receipt)
        throw new Error("En ny registrering skal være usendt.");
      if (
        item.kind === "photo" &&
        (!blob ||
          blob.size !== item.payload.sizeBytes ||
          blob.size !== item.originalBytes ||
          blob.type !== item.payload.mimeType)
      )
        throw new Error("Originalfilen matcher ikke køregistreringen.");
      if (item.kind === "job" && blob) throw new Error("Jobkort gemmes uden fotofil.");
      if (
        item.kind === "job" &&
        (item.template.id !== item.payload.templateVersionId ||
          item.template.project_id !== item.projectId ||
          item.template.organization_id !== item.payload.organizationId)
      )
        throw new Error("Den lokale skabelon matcher ikke jobkortet.");
      return transaction<void>(db, ["items", "blobs", "usage"], "readwrite", (tx, result, fail) => {
        const req = tx.objectStore("items").get(key(item.actorId, item.id));
        req.onsuccess = () => {
          if (req.result) {
            fail(new Error("Registrerings-ID'et er allerede gemt. Den tidligere fil bevares."));
            return;
          }
          const usage = tx.objectStore("usage").get("bytes");
          usage.onsuccess = () => {
            try {
              const used = Number(usage.result ?? 0);
              if (used + item.originalBytes > maxBytes) {
                fail(new Error("Feltkøen har ikke plads. Send eksisterende originaler først."));
                return;
              }
              tx.objectStore("items").add(item);
              if (blob) tx.objectStore("blobs").add({ actorId: item.actorId, id: item.id, blob });
              tx.objectStore("usage").put(used + item.originalBytes, "bytes");
              result();
            } catch (error) {
              fail(
                error instanceof Error ? error : new Error("Originalen kunne ikke gemmes lokalt."),
              );
            }
          };
        };
      });
    },
    async original(actorId: string, id: string): Promise<Blob | null> {
      return transaction(db, ["blobs"], "readonly", (tx, result) => {
        const req = tx.objectStore("blobs").get(key(actorId, id));
        req.onsuccess = () => result(req.result?.blob ?? null);
      });
    },
    async claim(actorId: string, now = Date.now()): Promise<OfflineItem | null> {
      FieldPhotoUuid.parse(actorId);
      return transaction(db, ["items"], "readwrite", (tx, result, fail) => {
        const store = tx.objectStore("items");
        const req = store.index("actor").getAll(actorId);
        req.onsuccess = () => {
          try {
            const rows = req.result.map((i) => OfflineItemSchema.parse(i));
            rows.forEach((i) => {
              if (
                i.attempts >= 5 &&
                (i.state === "retry" || (i.state === "sending" && i.leaseUntil <= now))
              ) {
                i.state = "blocked";
                i.lastError = "retry_limit";
                store.put(i);
              }
            });
            // A failed predecessor must remain visible, and must not strand its descendants silently.
            let changed = true;
            while (changed) {
              changed = false;
              for (const row of rows) {
                if (
                  row.dependsOn &&
                  (row.state === "queued" || row.state === "retry") &&
                  rows.some(
                    (p) =>
                      p.id === row.dependsOn && (p.state === "conflict" || p.state === "blocked"),
                  )
                ) {
                  row.state = "conflict";
                  row.lastError = "predecessor_unresolved";
                  store.put(row);
                  changed = true;
                }
              }
            }
            const row = rows
              .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
              .find(
                (i) =>
                  (i.state === "queued" ||
                    i.state === "retry" ||
                    (i.state === "sending" && i.leaseUntil <= now)) &&
                  i.attempts < 5 &&
                  i.nextAttemptAt <= now &&
                  (!i.dependsOn ||
                    rows.some(
                      (parent) =>
                        parent.id === i.dependsOn &&
                        parent.projectId === i.projectId &&
                        parent.kind === "job" &&
                        i.kind === "job" &&
                        parent.payload.actionId === i.payload.actionId &&
                        parent.payload.expectedVersion + 1 === i.payload.expectedVersion &&
                        parent.state === "complete",
                    )),
              );
            if (!row) {
              result(null);
              return;
            }
            row.state = "sending";
            row.leaseId = crypto.randomUUID();
            row.leaseUntil = now + FIELD_OFFLINE_LEASE_MS;
            row.attempts++;
            row.updatedAt = now;
            row.lastError = null;
            store.put(row);
            result(row);
          } catch {
            fail(new Error("Den lokale kø indeholder en ugyldig registrering."));
          }
        };
      });
    },
    async renew(actorId: string, id: string, leaseId: string, now = Date.now()) {
      return update<boolean>(actorId, id, [], (tx, row, result) => {
        if (row.state !== "sending" || row.leaseId !== leaseId || row.leaseUntil <= now) {
          result(false);
          return;
        }
        row.leaseUntil = now + FIELD_OFFLINE_LEASE_MS;
        row.updatedAt = now;
        tx.objectStore("items").put(row);
        result(true);
      });
    },
    async fail(
      actorId: string,
      id: string,
      leaseId: string,
      code: "retry" | "blocked" | "conflict",
      now = Date.now(),
    ) {
      return update<boolean>(actorId, id, [], (tx, row, result) => {
        if (row.state !== "sending" || row.leaseId !== leaseId || row.leaseUntil <= now) {
          result(false);
          return;
        }
        row.state = row.attempts >= 5 && code === "retry" ? "blocked" : code;
        row.lastError = code;
        row.nextAttemptAt = now + offlineRetryDelay(row.attempts);
        row.leaseId = null;
        row.leaseUntil = 0;
        row.updatedAt = now;
        tx.objectStore("items").put(row);
        result(true);
      });
    },
    async retry(actorId: string, id: string) {
      return update<void>(actorId, id, [], (tx, row, result, fail) => {
        if (row.state === "sending" || row.state === "complete" || row.state === "conflict") {
          fail(
            new Error("Denne registrering kan ikke nulstilles. En konflikt skal gennemgås først."),
          );
          return;
        }
        row.state = "queued";
        row.attempts = 0;
        row.nextAttemptAt = 0;
        row.lastError = null;
        tx.objectStore("items").put(row);
        result();
      });
    },
    async complete(actorId: string, id: string, leaseId: string, raw: unknown, now = Date.now()) {
      return update<boolean>(actorId, id, ["blobs", "usage"], (tx, row, result, fail) => {
        if (row.state !== "sending" || row.leaseId !== leaseId || row.leaseUntil <= now) {
          result(false);
          return;
        }
        try {
          if (row.kind === "photo") {
            const value = raw as { upload?: unknown; receipt?: unknown };
            const upload = parseFieldPhotoUpload(value?.upload, row.projectId, row.id);
            const receipt = parseFieldPhotoReceipt(value?.receipt, upload);
            if (
              receipt.status !== "verified" ||
              upload.created_by !== actorId ||
              !sameOfflineValue(upload.payload, row.payload)
            )
              throw new Error("Originalkvitteringen matcher ikke den lokale fil.");
            row.receipt = receipt;
          } else {
            const version = FieldJobVersionSchema.parse(raw);
            if (
              version.project_id !== row.projectId ||
              version.organization_id !== row.payload.organizationId ||
              version.action_id !== row.payload.actionId ||
              version.request_id !== row.id ||
              version.template_version_id !== row.payload.templateVersionId ||
              version.version !== row.payload.expectedVersion + 1 ||
              version.created_by !== actorId ||
              !sameOfflineValue(version.values, row.payload.values) ||
              version.status !== row.payload.status ||
              version.correction_reason !== row.payload.correctionReason
            )
              throw new Error("Jobkortkvitteringen matcher ikke den lokale registrering.");
            row.receipt = version;
          }
          const usage = tx.objectStore("usage").get("bytes");
          usage.onsuccess = () => {
            try {
              if (row.kind === "photo") tx.objectStore("blobs").delete(key(actorId, id));
              tx.objectStore("usage").put(
                Math.max(0, Number(usage.result ?? 0) - row.originalBytes),
                "bytes",
              );
              row.state = "complete";
              row.leaseId = null;
              row.leaseUntil = 0;
              row.updatedAt = now;
              tx.objectStore("items").put(row);
              result(true);
            } catch (error) {
              fail(
                error instanceof Error
                  ? error
                  : new Error("Kvitteringen kunne ikke gemmes lokalt."),
              );
            }
          };
        } catch (error) {
          fail(error instanceof Error ? error : new Error("Kvitteringen kunne ikke kontrolleres."));
        }
      });
    },
  };
}
export type FieldOfflineStore = Awaited<ReturnType<typeof openFieldOfflineStore>>;
