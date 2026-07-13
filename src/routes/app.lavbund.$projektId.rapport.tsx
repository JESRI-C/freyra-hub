import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui-bits";

export const Route = createFileRoute("/app/lavbund/$projektId/rapport")({
  head: () => ({ meta: [{ title: "Verifikationsrapport — LavbundsMRV" }] }),
  component: RapportPage,
});

function RapportPage() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto">
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Verifikationsrapport kommer i Fase 3.
      </Card>
    </main>
  );
}
