import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import type { UploadMediaInput } from "@/services/project-media-service";

const state = vi.hoisted(() => ({
  cursor: 0,
  hooks: [] as unknown[],
  effects: [] as { index: number; run: () => void | (() => void) }[],
  cleanups: new Map<number, () => void>(),
  writes: 0,
  actorId: "synthetic-actor",
  gps: vi.fn<(file: File) => Promise<{ latitude: number; longitude: number } | undefined>>(),
  upload:
    vi.fn<
      (input: UploadMediaInput) => Promise<{ data: ProjectMediaItem | null; error: string | null }>
    >(),
}));

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const changed = (before: unknown[] | undefined, after: unknown[]) =>
    !before ||
    before.length !== after.length ||
    after.some((value, index) => !Object.is(value, before[index]));
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = initial;
      return [
        state.hooks[index],
        (value: unknown) => {
          state.hooks[index] = typeof value === "function" ? value(state.hooks[index]) : value;
          state.writes++;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = { current: initial };
      return state.hooks[index];
    },
    useCallback: (fn: unknown, deps: unknown[]) => {
      const index = state.cursor++;
      const previous = state.hooks[index] as { fn: unknown; deps: unknown[] } | undefined;
      if (changed(previous?.deps, deps)) state.hooks[index] = { fn, deps };
      return (state.hooks[index] as { fn: unknown }).fn;
    },
    useEffect: (run: () => void | (() => void), deps: unknown[]) => {
      const index = state.cursor++;
      if (changed(state.hooks[index] as unknown[] | undefined, deps)) {
        state.hooks[index] = deps;
        state.effects.push({ index, run });
      }
    },
  };
});
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: state.actorId } }) }));
vi.mock("@/services/project-media-service", () => ({ uploadProjectMedia: state.upload }));
vi.mock("exifr", () => ({ default: { gps: state.gps } }));
vi.mock("@/components/monitoring/DroneBeforeBatchWizard", () => ({
  DroneBeforeBatchWizard: () => null,
}));

import { ProjectMediaUploadPanel } from "../ProjectMediaUploadPanel";
import { DroneBeforeBatchWizard } from "@/components/monitoring/DroneBeforeBatchWizard";

type Props = React.ComponentProps<typeof ProjectMediaUploadPanel>;
type Element = React.ReactElement<Record<string, unknown>>;
const saved: ProjectMediaItem = {
  id: "synthetic-photo",
  projectId: "project-a",
  title: "B",
  category: "field_photo",
  source: "field_upload",
  url: "synthetic-private-reference",
  uploadedAt: "2026-10-14T10:00:00Z",
  isReportReady: false,
  tags: [],
  status: "uploaded",
};
let props: Props;
let nextPreview = 0;
let createPreview: ReturnType<typeof vi.spyOn>;
let revokePreview: ReturnType<typeof vi.spyOn>;

function tree(depth = 0): React.ReactElement {
  if (depth > 5) throw new Error("Synthetic effect cycle");
  state.cursor = 0;
  state.effects = [];
  const result = ProjectMediaUploadPanel(props);
  if (state.effects.length) {
    for (const effect of state.effects) {
      state.cleanups.get(effect.index)?.();
      const cleanup = effect.run();
      if (cleanup) state.cleanups.set(effect.index, cleanup);
      else state.cleanups.delete(effect.index);
    }
    return tree(depth + 1);
  }
  return result;
}
function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement<Record<string, unknown>>(node)) return null;
  if (predicate(node)) return node;
  return find(node.props.children as React.ReactNode, predicate);
}
function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return React.isValidElement<{ children?: React.ReactNode }>(node)
    ? text(node.props.children)
    : "";
}
function labelled(label: string): Element {
  const found = find(tree(), (element) => element.props["aria-label"] === label);
  if (!found) throw new Error(`Missing control ${label}`);
  return found;
}
function button(label: string): Element {
  const found = find(
    tree(),
    (element) =>
      element.type === "button" && text(element.props.children as React.ReactNode).trim() === label,
  );
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function input(label: string, value: string) {
  (labelled(label).props.onChange as (event: { target: { value: string } }) => void)({
    target: { value },
  });
}
function select(file: File | null) {
  const target = { files: file ? [file] : [], value: file?.name ?? "" };
  const change = labelled("Vælg andet foto eller bilag").props.onChange as (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  return change({ target } as unknown as React.ChangeEvent<HTMLInputElement>);
}
async function submit() {
  await (button("Gem foto eller bilag").props.onClick as () => Promise<void>)();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function unmount() {
  for (const cleanup of state.cleanups.values()) cleanup();
  state.cleanups.clear();
}

beforeEach(() => {
  state.cursor = 0;
  state.hooks = [];
  state.effects = [];
  state.cleanups.clear();
  state.writes = 0;
  state.actorId = "synthetic-actor";
  state.gps.mockReset().mockResolvedValue(undefined);
  state.upload.mockReset().mockResolvedValue({ data: saved, error: null });
  props = {
    projectId: "project-a",
    projectCentroid: { lat: 55, lng: 9 },
    onUploadComplete: vi.fn(),
    onDroneBatchImported: vi.fn(),
  };
  nextPreview = 0;
  createPreview = vi
    .spyOn(URL, "createObjectURL")
    .mockImplementation(() => `blob:synthetic-${++nextPreview}`);
  revokePreview = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  tree();
});
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe("ProjectMediaUploadPanel file isolation", () => {
  it("accepts coordinates entered with a Danish decimal keyboard", async () => {
    await select(new File(["original"], "photo.jpg", { type: "image/jpeg" }));
    input("Breddegrad", "55,4");
    input("Længdegrad", "9,2");
    input("Begrundelse for manuel placering", "Test af dansk decimaltastatur");
    await submit();
    expect(state.upload.mock.calls[0][0].coordinates).toEqual({ lat: 55.4, lng: 9.2 });
  });

  it("retains the selected camera original during a background permission refresh", async () => {
    const image = new File(["camera-original"], "camera.jpg", { type: "image/jpeg" });
    await select(image);
    props = { ...props, accessPending: true };
    expect(button("Gem foto eller bilag").props.disabled).toBe(true);
    await submit();
    expect(state.upload).not.toHaveBeenCalled();
    expect(labelled("Titel").props.value).toBe("camera");
    props = { ...props, accessPending: false };
    await submit();
    expect(state.upload.mock.calls[0][0].file).toBe(image);
  });

  it("keeps field-only access to photos and rejects a PDF before starting an upload", async () => {
    props = { ...props, fieldPhotosOnly: true };
    const html = renderToStaticMarkup(tree());
    expect(html).not.toContain("Importer FØR-dronefotos");
    expect(labelled("Vælg andet foto eller bilag").props.accept).toBe("image/*");
    await select(new File(["synthetic PDF"], "test.pdf", { type: "application/pdf" }));
    expect(button("Gem foto eller bilag").props.disabled).toBe(true);
    expect(state.upload).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(tree())).toContain("Feltadgangen kan uploade fotos");
  });

  it("offers camera capture alongside the existing image and PDF picker", async () => {
    const camera = labelled("Tag feltfoto med kamera");
    expect(camera.props.accept).toBe("image/*");
    expect(camera.props.capture).toBe("environment");
    expect(labelled("Vælg andet foto eller bilag").props.accept).toBe("image/*,application/pdf");
    const image = new File(["camera-original"], "camera.jpg", { type: "image/jpeg" });
    await (camera.props.onChange as (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>)({
      target: { files: [image] },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(labelled("Titel").props.value).toBe("camera");
    await submit();
    expect(state.upload.mock.calls[0][0].file).toBe(image);
    expect(state.upload.mock.calls[0][0].coordinates).toBeUndefined();
  });

  it("preserves the same intent when a failed upload is retried", async () => {
    state.upload.mockResolvedValue({ data: null, error: "Serverkontrol mangler" });
    await select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
    await submit();
    await submit();
    expect(state.upload.mock.calls[0][0].uploadRequestId).toBe(
      state.upload.mock.calls[1][0].uploadRequestId,
    );
    expect(labelled("Titel").props.value).toBe("A");
  });
  it("pauses the transfer and discards old results when the user changes", async () => {
    const pending = deferred<{ data: ProjectMediaItem | null; error: string | null }>();
    state.upload.mockReturnValue(pending.promise);
    await select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
    const submission = submit();
    const signal = state.upload.mock.calls[0][0].signal!;
    state.actorId = "another-actor";
    tree();
    expect(signal.aborted).toBe(true);
    pending.resolve({ data: saved, error: null });
    await submission;
    expect(props.onUploadComplete).not.toHaveBeenCalled();
    expect(labelled("Titel").props.value).toBe("");
  });
  it("clears GPS, metadata and the old preview when GPS photo A is replaced by no-GPS photo B", async () => {
    state.gps
      .mockResolvedValueOnce({ latitude: 55.4, longitude: 9.2 })
      .mockResolvedValueOnce(undefined);
    await select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
    expect(labelled("Breddegrad").props.value).toBe("55.4");
    input("Beskrivelse", "Only A");
    input("Tags", "A");
    input("Kategori", "water_observation");
    const photoB = new File(["b"], "B.jpg", { type: "image/jpeg" });
    await select(photoB);
    expect(labelled("Breddegrad").props.value).toBe("");
    expect(labelled("Længdegrad").props.value).toBe("");
    expect(labelled("Beskrivelse").props.value).toBe("");
    expect(labelled("Tags").props.value).toBe("");
    expect(labelled("Kategori").props.value).toBe("field_photo");
    expect(labelled("Titel").props.value).toBe("B");
    expect(revokePreview).toHaveBeenCalledWith("blob:synthetic-1");
    expect(find(tree(), (element) => element.type === "img")?.props.src).toBe("blob:synthetic-2");
    await submit();
    expect(state.upload).toHaveBeenCalledOnce();
    expect(state.upload.mock.calls[0][0]).toMatchObject({
      file: photoB,
      title: "B",
      isReportReady: false,
      tags: [],
    });
    expect(state.upload.mock.calls[0][0].coordinates).toBeUndefined();
    expect(state.upload.mock.calls[0][0].description).toBeUndefined();
    expect(props.onUploadComplete).toHaveBeenCalledWith(saved);
    expect(revokePreview).toHaveBeenCalledWith("blob:synthetic-2");
    expect(button("Gem foto eller bilag").props.disabled).toBe(true);
  });

  it.each([undefined, { latitude: 56.1, longitude: 10.5 }])(
    "ignores a late EXIF result from A after B has finished (%j)",
    async (positionB) => {
      const positionA = deferred<{ latitude: number; longitude: number } | undefined>();
      state.gps.mockReturnValueOnce(positionA.promise).mockResolvedValueOnce(positionB);
      const pendingA = select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
      await select(new File(["b"], "B.jpg", { type: "image/jpeg" }));
      positionA.resolve({ latitude: 55.4, longitude: 9.2 });
      await pendingA;
      expect(labelled("Breddegrad").props.value).toBe(positionB ? "56.1" : "");
      expect(labelled("Længdegrad").props.value).toBe(positionB ? "10.5" : "");
      await submit();
      expect(state.upload.mock.calls[0][0].coordinates).toEqual(
        positionB ? { lat: 56.1, lng: 10.5 } : undefined,
      );
    },
  );

  it("ignores EXIF completion after unmount and releases the preview", async () => {
    const position = deferred<{ latitude: number; longitude: number } | undefined>();
    state.gps.mockReturnValueOnce(position.promise);
    const pending = select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
    unmount();
    const writes = state.writes;
    position.resolve({ latitude: 55.4, longitude: 9.2 });
    await pending;
    expect(state.writes).toBe(writes);
    expect(revokePreview).toHaveBeenCalledWith("blob:synthetic-1");
    expect(state.upload).not.toHaveBeenCalled();
  });

  it("keeps B's metadata read pending when A finishes in the meantime", async () => {
    const positionA = deferred<{ latitude: number; longitude: number } | undefined>();
    const positionB = deferred<{ latitude: number; longitude: number } | undefined>();
    state.gps.mockReturnValueOnce(positionA.promise).mockReturnValueOnce(positionB.promise);
    const pendingA = select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
    const pendingB = select(new File(["b"], "B.jpg", { type: "image/jpeg" }));
    positionA.resolve({ latitude: 55.4, longitude: 9.2 });
    await pendingA;
    expect(labelled("Breddegrad").props.value).toBe("");
    expect(button("Gem foto eller bilag").props.disabled).toBe(true);
    expect(labelled("Breddegrad").props.disabled).toBe(true);
    positionB.resolve(undefined);
    await pendingB;
    expect(button("Gem foto eller bilag").props.disabled).toBe(false);
  });

  it.each(["invalid", "oversize", "empty"])(
    "clears old fields and preview for an %s replacement",
    async (kind) => {
      state.gps.mockResolvedValueOnce({ latitude: 55.4, longitude: 9.2 });
      await select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
      input("Beskrivelse", "Only A");
      const replacement =
        kind === "empty"
          ? null
          : new File(["b"], "B.txt", { type: kind === "invalid" ? "text/plain" : "image/jpeg" });
      if (kind === "oversize" && replacement)
        Object.defineProperty(replacement, "size", { value: 51 * 1024 * 1024 });
      await select(replacement);
      expect(labelled("Breddegrad").props.value).toBe("");
      expect(labelled("Længdegrad").props.value).toBe("");
      expect(labelled("Titel").props.value).toBe("");
      expect(labelled("Beskrivelse").props.value).toBe("");
      expect(find(tree(), (element) => element.type === "img")).toBeNull();
      expect(revokePreview).toHaveBeenCalledWith("blob:synthetic-1");
      expect(button("Gem foto eller bilag").props.disabled).toBe(true);
      expect(state.upload).not.toHaveBeenCalled();
    },
  );

  it("invalidates pending EXIF on an invalid replacement", async () => {
    const position = deferred<{ latitude: number; longitude: number } | undefined>();
    state.gps.mockReturnValueOnce(position.promise);
    const pendingA = select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
    await select(new File(["bad"], "B.exe", { type: "application/octet-stream" }));
    position.resolve({ latitude: 55.4, longitude: 9.2 });
    await pendingA;
    expect(labelled("Breddegrad").props.value).toBe("");
    expect(find(tree(), (element) => element.props.role === "alert")).not.toBeNull();
    expect(button("Gem foto eller bilag").props.disabled).toBe(true);
  });

  it("clears the selection and blocks the prior project's async result on a project change", async () => {
    const position = deferred<{ latitude: number; longitude: number } | undefined>();
    state.gps.mockReturnValueOnce(position.promise);
    const pendingA = select(new File(["a"], "A.jpg", { type: "image/jpeg" }));
    props = { ...props, projectId: "project-b" };
    tree();
    position.resolve({ latitude: 55.4, longitude: 9.2 });
    await pendingA;
    expect(labelled("Titel").props.value).toBe("");
    expect(labelled("Breddegrad").props.value).toBe("");
    expect(revokePreview).toHaveBeenCalledWith("blob:synthetic-1");
  });
});

describe("ProjectMediaUploadPanel task entry", () => {
  it("opens field capture first, keeps optional fields folded, and preserves the drone callback", () => {
    const result = tree();
    const html = renderToStaticMarkup(result);
    expect(html.indexOf("Feltfoto eller bilag")).toBeLessThan(
      html.indexOf("Importer FØR-dronefotos"),
    );
    expect(html).not.toContain("Rapportklar");
    expect(html).not.toContain("centroid");
    const detail = find(result, (element) => element.type === "details");
    expect(detail?.props.open).toBe(true);
    const optional = find(
      result,
      (element) =>
        element.type === "details" &&
        text(element.props.children as React.ReactNode).startsWith("Flere oplysninger"),
    );
    expect(optional).not.toBeNull();
    expect(optional?.props.open).toBeUndefined();
    (button("Importer FØR-dronefotos").props.onClick as () => void)();
    const batch = find(tree(), (element) => element.type === DroneBeforeBatchWizard);
    expect(batch?.props.open).toBe(true);
    expect(batch?.props.projectId).toBe("project-a");
    expect(batch?.props.onImported).toBe(props.onDroneBatchImported);
  });

  it("uploads a PDF without guessed position, with a filename title and review still pending", async () => {
    const file = new File(["synthetic PDF"], "Besigtigelse.pdf", { type: "application/pdf" });
    await select(file);
    await submit();
    expect(state.gps).not.toHaveBeenCalled();
    expect(createPreview).not.toHaveBeenCalled();
    expect(state.upload.mock.calls[0][0]).toMatchObject({
      file,
      title: "Besigtigelse",
      category: "document_scan",
      isReportReady: false,
    });
    expect(state.upload.mock.calls[0][0].coordinates).toBeUndefined();
    expect(text(find(tree(), (element) => element.props.role === "status"))).toContain(
      "afventer gennemgang",
    );
  });
});
