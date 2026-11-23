// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { printableEquipmentLabel, printableEquipmentReservation } from "@/lib/printable-job-card";
import { EquipmentCustodyActions } from "../EquipmentCustodyActions";
import { EquipmentServiceJournal } from "../EquipmentServiceJournal";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

it("reuses the pickup request after a lost response and records return separately", async () => {
  const time = "2026-11-17T09:00:00+00:00";
  let current = {
    status: "reserved",
    can_return: false,
    checked_out_at: null as string | null,
    returned_at: null as string | null,
    can_offer_transfer: false,
  };
  let attempts = 0;
  mocks.rpc.mockImplementation((name, params) => {
    if (name === "read_work_order_equipment_custody")
      return {
        abortSignal: async () => ({
          data: {
            ...current,
            reservation: {
              name: "Motorsav",
              starts_on: "2026-11-17",
              ends_on: "2026-11-18",
              cancelled: false,
              can_checkout: true,
            },
          },
          error: null,
        }),
      };
    if (name === "change_work_order_equipment_transfer")
      return Promise.resolve({
        data: {
          code: "00000000-0000-4000-8000-000000000123",
          expires_at: time,
        },
        error: null,
      });
    if (++attempts === 1) return Promise.reject(new Error("Synthetic lost response"));
    current =
      params.p_operation === "checkout"
        ? {
            status: "checked_out",
            checked_out_at: time,
            returned_at: null,
            can_return: true,
            can_offer_transfer: true,
          }
        : {
            status: "returned",
            checked_out_at: time,
            returned_at: time,
            can_return: false,
            can_offer_transfer: false,
          };
    return Promise.resolve({ data: current, error: null });
  });

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  };
  const click = async (name: string) => {
    const button = [...host.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === name,
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
    await flush();
  };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <EquipmentCustodyActions
            bookingId="booking"
            actionId="job"
            actorId="worker"
            scope={{ organizationId: "organization", projectId: "project" }}
          />
        </QueryClientProvider>,
      ),
    );
    await flush();
    await click("Registrér afhentning");
    expect(host.textContent).toContain("Registreringen kunne ikke bekræftes");
    await click("Registrér afhentning");
    expect(host.textContent).toContain("Afhentet");
    await click("Vis overdragelseskode");
    expect(host.querySelector("input")?.value).toBe("00000000-0000-4000-8000-000000000123");
    expect(mocks.rpc).toHaveBeenCalledWith("change_work_order_equipment_transfer", {
      p_action_id: "job",
      p_booking_id: "booking",
      p_organization_id: "organization",
      p_project_id: "project",
      p_operation: "offer",
      p_code: null,
    });
    await click("Registrér aflevering");
    expect(host.textContent).toContain("Afleveret");
    expect(host.querySelector("button")).toBeNull();
    const writes = mocks.rpc.mock.calls.filter(
      ([name]) => name === "change_work_order_equipment_custody",
    );
    expect(writes.map(([, params]) => params.p_operation)).toEqual([
      "checkout",
      "checkout",
      "return",
    ]);
    expect(writes[1][1].p_request_id).toBe(writes[0][1].p_request_id);
    expect(writes[2][1].p_request_id).not.toBe(writes[1][1].p_request_id);
  } finally {
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
  }
});

it("captures a fresh position only when requested and displays the stored handover", async () => {
  const code = "00000000-0000-4000-8000-000000000123";
  const time = "2026-11-17T09:00:00+00:00";
  const position = { latitude: 55.25, longitude: 9.48, accuracy_m: 8 };
  const getCurrentPosition = vi
    .fn()
    .mockImplementationOnce((_resolve, reject) => reject({ code: 1 }))
    .mockImplementationOnce((resolve) =>
      resolve({
        coords: { latitude: 55.25, longitude: 9.48, accuracy: 8 },
      }),
    );
  const previous = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  let received = false;
  const accept = vi.fn(async () => {
    received = true;
    return { data: current(), error: null };
  });
  const current = () => ({
    status: "checked_out",
    checked_out_at: time,
    returned_at: null,
    can_return: received,
    can_accept_transfer: !received,
    holder_id: received ? "recipient" : "sender",
    transfers: received ? [{ from_name: "Anna", to_name: "Bo", accepted_at: time, position }] : [],
    reservation: {
      name: "Motorsav",
      starts_on: "2026-11-17",
      ends_on: "2026-11-18",
      cancelled: false,
      can_checkout: false,
    },
  });
  mocks.rpc.mockImplementation((name) =>
    name === "read_work_order_equipment_custody"
      ? { abortSignal: async () => ({ data: current(), error: null }) }
      : accept(),
  );

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <EquipmentCustodyActions
            bookingId="booking"
            actionId="job"
            actorId="recipient"
            scope={{ organizationId: "org", projectId: "project" }}
          />
        </QueryClientProvider>,
      ),
    );
    await flush();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, code);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const gps = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Modtag med GPS",
    )!;
    await act(async () => gps.click());
    expect(accept).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Placeringen kunne ikke hentes",
    );
    await act(async () => gps.click());
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "change_work_order_equipment_transfer",
      expect.objectContaining({
        p_operation: "accept",
        p_code: code,
        p_latitude: 55.25,
        p_longitude: 9.48,
        p_accuracy_m: 8,
      }),
    );
    expect(host.textContent).toContain("Position 55.25000, 9.48000");
  } finally {
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
    if (previous) Object.defineProperty(navigator, "geolocation", previous);
    else Reflect.deleteProperty(navigator, "geolocation");
  }
});

it("shows the asset service deadline and lets the field worker record an inspection", async () => {
  const read = {
    can_record: true,
    can_schedule: false,
    next_service_on: "2026-11-16",
    days_until_service: -1,
    reports: [],
  };
  mocks.rpc.mockImplementation((_name, args) =>
    args.p_report_id
      ? Promise.resolve({ data: read, error: null })
      : { abortSignal: async () => ({ data: read, error: null }) },
  );
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient();
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <EquipmentServiceJournal
            bookingId="service-booking"
            actionId="job"
            actorId="worker"
            scope={{ organizationId: "org", projectId: "project" }}
          />
        </QueryClientProvider>,
      ),
    );
    const details = host.querySelector("details")!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    await flush();
    expect(host.textContent).toContain("Servicefristen er overskredet");
    expect(host.querySelector('input[type="date"]')).toBeNull();
    const note = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        note,
        "Kontrollér kæden",
      );
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      host
        .querySelector("fieldset button")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "equipment_service_journal",
      expect.objectContaining({
        p_booking_id: "service-booking",
        p_kind: "inspection",
        p_note: "Kontrollér kæden",
        p_report_id: expect.any(String),
        p_next_service_on: null,
      }),
    );
    expect(host.textContent).toContain("Rapporten er gemt");
  } finally {
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
  }
});

it("generates a printable QR card scoped to the exact job and reservation", () => {
  const html = printableEquipmentReservation("https://gofreyra.example", {
    bookingId: "00000000-0000-4000-8000-000000000101",
    actionId: "00000000-0000-4000-8000-000000000102",
    name: "Motorsav <felt>",
    startsOn: "2026-11-17",
    endsOn: "2026-11-18",
  });
  const printed = new DOMParser().parseFromString(html, "text/html");
  expect(printed.querySelector("h1")?.textContent).toBe("Motorsav <felt>");
  expect(printed.images).toHaveLength(1);
  const login = new URL(printed.links[0].href);
  expect(login.pathname).toBe("/login");
  const destination = new URL(login.searchParams.get("next")!, login.origin);
  expect(destination.pathname).toBe("/opgaver");
  expect(Object.fromEntries(destination.searchParams)).toEqual({
    job: "00000000-0000-4000-8000-000000000102",
    booking: "00000000-0000-4000-8000-000000000101",
  });
});

it("prints a durable equipment QR with no embedded job or booking", () => {
  const equipmentId = "00000000-0000-4000-8000-000000000101";
  const printed = new DOMParser().parseFromString(
    printableEquipmentLabel("https://gofreyra.example", {
      equipmentId,
      name: "Motorsav",
      kind: "Værktøj",
    }),
    "text/html",
  );
  const login = new URL(printed.links[0].href);
  const target = new URL(login.searchParams.get("next")!, login.origin);
  expect(target.pathname).toBe("/opgaver");
  expect(Object.fromEntries(target.searchParams)).toEqual({ equipment: equipmentId });
});
