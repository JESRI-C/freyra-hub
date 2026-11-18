// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { BridgeObservationsPanel } from "../BridgeObservationsPanel";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/services/field-offline-service", () => ({ prepareOfflinePhoto: mocks.prepare }));
vi.mock("@/services/bridge-photo-queue-service", () => ({ uploadQueuedBridgePhoto: mocks.upload }));
vi.mock("@/services/bridge-observation-service", () => ({
  listBridgeObservations: mocks.list,
  saveBridgeObservation: mocks.create,
}));
vi.mock("@/services/report-document-service", () => ({ loadReportSources: async () => [] }));
vi.mock("@/components/maps/MapEditorMap", () => ({
  MapEditorMap: ({
    locationPoints,
  }: {
    locationPoints: { label: string; visitNumber: number }[];
  }) => (
    <div data-testid="markers">
      {locationPoints.map((p) => p.visitNumber + ". " + p.label).join(", ")}
    </div>
  ),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([]);
});

it("ignores an old GPS response after a manual correction and numbers objects in report order", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const cache = new QueryClient();
  const rows = [
    {
      id: "ten",
      metadata: { objectId: "BR-10" },
      latitude: 55.2,
      longitude: 9.5,
      notes: "Beton",
      observed_at: "2026-11-17T12:00:00Z",
    },
    {
      id: "two",
      metadata: { objectId: "BR-2" },
      latitude: 55.3,
      longitude: 9.6,
      notes: "Rør",
      observed_at: "2026-11-17T13:00:00Z",
    },
  ];
  mocks.list.mockResolvedValue(rows);
  cache.setQueryData(["bridge-observations", "actor", "project"], rows);
  const getCurrentPosition = vi.fn();
  const originalGps = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <BridgeObservationsPanel projectId="project" actorId="actor" canEdit />
        </QueryClientProvider>,
      ),
    );
    const numbers = Array.from(host.querySelectorAll("ol strong"), (el) => el.textContent);
    expect(numbers).toEqual(["1. BR-2", "2. BR-10"]);
    expect(host.querySelector('[data-testid="markers"]')?.textContent).toBe(numbers.join(", "));
    expect(mocks.list).toHaveBeenCalledWith("project", "actor");
    const locate = Array.from(host.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Brug min GPS-position"),
    )!;
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => locate.click());
    expect(submit.disabled).toBe(true);
    const [lat, lng] = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    function changeCoordinate(input: HTMLInputElement, value: string) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await act(async () => {
      changeCoordinate(lat, "55.45");
      changeCoordinate(lng, "9.55");
    });
    expect(submit.disabled).toBe(false);
    await act(async () => {
      getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 54, longitude: 8, accuracy: 3 } });
    });
    expect([lat.value, lng.value]).toEqual(["55.45", "9.55"]);
    expect(host.textContent).not.toContain("cirka 3 m");
  } finally {
    if (originalGps) Object.defineProperty(navigator, "geolocation", originalGps);
    else Reflect.deleteProperty(navigator, "geolocation");
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("retries the original upload and saves only the verified photo with the bridge", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const queryClient = new QueryClient();
  const uploadId = "6931395b-b7a4-422c-812e-d25313885fd9";
  const payload = { title: "bridge" };
  const file = new File(["photo"], "bridge.jpg", { type: "image/jpeg" });
  mocks.prepare.mockResolvedValue({ id: uploadId, payload });
  mocks.upload
    .mockRejectedValueOnce(new Error("Midlertidig afbrudt"))
    .mockResolvedValueOnce({ id: uploadId, title: "bridge" });
  mocks.create.mockResolvedValue({});
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <BridgeObservationsPanel projectId="project" actorId="actor" canEdit />
        </QueryClientProvider>,
      ),
    );
    const camera = host.querySelector<HTMLInputElement>('input[capture="environment"]')!;
    Object.defineProperty(camera, "files", { value: [file] });
    await act(async () => {
      camera.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    });
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    expect(host.textContent).toContain("Midlertidig afbrudt");
    const retry = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Prøv samme foto igen"),
    )!;
    await act(async () => retry.click());
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenLastCalledWith(
      { id: uploadId, payload },
      file,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(submit.disabled).toBe(false);

    const geolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (position: unknown) => void) =>
          ok({
            coords: { latitude: 55.25, longitude: 9.5, accuracy: 4 },
          }),
      },
    });
    try {
      await act(async () =>
        Array.from(host.querySelectorAll("button"))
          .find((button) => button.textContent?.includes("Brug min GPS-position"))!
          .click(),
      );
    } finally {
      if (geolocation) Object.defineProperty(navigator, "geolocation", geolocation);
      else Reflect.deleteProperty(navigator, "geolocation");
    }
    host.querySelector<HTMLInputElement>('input[name="objectId"]')!.value = "BR-1";
    host.querySelector<HTMLTextAreaElement>('textarea[name="conditions"]')!.value =
      "Synlig erosion";
    await act(async () => {
      submit.click();
      await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project",
        latitude: 55.25,
        longitude: 9.5,
        metadata: expect.objectContaining({ photoSourceIds: [`media:${uploadId}`] }),
      }),
      "actor",
    );
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    host.remove();
    vi.unstubAllGlobals();
  }
});
