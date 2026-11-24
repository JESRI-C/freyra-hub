// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyCustomer,
  type CustomerCommand,
  type CustomerDetail,
  type CustomerQuery,
} from "@/lib/work-customers";
import { WorkOrderRequestError } from "@/lib/work-order-access";
const m = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(),
  blocker: vi.fn(),
  actor: "00000000-0000-4000-8000-000000000001",
  org: "00000000-0000-4000-8000-000000000002",
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: m.actor }, orgId: m.org, refresh: m.refresh }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/work-customers.functions", () => ({
  getWorkCustomers: m.load,
  saveWorkCustomerCommand: m.save,
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: m.blocker,
  Link: ({ children, params }: { children: React.ReactNode; params: { slug: string } }) => (
    <a href={`/app/projects/${params.slug}`}>{children}</a>
  ),
}));
import { CustomerWorkspace } from "../CustomerWorkspace";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function detail(): CustomerDetail {
  return {
    organizationId: m.org,
    canManage: true,
    customer: {
      id: id(3),
      number: "K-000001",
      version: 1,
      data: { ...emptyCustomer, name: "Fiktiv skovkunde", address: "Fiktiv adresse" },
    },
    contacts: [
      {
        id: id(4),
        version: 1,
        data: {
          name: "Fiktiv kontakt",
          title: "Kontakt",
          email: "contact@example.test",
          phone: "FIKTIV",
          archived: false,
        },
      },
    ],
    history: [
      {
        version: 1,
        changedAt: "2026-11-24T08:00:00Z",
        data: { ...emptyCustomer, name: "Fiktiv skovkunde" },
      },
    ],
    planners: [],
    availableUsers: [{ userId: id(6), name: "Fiktiv planlægger" }],
  };
}
function receipt(data: CustomerCommand) {
  return {
    organizationId: data.organizationId,
    actorId: data.expectedActorId,
    requestId: data.requestId,
    operation: data.operation,
    id: id(5),
    version: 1,
    number: data.operation === "create_case" ? "S-000001" : "K-000002",
  };
}
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <CustomerWorkspace />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function button(text: string) {
  const result = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  expect(result, text).toBeTruthy();
  return result!;
}
async function click(text: string) {
  await act(async () => button(text).click());
  await flush();
}
async function selectCustomer() {
  const node = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Fiktiv skovkunde"),
  );
  expect(node).toBeTruthy();
  await act(async () => node!.click());
  await flush();
}
function field(text: string) {
  const node = [...host.querySelectorAll("label")]
    .find((l) => l.firstChild?.textContent?.trim() === text)
    ?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  expect(node, text).toBeTruthy();
  return node!;
}
async function change(text: string, value: string) {
  const node = field(text);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(
      new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
}
async function submit() {
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.actor = id(1);
  m.org = id(2);
  m.blocker.mockReset();
  m.refresh.mockReset().mockResolvedValue({ projectSelected: false });
  m.load
    .mockReset()
    .mockImplementation(async ({ data }: { data: CustomerQuery }) =>
      data.operation === "list"
        ? {
            organizationId: data.organizationId,
            canManage: true,
            rows: [detail().customer],
            hasMore: false,
          }
        : {
            ...detail(),
            customer: {
              ...detail().customer,
              id: data.operation === "customer" ? data.customerId : id(3),
            },
          },
    );
  m.save
    .mockReset()
    .mockImplementation(async ({ data }: { data: CustomerCommand }) => receipt(data));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});

describe("kundens sammenhængende arbejdsrum", () => {
  it("opretter en sag med valgt kontakt og åbner det eksisterende jobarbejdsrum", async () => {
    await render();
    await selectCustomer();
    await click("Opret sag under kunden");
    await change("Sagens navn", "Fiktiv Dalgas-demo");
    await change("Kundens reference", "DEMO-REF");
    await change("Kontaktperson på sagen", id(4));
    await submit();
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(m.save.mock.calls[0][0].data).toMatchObject({
      operation: "create_case",
      organizationId: id(2),
      expectedActorId: id(1),
      customerId: id(3),
      contactId: id(4),
      title: "Fiktiv Dalgas-demo",
      customerReference: "DEMO-REF",
    });
    expect(host.querySelector(`a[href="/app/projects/${id(5)}"]`)).toBeTruthy();
  });
  it("genbruger det præcise request efter tabt svar og låser ændringer indtil afklaring", async () => {
    m.save.mockRejectedValueOnce(new Error("Connection lost"));
    await render();
    await click("Opret kunde");
    await change("Kundenavn", "Fiktiv ny kunde");
    await submit();
    const original = structuredClone(m.save.mock.calls[0][0]);
    expect(field("Kundenavn").matches(":disabled")).toBe(true);
    expect(button("Fortryd").disabled).toBe(true);
    expect(m.blocker.mock.calls.at(-1)?.[0].shouldBlockFn()).toBe(true);
    await click("Prøv samme gemning igen");
    expect(m.save).toHaveBeenCalledTimes(2);
    expect(m.save.mock.calls[1][0]).toEqual(original);
    expect(host.querySelector("form")).toBeNull();
  });
  it("sender kun én kommando ved gentagne tryk mens gemningen kører", async () => {
    let resolve!: (value: ReturnType<typeof receipt>) => void;
    m.save.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await render();
    await click("Opret kunde");
    await change("Kundenavn", "Fiktiv ny kunde");
    await submit();
    await submit();
    expect(m.save).toHaveBeenCalledTimes(1);
    await act(async () => resolve(receipt(m.save.mock.calls[0][0].data)));
    await flush();
    expect(host.querySelector("form")).toBeNull();
  });
  it("bevarer en konfliktende kladde og erstatter aldrig automatisk dens forventede version", async () => {
    m.save.mockRejectedValue(new WorkOrderRequestError("conflict"));
    await render();
    await selectCustomer();
    await click("Redigér kunde");
    await change("Kundenavn", "Min bevarede rettelse");
    await submit();
    expect(field("Kundenavn").value).toBe("Min bevarede rettelse");
    expect(host.textContent).toContain("En anden har ændret oplysningerne");
    await submit();
    expect(m.save.mock.calls.map((c) => c[0].data.expectedVersion)).toEqual([1, 1]);
    expect(button("Fortryd").disabled).toBe(false);
  });
  it("viser ikke tidligere kundedata eller en forsinket kvittering efter organisations- og aktørskift", async () => {
    let resolve!: (value: ReturnType<typeof receipt>) => void;
    m.save.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await render();
    await selectCustomer();
    await click("Redigér kunde");
    await change("Kundenavn", "Privat gammelt udkast");
    await submit();
    const original = m.save.mock.calls[0][0].data;
    m.actor = id(10);
    m.org = id(11);
    m.load.mockResolvedValue({ organizationId: m.org, canManage: false, rows: [], hasMore: false });
    await render();
    expect(host.textContent).not.toContain("Fiktiv skovkunde");
    expect(host.textContent).not.toContain("Fiktiv adresse");
    expect(host.querySelector("form")).toBeNull();
    await act(async () => resolve(receipt(original)));
    await flush();
    expect(host.textContent).not.toContain("Privat gammelt udkast");
    expect(host.querySelector("a")).toBeNull();
  });
  it("giver ikke en planlægger kundeadministration og tilbyder ikke nye sager på arkiverede kunder", async () => {
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) =>
      data.operation === "list"
        ? { organizationId: m.org, canManage: false, rows: [detail().customer], hasMore: false }
        : {
            ...detail(),
            canManage: false,
            customer: { ...detail().customer, data: { ...detail().customer.data, archived: true } },
          },
    );
    await render();
    expect(host.textContent).not.toContain("Opret kunde");
    await selectCustomer();
    expect(host.textContent).toContain("Arkiveret kunde");
    expect(host.textContent).not.toContain("Redigér kunde");
    expect(host.textContent).not.toContain("Opret sag under kunden");
  });
  it("viser en kildefejl i stedet for en tom kundeliste ved afvist adgang", async () => {
    m.load.mockRejectedValue(new WorkOrderRequestError("access"));
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Kunderne kunne ikke hentes",
    );
    expect(host.textContent).not.toContain("Ingen kunder i denne visning");
    expect(host.textContent).not.toContain("Opret kunde");
  });
});
