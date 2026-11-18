// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { DroneBeforeBatchWizard } from "../DroneBeforeBatchWizard";
import { readPendingDroneBatches } from "@/components/project/drone-intake-batch-receipt";
import { UploadTransferError } from "@/services/monitoring/uploads-service";
import { originalJpeg } from "@/services/monitoring/__tests__/drone-original-validation.fixtures";

const actor = "a0000000-0000-4000-8000-000000000001";
const project = "b0000000-0000-4000-8000-000000000001";
const mediaId = (n: number) => "c0000000-0000-4000-8000-" + String(n).padStart(12, "0");
const api = vi.hoisted(() => ({
  upload: vi.fn(),
  validate: vi.fn(),
  promote: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: actor } }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/drone-original-validation.functions", () => ({
  validateDroneOriginal: api.validate,
}));
vi.mock("@/lib/drone-original-promotion.functions", () => ({ promoteDroneOriginal: api.promote }));
vi.mock("@/services/monitoring/upload-import-service", () => ({
  parseImage: api.preview,
  buildImageDetectedMetadata: () => ({ metadata_status: "review_required" }),
}));
vi.mock("@/services/monitoring/uploads-service", async (original) => ({
  ...(await original<typeof import("@/services/monitoring/uploads-service")>()),
  uploadFileResumable: api.upload,
}));

async function verifyBatch(mode: "before" | "neutral") {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const originalBytes = Array.from({ length: 437 }, (_, i) => originalJpeg(i + 1));
  const hashes = originalBytes.map((bytes) => createHash("sha256").update(bytes).digest("hex"));
  expect(new Set(hashes).size).toBe(437);
  const files = originalBytes.map(
    (bytes, i) => new File([bytes.slice().buffer], `${i + 1}.JPG`, { type: "image/jpeg" }),
  );
  const attempts = new Map<string, number>(),
    receipts = () => readPendingDroneBatches(localStorage, actor, project, mode);
  let failPromotion = true,
    concurrent = 0,
    maximum = 0;
  api.preview.mockImplementation(async (file: File) => ({
    droneMetadata: {
      file: { sha256: hashes[Number.parseInt(file.name) - 1] },
      capture: { timezoneKnown: false },
    },
  }));
  api.upload.mockImplementation(async (input) => {
    const n = Number.parseInt(input.file.name),
      id = mediaId(n);
    const attempted = attempts.get(id) ?? 0;
    attempts.set(id, attempted + 1);
    concurrent++;
    maximum = Math.max(maximum, concurrent);
    await Promise.resolve();
    concurrent--;
    const storage_path = `${actor}/intents/${id}/${input.file.name}`;
    if (n === 201 && !attempted)
      throw new UploadTransferError("interrupted", {
        uploadId: id,
        storagePath: storage_path,
        intentExpiresAt: "2026-11-18T00:00:00Z",
      });
    return {
      id,
      project_id: project,
      uploaded_by: actor,
      file_name: input.file.name,
      original_file_name: input.file.name,
      file_size: input.file.size,
      mime_type: "image/jpeg",
      upload_type: "drone_photo",
      status: "awaiting_validation",
      storage_path,
      received_at: "2026-11-17T00:00:00Z",
      intent_request_id: input.clientRequestId,
    };
  });
  api.validate.mockImplementation(async ({ data: { uploadId } }) => {
    const n = Number(uploadId.slice(-12));
    if (mode === "neutral" && n === 1) {
      expect(receipts()[0]).toMatchObject({ receivedCount: 200, mediaIds: [] });
    }
    if (mode === "neutral" && n === 2) {
      expect(receipts()[0].mediaIds).toEqual([mediaId(1)]);
    }
    return {
      schema: "gofreyra.drone-original-validation/v1",
      uploadId,
      projectId: project,
      status: "review_required",
      original: {
        storagePath: `${actor}/intents/${uploadId}/${n}.JPG`,
        sizeBytes: files[n - 1].size,
        receivedAt: "2026-11-17T00:00:00Z",
        sha256: hashes[n - 1],
      },
      pixelDecoded: false,
      georeferenced: false,
      reportEligible: false,
    };
  });
  api.promote.mockImplementation(async ({ data }) => {
    if (data.uploadId === mediaId(437) && failPromotion) {
      failPromotion = false;
      throw new Error("retry");
    }
    return {
      ...data,
      schema: "gofreyra.drone-original-promotion/v1",
      mediaId: data.uploadId,
      originId: data.uploadId,
      originalSha256: hashes[Number(data.uploadId.slice(-12)) - 1],
      pixelDecoded: false,
      georeferenced: false,
      reportEligible: false,
    };
  });
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find((element) =>
      element.textContent?.includes(label),
    );
    expect(button?.disabled).toBe(false);
    await act(async () => button!.click());
  };
  const render = (open: boolean) =>
    root.render(
      <DroneBeforeBatchWizard
        intakeMode={mode}
        open={open}
        projectId={project}
        onClose={() => render(false)}
      />,
    );
  try {
    await act(async () => render(true));
    const input = host.querySelector("input[type=file]")!;
    Object.defineProperty(input, "files", { value: files });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelectorAll("select option")).toHaveLength(3);
    expect(api.preview).toHaveBeenCalledTimes(200);
    await click("Upload valgte billeder");
    expect(maximum).toBe(2);
    expect(api.upload).toHaveBeenCalledTimes(437);
    expect(api.preview).toHaveBeenCalledTimes(437);
    expect(receipts().map((batch) => [batch.mediaIds.length, batch.receivedCount])).toEqual([
      [200, 200],
      [199, 199],
      [36, 37],
    ]);
    const ids = receipts().map((batch) => batch.batchId);
    const events = api.upload.mock.calls.map(([input]) => input.userMetadata.intake);
    expect(
      readPendingDroneBatches(
        localStorage,
        actor,
        project,
        mode === "before" ? "neutral" : "before",
      ),
    ).toEqual([]);
    for (let n = 0; n < 437; n++) {
      expect(events[n]).toMatchObject(
        mode === "before"
          ? {
              schema_version: "gofreyra.drone-before-intake/v1",
              phase: "BEFORE",
              media_kind: "drone_photo",
            }
          : {
              schema_version: "gofreyra.drone-intake/v1",
              phase: "UNCLASSIFIED",
              media_kind: "drone_photo",
            },
      );
      expect(events[n].batch_id).toBe(ids[Math.floor(n / 200)]);
      expect(events[n].batch_sequence).toBe((n % 200) + 1);
    }
    expect(api.promote.mock.invocationCallOrder[199]).toBeLessThan(
      api.upload.mock.invocationCallOrder[200],
    );
    await click("Luk");
    expect(host.querySelector("input")).toBeNull();
    await act(async () => render(true));
    await click("Prøv fejlede igen");
    const original = api.upload.mock.calls[200][0],
      retry = api.upload.mock.calls[437][0];
    expect(retry).toMatchObject({
      file: original.file,
      clientRequestId: original.clientRequestId,
      userMetadata: original.userMetadata,
      resumeIntent: { uploadId: mediaId(201) },
    });
    await click("Prøv kontrol eller tilknytning igen");
    expect(api.validate).toHaveBeenCalledTimes(437);
    expect(api.upload).toHaveBeenCalledTimes(438);
    expect(api.preview).toHaveBeenCalledTimes(437);
    await click("Luk billedkø");
    await act(async () => render(true));
    if (mode === "neutral") {
      expect(host.textContent).toContain("Modtagne droneserier");
      expect(host.textContent).toContain("Serie 3 · 37 modtaget · 37 tilknyttet");
      expect(host.textContent).not.toContain("FØR");
    }
    await act(async () => root.unmount());
    const restored = receipts();
    expect(restored.map((batch) => batch.batchId)).toEqual(ids);
    expect(restored.map((batch) => batch.mediaIds.length)).toEqual([200, 200, 37]);
    expect(restored[1].mediaIds).toContain(mediaId(201));
    expect(restored[2].mediaIds).toContain(mediaId(437));
    expect(new Set(restored.flatMap((batch) => batch.mediaIds)).size).toBe(437);
  } finally {
    if (host.firstChild) await act(async () => root.unmount());
    vi.unstubAllGlobals();
    localStorage.clear();
  }
}
it.each(["before", "neutral"] as const)(
  "processes one 437-file %s selection in three bounded series and restores each series after upload and promotion retries",
  verifyBatch,
  60_000,
);
