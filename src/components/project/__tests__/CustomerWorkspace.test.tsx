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
    id:
      data.operation === "save_customer"
        ? (data.customerId ?? id(5))
        : data.operation === "save_contact"
          ? (data.contactId ?? id(5))
          : data.operation === "bind_case" || data.operation === "save_reference"
            ? data.projectId
            : id(5),
    version: "expectedVersion" in data ? data.expectedVersion + 1 : 1,
    number: data.operation === "create_case" ? "S-000001" : "K-000002",
  };
}
function loaded(data: CustomerQuery, value = detail()) {
  const base = { organizationId: data.organizationId, customerId: value.customer.id };
  if (data.operation === "list")
    return {
      organizationId: data.organizationId,
      canManage: value.canManage,
      rows: [value.customer],
      hasMore: false,
    };
  if (data.operation === "summary")
    return {
      organizationId: data.organizationId,
      canManage: value.canManage,
      customer: { ...value.customer, id: data.customerId },
    };
  if (data.operation === "cases") return { ...base, rows: [], hasMore: false };
  if (data.operation === "contacts") {
    const all = value.contacts.filter(
      (c) =>
        (data.includeArchived || !c.data.archived) &&
        `${c.data.name} ${c.data.phone}`.toLowerCase().includes(data.search.toLowerCase()),
    );
    return {
      ...base,
      rows: all.slice(data.offset, data.offset + 50),
      hasMore: all.length > data.offset + 50,
    };
  }
  if (data.operation === "contact") {
    const contact = value.contacts.find((c) => c.id === data.contactId);
    if (!contact) throw new WorkOrderRequestError("access");
    return { ...base, contact };
  }
  if (data.operation === "members") {
    const all = value.availableUsers
      .map((user) => ({
        ...user,
        version: value.planners.find((p) => p.userId === user.userId)?.version ?? 0,
        enabled: value.planners.find((p) => p.userId === user.userId)?.enabled ?? false,
        activeMember: true,
        administrator: false,
      }))
      .filter(
        (user) =>
          (!data.onlyEnabled || user.enabled) &&
          user.name.toLowerCase().includes(data.search.toLowerCase()),
      );
    return {
      ...base,
      rows: all.slice(data.offset, data.offset + 50),
      hasMore: all.length > data.offset + 50,
    };
  }
  if (data.operation === "history") {
    const all = [...value.history]
      .sort((a, b) => b.version - a.version)
      .filter((row) => data.beforeVersion === null || row.version < data.beforeVersion);
    return { ...base, rows: all.slice(0, 20), hasMore: all.length > 20 };
  }
  throw new Error(`Unexpected legacy or case query: ${data.operation}`);
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
  await vi.waitFor(() => expect(button(text).disabled).toBe(false));
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
  const node = [...host.querySelectorAll("label")].find(
    (l) => l.firstChild?.textContent?.trim() === text,
  )?.control as HTMLInputElement | HTMLSelectElement | null;
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
  await flush();
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
  m.load.mockReset();
  m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => loaded(data));
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
  it("åbner over 500 kontakter og bevarer den sidste side gennem redigering", async () => {
    const large = detail();
    large.contacts = Array.from({ length: 501 }, (_, i) => ({
      id: id(1000 + i),
      version: 1,
      data: { ...detail().contacts[0].data, name: `Contact ${String(i + 1).padStart(4, "0")}` },
    }));
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => loaded(data, large));
    m.save.mockImplementation(async ({ data }: { data: CustomerCommand }) => {
      if (data.operation === "save_contact")
        large.contacts = large.contacts.map((c) =>
          c.id === data.contactId ? { id: c.id, version: 2, data: data.data } : c,
        );
      return receipt(data);
    });
    await render();
    await selectCustomer();
    for (let i = 0; i < 10; i++) await click("Næste kontaktpersoner");
    const section = () => host.querySelector('[aria-label="Kontaktpersoner"]')!;
    await vi.waitFor(() => expect(section().textContent).toContain("Contact 0501"));
    await click("Redigér kontakt");
    await change("Telefon", "NY-TELEFON");
    await submit();
    expect(m.save.mock.calls[0][0].data).toMatchObject({ contactId: id(1500), expectedVersion: 1 });
    expect(section().textContent).toContain("Contact 0501");
    expect(section().textContent).toContain("NY-TELEFON");
    expect(section().textContent).not.toContain("Contact 0001");
    expect(m.load.mock.calls.every((c) => c[0].data.operation !== "customer")).toBe(true);
  });
  it("bevarer en kontakt uden for den aktuelle søgeresultatside på den nye sag", async () => {
    const large = detail();
    large.contacts = Array.from({ length: 501 }, (_, i) => ({
      id: id(1000 + i),
      version: 1,
      data: { ...detail().contacts[0].data, name: `Contact ${String(i + 1).padStart(4, "0")}` },
    }));
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => loaded(data, large));
    await render();
    await selectCustomer();
    await click("Opret sag under kunden");
    await change("Sagens navn", "Fiktiv sag med sen kontakt");
    await change("Søg kontaktperson", "Contact 0501");
    await change("Kontaktperson på sagen", id(1500));
    await change("Søg kontaktperson", "Contact 0001");
    expect(field("Kontaktperson på sagen").value).toBe(id(1500));
    await submit();
    expect(m.save.mock.calls[0][0].data).toMatchObject({
      operation: "create_case",
      contactId: id(1500),
    });
  });
  it("fastholder den valgte kollega og grantversion efter søgning i et stort register", async () => {
    const large = detail();
    large.availableUsers = Array.from({ length: 501 }, (_, i) => ({
      userId: id(2000 + i),
      name: `Member ${String(i + 1).padStart(4, "0")}`,
    }));
    large.planners = [{ userId: id(2500), enabled: true, version: 9 }];
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => loaded(data, large));
    await render();
    await selectCustomer();
    await click("Administrér planlæggere");
    await change("Søg kollega", "Member 0501");
    await change("Kollega", id(2500));
    large.planners = [{ userId: id(2500), enabled: false, version: 10 }];
    await change("Søg kollega", "Member 0001");
    expect(field("Kollega").value).toBe(id(2500));
    await submit();
    expect(m.save.mock.calls[0][0].data).toMatchObject({
      operation: "grant_planner",
      userId: id(2500),
      expectedVersion: 9,
      enabled: true,
    });
  });
  it("viser ældre kundeversioner og deres fulde adresse uden at ændre den aktuelle kunde", async () => {
    const value = detail();
    value.customer.version = 25;
    value.history = Array.from({ length: 25 }, (_, i) => ({
      version: 25 - i,
      changedAt: "2026-11-24T08:00:00Z",
      data: { ...value.customer.data, address: `Adresse version ${25 - i}` },
    }));
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => loaded(data, value));
    await render();
    await selectCustomer();
    await click("Ældre versioner");
    const section = host.querySelector('[aria-label="Kundehistorik"]')!;
    expect(section.textContent).toContain("Version 1 ·");
    expect(section.textContent).toContain("Adresse version 1");
    expect(host.querySelector('[aria-label="Kundeoplysninger"]')?.textContent).toContain(
      "Version 25",
    );
    await click("Nyere versioner");
    expect(section.textContent).toContain("Version 25 ·");
  });
  it("blokerer sagsgemning hvis den valgte kontakt ikke længere kan kontrolleres", async () => {
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => {
      if (data.operation === "contact") throw new WorkOrderRequestError("unavailable");
      return loaded(data);
    });
    await render();
    await selectCustomer();
    await click("Opret sag under kunden");
    await change("Sagens navn", "Fiktiv sag");
    await change("Kontaktperson på sagen", id(4));
    expect(button("Opret sag").disabled).toBe(true);
    await submit();
    expect(m.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Den valgte kontakt kunne ikke kontrolleres");
  });
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
    const corrected = {
      ...detail(),
      customer: {
        ...detail().customer,
        version: 2,
        data: { ...detail().customer.data, name: "Kollegas gemte kunde" },
      },
    };
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => loaded(data, corrected));
    await click("Fortryd");
    await click("Redigér kunde");
    expect(field("Kundenavn").value).toBe("Kollegas gemte kunde");
    await submit();
    expect(m.save.mock.calls.at(-1)?.[0].data.expectedVersion).toBe(2);
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
    const archived = {
      ...detail(),
      canManage: false,
      customer: { ...detail().customer, data: { ...detail().customer.data, archived: true } },
    };
    m.load.mockImplementation(async ({ data }: { data: CustomerQuery }) => loaded(data, archived));
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
