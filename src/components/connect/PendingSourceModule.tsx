import { Link } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/ui-bits";

export function PendingSourceModule({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader title={title} description={description} />
      <Card>
        <div className="p-5 space-y-3 text-sm">
          <p>Dette modul afventer tilslutning til projektets datakilder.</p>
          <p className="text-muted-foreground">
            Åbn Grundlag på projektet for at gennemgå gemte offentlige data, datoer og mangler.
            Aktive forbindelser og realtidsobservationer kræver en verificeret datakilde.
          </p>
          <Link to="/app/projects" className="underline">
            Gå til projekter
          </Link>
        </div>
      </Card>
    </main>
  );
}
