// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  job: null as unknown,
  preview: null as unknown,
  signed: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (column: string, value: string) => {
          mocks.eq(column, value);
          return q;
        },
        maybeSingle: async () => ({
          data: table === "field_photo_previews" ? mocks.preview : mocks.job,
          error: null,
        }),
      };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: mocks.signed }) },
  },
}));
import { FieldPhotoPreviewPanel } from "../FieldPhotoPreviewPanel";
import { projectId, uploadId, actorId, received } from "@/services/__tests__/field-photo-fixture";
import { fieldPhotoPreviewPath } from "@/lib/field-photo-preview";
const job = {
  upload_id: uploadId,
  project_id: projectId,
  stage: "preview",
  state: "pending",
  attempts: 0,
  lease_id: null,
  lease_until: null,
  next_attempt_at: "2026-10-29T14:00:00Z",
  updated_at: "2026-10-29T14:00:00Z",
  last_error: null,
};
const preview = {
  upload_id: uploadId,
  project_id: projectId,
  recipe: "preview-jpeg1536-v1",
  source_sha256: "a".repeat(64),
  sha256: "b".repeat(64),
  size_bytes: 24,
  width: 3,
  height: 2,
  storage_path: fieldPhotoPreviewPath(projectId, uploadId, "b".repeat(64)),
  object_id: received.object_id,
  object_version: null,
  object_updated_at: received.object_updated_at,
  created_at: received.created_at,
  created_by: actorId,
};
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function open() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <FieldPhotoPreviewPanel projectId={projectId} uploadId={uploadId} actorId={actorId} />
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.job = job;
  mocks.preview = null;
  mocks.signed.mockReset().mockResolvedValue({
    data: { signedUrl: "https://synthetic.invalid/private.jpg?token=short-lived" },
    error: null,
  });
  mocks.eq.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("private field photo preview", () => {
  it("displays a pending job without loading the original as a fallback", async () => {
    await open();
    expect(host.textContent).toContain("afventer baggrundsbehandling");
    expect(host.querySelector("img")).toBeNull();
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("signs the scoped derivative for 60 seconds and leaves the original separate", async () => {
    mocks.preview = preview;
    await open();
    expect(mocks.eq).toHaveBeenCalledWith("project_id", projectId);
    expect(mocks.eq).toHaveBeenCalledWith("upload_id", uploadId);
    expect(mocks.signed).toHaveBeenCalledWith(preview.storage_path, 60);
    expect(host.querySelector("img")?.getAttribute("src")).toContain("private.jpg");
    expect(host.textContent).toContain("Originalfilen er bevaret særskilt");
  });
  it("does not sign another projects returned preview", async () => {
    mocks.preview = { ...preview, project_id: actorId };
    await open();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(host.querySelector("img")).toBeNull();
  });
  it("explains unsupported originals without hiding their retained status", async () => {
    mocks.job = { ...job, state: "unsupported", last_error: "source_too_large" };
    await open();
    expect(host.textContent).toContain("for stor til automatisk visningsbillede");
    expect(host.textContent).toContain("bevaret");
    expect(host.querySelector("img")).toBeNull();
  });
  it("hides a preview when Storage refuses the current projects access", async () => {
    mocks.preview = preview;
    mocks.signed.mockResolvedValue({ data: null, error: { code: "42501" } });
    await open();
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("aktuelle projektadgang");
  });
});
