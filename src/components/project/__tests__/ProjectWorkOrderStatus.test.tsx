// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ProjectWorkOrderStatus } from "../ProjectWorkOrderStatus";
import type { ProjectWorkOrderStatus as Projection } from "@/lib/project-work-order-status";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function show(projection: Projection | undefined, legacyStatus: string | null = null) {
  await act(async () =>
    root.render(<ProjectWorkOrderStatus projection={projection} legacyStatus={legacyStatus} />),
  );
}
it("retains the recorded status label and its established color while displaying a separate block", async () => {
  await show(
    { state: "recorded", initialized: true, status: "submitted", version: 3, blocked: true },
    "Åben",
  );
  expect(host.textContent).toBe("Senest registreret: AfleveretBlokeret");
  expect(host.querySelector(".bg-violet-100")).not.toBeNull();
  expect(host.querySelector(".bg-amber-100")?.textContent).toBe("Blokeret");
  expect(host.textContent).not.toContain("Aktuel");
  expect(host.textContent).not.toContain("Historisk");
  await show({
    state: "recorded",
    initialized: true,
    status: "reopened",
    version: 4,
    blocked: false,
  });
  expect(host.textContent).toBe("Senest registreret: Genåbnet");
  expect(host.querySelector(".bg-amber-100")).not.toBeNull();
});
it("keeps missing, unrecognized and not-yet-fetched status distinct, and renders legacy text safely", async () => {
  await show(undefined, "<img src=x onerror=alert(1)>");
  expect(host.textContent).toContain("Status ikke hentet");
  expect(host.textContent).toContain("Tidligere status: <img src=x onerror=alert(1)>");
  expect(host.querySelector("img")).toBeNull();
  await show(
    { state: "missing", initialized: true, status: null, version: null, blocked: false },
    "Åben",
  );
  expect(host.textContent).toBe("Jobstatus manglerTidligere status: Åben");
  await show({ state: "unrecognized", initialized: true, status: null, version: 1, blocked: true });
  expect(host.textContent).toBe("Ukendt jobstatusBlokeret");
  expect(host.textContent).not.toContain("Kladde");
});
it("gives cancellation a neutral label without an active-waiting badge", async () => {
  await show({
    state: "recorded",
    initialized: true,
    status: "cancelled",
    version: 3,
    blocked: true,
  });
  expect(host.textContent).toBe("Senest registreret: Annulleret");
  expect(host.querySelector(".bg-amber-100")).toBeNull();
});
