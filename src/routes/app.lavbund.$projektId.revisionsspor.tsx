import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui-bits";

export const Route = createFileRoute("/app/lavbund/$projektId/revisionsspor")({
  head: () => ({ meta: [{ title: "Revisionsspor — LavbundsMRV" }] }),
  component: RevisionsSporPage,
});

function RevisionsSporPage() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto">
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Revisionsspor kommer i Fase 3 — append-only hændelseslog med SHA-256-hash-kæde.
      </Card>
    </main>
  );
}
