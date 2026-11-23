import { createFileRoute } from "@tanstack/react-router";
import { DevelopmentWorkspace } from "@/components/development/DevelopmentWorkspace";

export const Route = createFileRoute("/app/development")({
  ssr: false,
  head: () => ({ meta: [{ title: "Produktudvikling — GoFreyra" }] }),
  component: DevelopmentWorkspace,
});
