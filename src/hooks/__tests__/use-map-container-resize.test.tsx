// @vitest-environment jsdom
import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useMapContainerResize } from "../use-map-container-resize";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
it("resizes a retained map when its container reopens, without panning or observing after unmount", async () => {
  let resized: ResizeObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const invalidateSize = vi.fn();
  function Map() {
    const container = useRef<HTMLDivElement>(null);
    const map = useRef({ invalidateSize });
    useMapContainerResize(container, map);
    return <div ref={container} />;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Map />));
    expect(observe).toHaveBeenCalledWith(host.firstChild);
    const notify = (width: number, height: number) =>
      resized([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver);
    notify(0, 0);
    expect(invalidateSize).not.toHaveBeenCalled();
    notify(640, 360);
    expect(invalidateSize).toHaveBeenCalledWith({ animate: false, pan: false });
    notify(320, 360);
    expect(invalidateSize).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
  }
  expect(disconnect).toHaveBeenCalledOnce();
});
