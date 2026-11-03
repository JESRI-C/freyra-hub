// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { ProjectEquipmentBookings } from "../ProjectEquipmentBookings";

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
    await act(async () => button.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(task.id);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
