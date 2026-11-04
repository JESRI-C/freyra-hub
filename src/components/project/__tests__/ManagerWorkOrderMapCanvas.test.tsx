// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagerMapFeature } from "../manager-work-order-map-data";

const m = vi.hoisted(() => ({
  marker: vi.fn(),
  line: vi.fn(),
  fit: vi.fn(),
  setView: vi.fn(),
  remove: vi.fn(),
  redraw: vi.fn(),
  select: vi.fn(),
  viewport: vi.fn(),
  tileError: null as null | (() => void),
  moveEnd: null as null | (() => void),
  markers: [] as Array<{ click?: () => void; popup?: HTMLElement; title: string }>,
}));
vi.mock("leaflet", () => ({
  map: () => ({
    on: (_: string, fn: () => void) => {
      m.moveEnd = fn;
    },
    getCenter: () => ({ lat: 55, lng: 9 }),
    getZoom: () => 14,
    fitBounds: m.fit,
    setView: m.setView,
    remove: m.remove,
  }),
  tileLayer: () => {
    const layer = {
      on: (_: string, fn: () => void) => {
        m.tileError = fn;
        return layer;
      },
      addTo: () => layer,
      redraw: m.redraw,
    };
    return layer;
  },
  featureGroup: () => {
    const group = { addTo: () => group, remove: vi.fn() };
    return group;
  },
  divIcon: (value: unknown) => value,
  marker: (position: unknown, options: { title: string; icon: { html: HTMLElement } }) => {
    m.marker(position, options);
    const record: { click?: () => void; popup?: HTMLElement; title: string } = {
      title: options.title,
    };
    m.markers.push(record);
    const marker = {
      addTo: () => marker,
      on: (_: string, fn: () => void) => {
        record.click = fn;
        return marker;
      },
      bindPopup: (popup: HTMLElement) => {
        record.popup = popup;
        return marker;
      },
    };
    return marker;
  },
  polyline: (coordinates: unknown, options: unknown) => {
    m.line(coordinates, options);
    const line = {
      bindTooltip: (node: HTMLElement) => {
        expect(node.querySelector("img")).toBeNull();
        return line;
      },
      on: () => line,
      addTo: () => line,
    };
    return line;
  },
}));
import Canvas from "../ManagerWorkOrderMapCanvas";
const point: ManagerMapFeature = {
  key: "one",
  actionId: "job-one",
  projectId: "project-one",
  title: "<img src=x onerror=alert(1)>",
  projectName: "Bykær",
  color: "#15803d",
  location: {
    id: "site",
    source: "plan_site",
    source_id: "site-one",
    source_version_id: null,
    name: "Engen",
    coordinate_source: "site_point",
    sequence: 0,
    archived: false,
    geometry: { type: "Point", coordinates: [9, 55] },
  },
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
async function render(
  features: ManagerMapFeature[],
  viewport: { lat: number; lng: number; zoom: number } | null = null,
) {
  await act(async () =>
    root.render(
      <Canvas
        features={features}
        selectedActionId={null}
        onSelect={m.select}
        viewport={viewport}
        onViewport={m.viewport}
      />,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  m.markers = [];
  m.tileError = null;
  m.moveEnd = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("read-only manager map canvas", () => {
  it("uses saved longitude/latitude in Leaflet order and selects the exact task without interpreting its title as HTML", async () => {
    await render([point]);
    expect(m.marker.mock.calls[0][0]).toEqual([55, 9]);
    expect(m.fit.mock.calls[0][0]).toEqual([[55, 9]]);
    const icon = m.marker.mock.calls[0][1].icon.html as HTMLElement;
    expect(icon.querySelector("img")).toBeNull();
    expect(m.markers[0].title).toContain("<img src=x onerror=alert(1)>");
    m.markers[0].click!();
    expect(m.select).toHaveBeenCalledWith("job-one", "project-one");
  });
  it("offers every job sharing one position with safe DOM text instead of hiding jobs behind a marker", async () => {
    await render([
      point,
      {
        ...point,
        key: "two",
        actionId: "job-two",
        projectId: "project-two",
        title: "<img src=x> Anden opgave",
      },
    ]);
    expect(m.markers).toHaveLength(1);
    expect(m.markers[0].title).toBe("2 arbejdsordrer på samme position");
    const popup = m.markers[0].popup!;
    expect(popup.querySelectorAll("button")).toHaveLength(2);
    expect(popup.querySelector("img")).toBeNull();
    popup.querySelectorAll("button")[1].click();
    expect(m.select).toHaveBeenCalledWith("job-two", "project-two");
  });
  it("renders exact saved lines and gives a usable tile failure message and retry", async () => {
    await render([
      {
        ...point,
        location: {
          ...point.location,
          source: "plan_watercourse",
          coordinate_source: "pinned_centerline",
          source_version_id: "line",
          sequence: null,
          geometry: {
            type: "LineString",
            coordinates: [
              [9, 55],
              [10, 56],
            ],
          },
        },
      },
    ]);
    expect(m.line.mock.calls[0][0]).toEqual([
      [55, 9],
      [56, 10],
    ]);
    await act(async () => m.tileError!());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Opgavernes gemte positioner og opgavelisten kan stadig bruges",
    );
    await act(async () => host.querySelector("button")!.click());
    expect(m.redraw).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it("restores an in-memory viewport and removes the old map on unmount", async () => {
    await render([point], { lat: 56, lng: 10, zoom: 13 });
    expect(m.setView).toHaveBeenCalledWith([56, 10], 13, { animate: false });
    expect(m.fit).not.toHaveBeenCalled();
    m.moveEnd!();
    expect(m.viewport).toHaveBeenCalledWith({ lat: 55, lng: 9, zoom: 14 });
    await act(async () => root.render(<div />));
    expect(m.remove).toHaveBeenCalledTimes(1);
  });

  it("preserves the viewport when a failed page or status refresh recreates the same geometry", async () => {
    await render([point]);
    expect(m.fit).toHaveBeenCalledTimes(1);
    await render([
      {
        ...point,
        title: "Opdateret titel",
        location: { ...point.location, geometry: { type: "Point", coordinates: [9, 55] } },
      },
    ]);
    expect(m.fit).toHaveBeenCalledTimes(1);
    await render([
      {
        ...point,
        location: { ...point.location, geometry: { type: "Point", coordinates: [10, 56] } },
      },
    ]);
    expect(m.fit).toHaveBeenCalledTimes(2);
  });
});
