// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), verify: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/field-photo-verification.functions", () => ({ verifyFieldPhoto: mocks.verify }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: mocks.read };
      return q;
    },
  },
}));
import { FieldPhotoReceiptPanel } from "../FieldPhotoReceiptPanel";
import { projectId, uploadId, actorId, verified } from "@/services/__tests__/field-photo-fixture";
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function open(canContribute = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <FieldPhotoReceiptPanel
          projectId={projectId}
          uploadId={uploadId}
          actorId={actorId}
          canContribute={canContribute}
        />
      </QueryClientProvider>,
    ),
  );
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.read.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.verify.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("field original server receipt", () => {
  it("lets a contributor finish a pending durable job and then displays the stored receipt", async () => {
    mocks.verify.mockImplementation(async () => {
      mocks.read.mockResolvedValue({ data: verified, error: null });
      return verified;
    });
    await open();
    expect(host.textContent).toContain("Serverkontrollen mangler");
    await act(async () => host.querySelector("button")!.click());
    await settle();
    expect(mocks.verify).toHaveBeenCalledWith({ data: { projectId, uploadId } });
    expect(host.textContent).toContain("Serverens checksum matcher");
    expect(host.textContent).toContain("fagligt indhold kræver særskilt vurdering");
    expect(host.querySelector("button")).toBeNull();
  });
  it("keeps pending status visible for a reader without offering a write action", async () => {
    await open(false);
    expect(host.textContent).toContain("Serverkontrollen mangler");
    expect(host.querySelector("button")).toBeNull();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("does not present a checksum mismatch as success or offer a blind recheck", async () => {
    mocks.read.mockResolvedValue({
      data: { ...verified, status: "hash_mismatch", sha256: "b".repeat(64) },
      error: null,
    });
    await open();
    expect(host.textContent).toContain("Checksum stemmer ikke");
    expect(host.textContent).not.toContain("Serverens checksum matcher");
    expect(host.querySelector("button")).toBeNull();
  });
  it("keeps a failed verification retryable without claiming completion", async () => {
    mocks.verify.mockRejectedValue(new Error("lease active"));
    await open();
    await act(async () => host.querySelector("button")!.click());
    await settle();
    expect(host.textContent).toContain("Kontrollen kunne ikke afsluttes");
    expect(host.textContent).toContain("Serverkontrollen mangler");
    expect(host.querySelector("button")?.disabled).toBe(false);
  });
});
vi.mock("../FieldPhotoPreviewPanel", () => ({ FieldPhotoPreviewPanel: () => null }));
