// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import Canvas from "../ManagerWorkOrderMapCanvas";
import type { ManagerMapFeature } from "../manager-work-order-map-data";

const features: ManagerMapFeature[] = [0, 1].map((index) => ({
  key: `site-${index}`,
  actionId: `job-${index}`,
  projectId: "synthetic-project",
  title: `Synthetic job ${index}`,
  projectName: "Synthetic project",
  color: "#15803d",
  location: {
    id: `site-${index}`,
    source: "plan_site",
    source_id: `site-${index}`,
    source_version_id: null,
    name: `Synthetic site ${index}`,
    coordinate_source: "site_point",
    sequence: 0,
    archived: false,
    geometry: { type: "Point", coordinates: [9.4 + index / 100, 56.1 + index / 100] },
  },
}));
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("opens the selected task while unmounting the actual Leaflet event target", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  function Example() {
    const [selected, select] = useState<string | null>(null);
    return selected ? (
      <article>
        <h2>{selected}</h2>
      </article>
    ) : (
      <Canvas
        features={features}
        selectedActionId={null}
        onSelect={select}
        viewport={null}
        onViewport={() => undefined}
      />
    );
  }
  await act(async () => root.render(<Example />));
  for (
    let attempt = 0;
    attempt < 20 && !host.querySelector('[aria-label="Åbn opgave: Synthetic job 1"]');
    attempt++
  ) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  const marker = host.querySelector<HTMLButtonElement>(
    '[aria-label="Åbn opgave: Synthetic job 1"]',
  );
  expect(marker).not.toBeNull();
  await act(async () => marker!.click());
  expect(host.querySelector("h2")?.textContent).toBe("job-1");
});
