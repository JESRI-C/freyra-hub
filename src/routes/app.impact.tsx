import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, StatCard, PageHeader, Pill } from "@/components/ui-bits";
import { Repeat2, ArrowRightLeft, Wallet, Trees } from "lucide-react";

export const Route = createFileRoute("/app/impact")({
  head: () => ({ meta: [{ title: "Impact Exchange — GoFreyra" }] }),
  component: Page,
});

function Page() {
  return (
    <>
      <AppTopbar title="Impact Exchange" subtitle="Markedsplads for verificerede natur- og klimakreditter" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <PageHeader title="Markedsoverblik" description="Udveksl verificeret impact mellem projekter og partnere." />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Tilgængelige kreditter" value="3.420" delta={8} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label="Reserveret" value="1.180" delta={3} icon={<Repeat2 className="h-5 w-5" />} accent="bg-accent text-accent-foreground" />
          <StatCard label="Solgte i kvartal" value="940" delta={22} icon={<ArrowRightLeft className="h-5 w-5" />} accent="bg-success/15 text-success" />
          <StatCard label="Restaurerede ha" value="612" delta={5} icon={<Trees className="h-5 w-5" />} accent="bg-warning/20 text-warning-foreground" />
        </div>

        <Card>
          <CardHeader title="Aktive tilbud" subtitle="Verificeret af tredjepart og klar til handel" action={<button className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-1.5">Opret tilbud</button>} />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr><th className="px-5 py-2">Projekt</th><th className="py-2">Type</th><th className="py-2">Mængde</th><th className="py-2">Pris (DKK)</th><th className="py-2">Status</th><th className="py-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {[
                ["Limfjorden Tang", "Blue Carbon", "240 t CO₂e", "1.250", "success", "Verificeret"],
                ["Skallebæk Ådal", "Biodiversitet", "85 BU", "980", "info", "Til review"],
                ["Kattegat Stenrev", "Habitat", "120 ha", "2.100", "success", "Verificeret"],
                ["København Havn", "Vandkvalitet", "60 WQU", "640", "warning", "Afventer"],
              ].map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 font-medium">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td className="tabular-nums">{r[3]}</td>
                  <td><Pill tone={r[4] as any}>{r[5]}</Pill></td>
                  <td className="pr-5"><button className="text-sm text-primary hover:underline">Se</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
