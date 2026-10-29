import { createFileRoute } from "@tanstack/react-router";
import { MyWorkOrders } from "@/components/project/MyWorkOrders";
export const Route = createFileRoute("/opgaver")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mine opgaver — Freyra" }] }),
  component: MyWorkOrders,
});
