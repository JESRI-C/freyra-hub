// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { BeforeAfterCompare } from "../BeforeAfterCompare";
it("exposes a labelled native slider and updates its visual split through keyboard-compatible input", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<BeforeAfterCompare beforeUrl="before.jpg" afterUrl="after.jpg" />),
  );
  const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(host.querySelector("label")?.htmlFor).toBe(range.id);
  expect(range.value).toBe("50");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(range, "70");
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(range.getAttribute("aria-valuetext")).toContain("70 %");
  expect(host.innerHTML).toContain("inset(0 30% 0 0)");
  await act(async () => root.unmount());
  host.remove();
});
