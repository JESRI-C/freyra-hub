// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EquipmentRentalRate } from "../EquipmentRentalRate";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: () => ({ rpc: mock.rpc }),
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const props = {
  actorId: id(1),
  organizationId: id(2),
  equipmentId: id(3),
  disabled: false,
  onEditing: vi.fn(),
};
const empty = () => ({
  equipment_id: id(3),
  organization_id: id(2),
  version: 0,
  daily_price_minor: null as number | null,
  currency: "DKK",
  can_edit: true,
  changed_at: null as string | null,
  changed_by: null as string | null,
  history: [] as Array<Record<string, unknown>>,
});
let receipt = empty();
let writeError: { code: string } | null;
let host: HTMLDivElement, root: Root, cache: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  receipt = empty();
  writeError = null;
  props.onEditing.mockClear();
  mock.rpc.mockReset();
  mock.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === "read_work_equipment_rental_rate")
      return { abortSignal: () => Promise.resolve({ data: receipt, error: null }) };
    if (writeError) return Promise.resolve({ data: null, error: writeError });
    receipt = {
      ...receipt,
      version: Number(args.p_expected_version) + 1,
      daily_price_minor: args.p_daily_price_minor as number | null,
      changed_at: "2026-11-17T10:00:00Z",
      changed_by: id(1),
    };
    receipt.history = [
      {
        version: receipt.version,
        daily_price_minor: receipt.daily_price_minor,
        changed_at: receipt.changed_at,
        changed_by: id(1),
      },
    ];
    return Promise.resolve({
      data: { ...receipt, recorded_version: receipt.version },
      error: null,
    });
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  cache.clear();
});
async function tick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}
async function mount(actorId = props.actorId) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <EquipmentRentalRate {...props} actorId={actorId} />
      </QueryClientProvider>,
    ),
  );
}
async function open() {
  await act(async () => {
    const node = host.querySelector("details")!;
    node.open = true;
    node.dispatchEvent(new Event("toggle", { bubbles: true }));
  });
  await tick();
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((node) => node.textContent === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
  await tick();
}
async function enter(value: string) {
  await act(async () => {
    const node = host.querySelector('input[type="text"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await tick();
}
const writes = () =>
  mock.rpc.mock.calls.filter(([name]) => name === "set_work_equipment_rental_rate");
async function edit() {
  await click("Redigér dagspris");
  await act(async () => {
    (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
  });
}
it("saves exact minor units, reloads the receipt and releases the editor lock", async () => {
  await mount();
  await open();
  await edit();
  await enter("125,50");
  await submit();
  expect(writes()[0][1]).toMatchObject({ p_expected_version: 0, p_daily_price_minor: 12550 });
  expect(host.textContent).toContain("Prisændringen er registreret.");
  expect(host.textContent).toContain("125,50");
  expect(host.querySelector("form")).toBeNull();
  expect(props.onEditing).toHaveBeenLastCalledWith(false);
});
it("keeps the same request after an unconfirmed write and rejects malformed prices locally", async () => {
  await mount();
  await open();
  await edit();
  await enter("1,234");
  await submit();
  expect(writes()).toHaveLength(0);
  await enter("125.50");
  writeError = { code: "NETWORK" };
  await submit();
  expect(host.textContent).toContain("Gemningen kunne ikke bekræftes");
  const first = writes()[0][1];
  writeError = null;
  await submit();
  expect(writes()[1][1]).toEqual(first);
});
it("preserves a conflicting draft until the user explicitly reloads it", async () => {
  await mount();
  await open();
  await edit();
  await enter("125,50");
  writeError = { code: "PT409" };
  await submit();
  expect((host.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("125,50");
  receipt = { ...receipt, version: 2, daily_price_minor: 20000 };
  await click("Hent aktuel pris og luk rettelsen");
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).toContain("200,00");
});
it("shows a project manager the rate without edit controls", async () => {
  receipt = { ...receipt, can_edit: false, daily_price_minor: 0 };
  await mount();
  await open();
  expect(host.textContent).toContain("0,00");
  expect(host.textContent).toContain("ejer eller administrator");
  expect(
    [...host.querySelectorAll("button")].some((node) => node.textContent === "Redigér dagspris"),
  ).toBe(false);
});
it("discards an unsaved draft when the authenticated actor changes", async () => {
  await mount();
  await open();
  await edit();
  await enter("123");
  await mount(id(9));
  expect(host.querySelector("form")).toBeNull();
  expect((host.querySelector("details") as HTMLDetailsElement).open).toBe(false);
});
