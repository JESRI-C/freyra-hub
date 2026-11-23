// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ConnectorStatusPanel } from "./ConnectorStatusPanel";

it("distinguishes retrieved, stored and unverified sources from live connections", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ConnectorStatusPanel
          connectors={[
            {
              name: "Nature",
              slug: "nature",
              provider: "Official",
              status: "retrieved",
              lastChecked: "2026-11-18T00:00:00Z",
            },
            { name: "Device", slug: "device", provider: "Project", status: "stored" },
            { name: "Weather", slug: "weather", provider: "DMI", status: "unverified" },
          ]}
        />,
      ),
    );
    expect(host.textContent).toContain("0 af 3 live");
    expect(host.textContent).toContain("Hentede data");
    expect(host.textContent).toContain("Gemte data");
    expect(host.textContent).toContain("Ikke verificeret");
    expect(host.querySelector("time")?.dateTime).toBe("2026-11-18T00:00:00Z");
    await act(async () =>
      root.render(
        <ConnectorStatusPanel
          connectors={[
            { name: "Nature", slug: "nature", provider: "Official", status: "checking" },
          ]}
        />,
      ),
    );
    expect(host.textContent).toContain("Henter");
    expect(host.querySelector("time")).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
