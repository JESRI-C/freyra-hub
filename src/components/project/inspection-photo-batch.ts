import type {
  getSurveyRoundMediaAccess,
  getSurveyRoundMedia,
  listSurveyRoundMedia,
  saveSurveyRoundMedia,
  SurveyRoundMediaCandidate,
} from "@/lib/survey-round-media.functions";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import {
  assertSurveyRoundMediaSaved,
  createSurveyRoundMediaReceipt,
  readSurveyRoundMediaReceipt,
  surveyRoundMediaMatchesRound,
  surveyRoundMediaReceiptKey,
  type SurveyRoundMediaReceipt,
  type SurveyRoundMediaScope,
} from "./survey-round-media-request";

export const INSPECTION_PHOTO_PAGE_SIZE = 30;
export const MAX_INSPECTION_PHOTOS = 200;
const SCHEMA = "gofreyra.inspection-photo-batch/v1";

export interface InspectionPhotoBatchEntry {
  receipt: SurveyRoundMediaReceipt;
  status: "pending" | "confirmed" | "conflict";
  bindingId?: string;
  bindingSha256?: string;
  message?: string;
}
export interface InspectionPhotoBatchReceipt {
  schema: typeof SCHEMA;
  entries: InspectionPhotoBatchEntry[];
}
export type InspectionPhotoBatchStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface InspectionPhotoBatchApi {
  getAccess: (input: {
    data: { projectId: string };
  }) => ReturnType<typeof getSurveyRoundMediaAccess>;
  listBindings: (input: {
    data: { projectId: string; roundVersionId: string; mediaId: string; limit: number };
  }) => ReturnType<typeof listSurveyRoundMedia>;
  getBinding: (input: {
    data: { projectId: string; bindingId: string };
  }) => ReturnType<typeof getSurveyRoundMedia>;
  saveBinding: (input: {
    data: SurveyRoundMediaReceipt["input"] & { expectedCallerUserId: string };
  }) => ReturnType<typeof saveSurveyRoundMedia>;
}

export function inspectionPhotoBatchKey(scope: SurveyRoundMediaScope): string {
  return `${surveyRoundMediaReceiptKey(scope)}:${scope.round.manifestSha256}:batch-v1`;
}

function questionsMatch(receipt: SurveyRoundMediaReceipt, scope: SurveyRoundMediaScope): boolean {
  return (
    JSON.stringify(receipt.input.questionIds) ===
    JSON.stringify([...scope.round.manifest.questionIds].sort())
  );
}

export function createInspectionPhotoBatch(
  scope: SurveyRoundMediaScope,
  candidates: SurveyRoundMediaCandidate[],
  requestId: () => string = () => crypto.randomUUID(),
): InspectionPhotoBatchReceipt {
  if (
    scope.round.status !== "draft" ||
    candidates.length === 0 ||
    candidates.length > MAX_INSPECTION_PHOTOS ||
    new Set(candidates.map((candidate) => candidate.mediaId)).size !== candidates.length
  )
    throw new Error("Vælg mellem 1 og 200 forskellige originalfotos til den gemte kladderunde.");
  const entries = candidates.map((candidate) => ({
    receipt: createSurveyRoundMediaReceipt(
      scope,
      candidate,
      scope.round.manifest.questionIds,
      requestId(),
    ),
    status: "pending" as const,
  }));
  if (new Set(entries.map((entry) => entry.receipt.input.requestId)).size !== entries.length)
    throw new Error("Batchens genforsøgsreferencer skal være forskellige.");
  return { schema: SCHEMA, entries };
}

export function readInspectionPhotoBatch(
  text: string | null,
  scope: SurveyRoundMediaScope,
): InspectionPhotoBatchReceipt | null {
  if (text === null) return null;
  if (new TextEncoder().encode(text).byteLength > MAX_INSPECTION_PHOTOS * 33_000)
    throw new Error("Den lokale batchreference er for stor.");
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== SCHEMA ||
    !("entries" in value) ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0 ||
    value.entries.length > MAX_INSPECTION_PHOTOS ||
    Object.keys(value).some((key) => key !== "schema" && key !== "entries")
  )
    throw new Error("Den lokale batchreference kan ikke læses sikkert.");
  const entries: InspectionPhotoBatchEntry[] = value.entries.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || !("receipt" in raw) || !("status" in raw))
      throw new Error("Et genforsøg mangler sin fastholdte reference.");
    const receipt = readSurveyRoundMediaReceipt(JSON.stringify(raw.receipt), scope);
    if (!receipt || !questionsMatch(receipt, scope))
      throw new Error("Batchens spørgsmål matcher ikke denne præcise rundeversion.");
    const entry = raw as Record<string, unknown>;
    if (
      !["pending", "confirmed", "conflict"].includes(String(entry.status)) ||
      Object.keys(entry).some(
        (key) => !["receipt", "status", "bindingId", "bindingSha256", "message"].includes(key),
      ) ||
      (entry.message !== undefined &&
        (typeof entry.message !== "string" || entry.message.length > 2000)) ||
      (entry.bindingId !== undefined &&
        (typeof entry.bindingId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            entry.bindingId,
          ))) ||
      (entry.bindingSha256 !== undefined &&
        (typeof entry.bindingSha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.bindingSha256))) ||
      (entry.status !== "pending" && (!entry.bindingId || !entry.bindingSha256))
    )
      throw new Error("Batchens gemte fremskridt kan ikke læses sikkert.");
    return {
      receipt,
      status: entry.status as InspectionPhotoBatchEntry["status"],
      ...(entry.bindingId ? { bindingId: entry.bindingId as string } : {}),
      ...(entry.bindingSha256 ? { bindingSha256: entry.bindingSha256 as string } : {}),
      ...(entry.message ? { message: entry.message as string } : {}),
    };
  });
  if (
    new Set(entries.map((entry) => entry.receipt.input.mediaId)).size !== entries.length ||
    new Set(entries.map((entry) => entry.receipt.input.requestId)).size !== entries.length
  )
    throw new Error("Batchen indeholder gentagne originaler eller genforsøgsreferencer.");
  return { schema: SCHEMA, entries };
}

export function writeInspectionPhotoBatch(
  storage: InspectionPhotoBatchStorage,
  scope: SurveyRoundMediaScope,
  batch: InspectionPhotoBatchReceipt,
  previous: string | null,
): string {
  const key = inspectionPhotoBatchKey(scope);
  if (storage.getItem(key) !== previous)
    throw new Error("Batchen er ændret i et andet vindue. Genåbn batchen før et nyt forsøg.");
  const text = JSON.stringify(batch);
  readInspectionPhotoBatch(text, scope);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text)
    throw new Error(
      "Batchens genforsøgsreferencer kunne ikke fastholdes. Ingen ny gemning er sendt.",
    );
  return text;
}

/** Browser progress is a recovery hint, never a substitute for fresh authorized readback. */
export function reopenInspectionPhotoBatch(
  batch: InspectionPhotoBatchReceipt,
): InspectionPhotoBatchReceipt {
  return {
    ...batch,
    entries: batch.entries.map((entry) => ({
      receipt: entry.receipt,
      status: "pending",
      ...(entry.status === "confirmed"
        ? { message: "Tidligere gemning afventer ny læsebekræftelse efter genåbning." }
        : entry.status === "conflict"
          ? { message: "En tidligere konflikt skal kontrolleres igen. Spørgsmål overskrives ikke." }
          : entry.message
            ? { message: entry.message }
            : {}),
    })),
  };
}

export function sameInspectionPhotoBatchRequests(
  first: InspectionPhotoBatchReceipt,
  second: InspectionPhotoBatchReceipt,
): boolean {
  return (
    JSON.stringify(first.entries.map((entry) => entry.receipt)) ===
    JSON.stringify(second.entries.map((entry) => entry.receipt))
  );
}

function errorMessage(failure: unknown): string {
  return (failure instanceof Error ? failure.message : "Batchen blev afbrudt.").slice(0, 2000);
}

/** Each write has its original receipt, fresh actor authorization and a separate exact readback. */
export async function runInspectionPhotoBatch({
  scope,
  storage,
  api,
  expectedBatch,
  assertCurrent,
  onProgress,
}: {
  scope: SurveyRoundMediaScope;
  storage: InspectionPhotoBatchStorage;
  api: InspectionPhotoBatchApi;
  expectedBatch: InspectionPhotoBatchReceipt;
  assertCurrent: () => void;
  onProgress: (batch: InspectionPhotoBatchReceipt) => void;
}): Promise<InspectionPhotoBatchReceipt> {
  assertCurrent();
  if (scope.round.status !== "draft") throw new Error("Vælg den præcise gemte kladderunde.");
  const key = inspectionPhotoBatchKey(scope);
  let previous = storage.getItem(key);
  let batch = readInspectionPhotoBatch(previous, scope);
  if (!batch) throw new Error("Vælg og fasthold et batch før tilknytningen.");
  if (!sameInspectionPhotoBatchRequests(batch, expectedBatch))
    throw new Error("Et andet vindue har ændret de valgte fotos. Genåbn og kontrollér batchen.");
  const commit = (next: InspectionPhotoBatchReceipt) => {
    assertCurrent();
    previous = writeInspectionPhotoBatch(storage, scope, next, previous);
    batch = next;
    onProgress(next);
  };
  const update = (index: number, entry: InspectionPhotoBatchEntry) => {
    const current = batch!;
    commit({
      ...current,
      entries: current.entries.map((item, at) => (at === index ? entry : item)),
    });
  };
  const previousEntries = batch.entries;
  const acknowledgedConflicts = new Map(
    expectedBatch.entries
      .filter((entry) => entry.status === "conflict")
      .map((entry) => [entry.receipt.input.requestId, entry]),
  );
  // This runs after the component's cross-tab lock is acquired. Shared/local
  // completed flags are hints only; every invocation proves progress anew.
  commit(reopenInspectionPhotoBatch(batch));
  const readBack = async (written: SurveyRoundMediaVersion, receipt: SurveyRoundMediaReceipt) => {
    assertSurveyRoundMediaSaved(written, receipt, scope.round);
    const fresh = await api.getBinding({
      data: { projectId: scope.round.projectId, bindingId: written.id },
    });
    assertCurrent();
    if (!fresh || fresh.id !== written.id || fresh.manifestSha256 !== written.manifestSha256)
      throw new Error(
        "Den gemte tilknytning afventer en præcis læsebekræftelse. Genforsøget er bevaret.",
      );
    assertSurveyRoundMediaSaved(fresh, receipt, scope.round);
    return fresh;
  };
  for (let index = 0; index < batch.entries.length; index++) {
    const entry = batch.entries[index];
    try {
      assertCurrent();
      if (storage.getItem(key) !== previous)
        throw new Error("Et andet vindue har ændret batchen. Genåbn den før et nyt forsøg.");
      const access = await api.getAccess({ data: { projectId: scope.round.projectId } });
      assertCurrent();
      if (access.userId !== scope.actorId || access.projectId !== scope.round.projectId)
        throw new Error("Adgangssvaret matcher ikke batchens aktuelle bruger og sag.");
      const found = await api.listBindings({
        data: {
          projectId: scope.round.projectId,
          roundVersionId: scope.round.id,
          mediaId: entry.receipt.input.mediaId,
          limit: 2,
        },
      });
      assertCurrent();
      if (
        found.nextBeforeVersion !== null ||
        found.items.length > 1 ||
        found.items.some(
          (binding) =>
            !surveyRoundMediaMatchesRound(binding, scope.round) ||
            binding.mediaId !== entry.receipt.input.mediaId,
        )
      )
        throw new Error(
          "Fotoets eksisterende tilknytning kunne ikke afklares entydigt. Intet overskrives.",
        );
      let written: SurveyRoundMediaVersion;
      if (found.items.length) {
        written = found.items[0];
        if (
          written.requestId !== entry.receipt.input.requestId ||
          written.createdBy !== scope.actorId
        ) {
          const freshConflict = await api.getBinding({
            data: { projectId: scope.round.projectId, bindingId: written.id },
          });
          assertCurrent();
          if (
            !freshConflict ||
            freshConflict.id !== written.id ||
            freshConflict.manifestSha256 !== written.manifestSha256 ||
            !surveyRoundMediaMatchesRound(freshConflict, scope.round) ||
            freshConflict.mediaId !== entry.receipt.input.mediaId
          )
            throw new Error(
              "Den eksisterende tilknytning kunne ikke læsebekræftes. Intet overskrives.",
            );
          const acknowledged = acknowledgedConflicts.get(entry.receipt.input.requestId);
          const mayContinue =
            acknowledged?.bindingId === freshConflict.id &&
            acknowledged.bindingSha256 === freshConflict.manifestSha256;
          update(index, {
            ...entry,
            status: "conflict",
            bindingId: freshConflict.id,
            bindingSha256: freshConflict.manifestSha256,
            message: `Fotoet har allerede en anden tilknytning med ${freshConflict.manifest.questionIds.length} spørgsmål. Den bevares uændret. ${mayContinue ? "Den viste konflikt er kontrolleret igen; du har valgt at fortsætte med resterende fotos." : "Gennemløbet er stoppet; kontrollér konflikten før du fortsætter med resterende fotos."}`,
          });
          if (mayContinue) continue;
          return batch!;
        }
      } else {
        if (previousEntries[index].status !== "pending")
          throw new Error(
            "Den tidligere gemte tilknytning kunne ikke genfindes. Genforsøget er bevaret uden ny gemning.",
          );
        const currentAccess = await api.getAccess({ data: { projectId: scope.round.projectId } });
        assertCurrent();
        if (
          currentAccess.userId !== scope.actorId ||
          currentAccess.projectId !== scope.round.projectId ||
          currentAccess.canAssign !== true
        )
          throw new Error("Din aktuelle adgang tillader ikke at knytte flere fotos til runden.");
        if (storage.getItem(key) !== previous)
          throw new Error("Batchen er ændret i et andet vindue. Ingen ny gemning er sendt.");
        written = await api.saveBinding({
          data: { ...entry.receipt.input, expectedCallerUserId: scope.actorId },
        });
        assertCurrent();
      }
      const fresh = await readBack(written, entry.receipt);
      assertCurrent();
      update(index, {
        receipt: entry.receipt,
        status: "confirmed",
        bindingId: fresh.id,
        bindingSha256: fresh.manifestSha256,
      });
    } catch (failure) {
      assertCurrent();
      update(index, { ...entry, status: "pending", message: errorMessage(failure) });
      throw failure;
    }
  }
  return batch;
}
