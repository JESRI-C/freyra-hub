// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { ProjectEquipmentBookings } from "../ProjectEquipmentBookings";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: () => mocks,
}));

it("opens booking for a selected task even when it has no reservation", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  const onOpen = vi.fn();
  const task = { id: "new-task", title: "Bekæmpelse af bjørneklo" };
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ProjectEquipmentBookings
            scope={{ organizationId: "organization", projectId: "project" }}
            actorId="manager"
            active={false}
            locked={false}
            tasks={[task]}
            onOpen={onOpen}
          />
        </QueryClientProvider>,
      );
    });
    const select = host.querySelector("select")!;
    const button = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    await act(async () => {
      select.value = task.id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(button.disabled).toBe(false);
    const week = Array.from(host.querySelectorAll("button")).find(
      (element) => element.textContent === "Denne uge",
    )!;
    await act(async () => week.click());
    const [from, through] = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[type="date"]'),
    );
    expect(new Date(from.value).getUTCDay()).toBe(1);
    expect(new Date(through.value).getUTCDay()).toBe(0);
    expect(Date.parse(through.value) - Date.parse(from.value)).toBe(6 * 86_400_000);
    expect(week.getAttribute("aria-pressed")).toBe("true");
    expect(select.value).toBe(task.id);
    await act(async () => button.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(task.id);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});

it("shows an overdue service reminder outside the selected booking period and opens its job", async () => {
  const task = { id: "00000000-0000-4000-8000-000000000094", title: "Tilsyn ved åen" };
  mocks.rpc.mockReturnValue({
    abortSignal: async () => ({
      data: [
        {
          equipment_id: "00000000-0000-4000-8000-000000000093",
          equipment_name: "Motorsav",
          action_id: task.id,
          next_service_on: "2000-01-01",
          days_until_service: -100,
        },
      ],
      error: null,
    }),
  });
  const query = {
    select: () => query,
    eq: () => query,
    lte: () => query,
    gte: () => query,
    ilike: () => query,
    is: () => query,
    order: () => query,
    limit: () => query,
    abortSignal: async () => ({ data: [], error: null }),
  };
  mocks.from.mockReturnValue(query);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  const onOpen = vi.fn();
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <ProjectEquipmentBookings
            scope={{ organizationId: "organization", projectId: "project" }}
            actorId="manager"
            active
            locked={false}
            tasks={[task]}
            onOpen={onOpen}
          />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const reminders = host.querySelector('[aria-label="Servicepåmindelser"]')!;
    expect(reminders.textContent).toContain("Overskredet · 2000-01-01");
    expect(mocks.rpc).toHaveBeenCalledWith("list_project_equipment_service_reminders", {
      p_organization_id: "organization",
      p_project_id: "project",
      p_after_due: null,
      p_after_equipment_id: null,
    });
    await act(async () => reminders.querySelector("button")!.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(task.id);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
