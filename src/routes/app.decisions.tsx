import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { Brain, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/decisions")({
  head: () => ({ meta: [{ title: "DecisionsIQ — GoFreyra" }] }),
  component: Page,
});

function Page() {
  return (
    <>
      <AppTopbar title="DecisionsIQ" subtitle="AI-drevne anbefalinger baseret på dit verificerede data" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <PageHeader
          title="Anbefalede beslutninger"
          description="Vores model har analyseret 14 datasæt og fundet 6 handlinger med høj forventet effekt."
          actions={<button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm shadow-soft"><Sparkles className="h-4 w-4" /> Kør ny analyse</button>}
        />

        <div className="grid lg:grid-cols-3 gap-4">
          {[
            { t: "Udvid restaureringszone i Limfjorden", c: 92, why: "eDNA + temperatur indikerer optimalt vækstvindue", icon: TrendingUp, tone: "success" as const },
            { t: "Reducér prøveinterval i sektor 4", c: 81, why: "Stabilt signal sidste 8 uger — sparer 18% drift", icon: Brain, tone: "info" as const },
            { t: "Eskalér nedgang i biodiversitet — sektor 7", c: 76, why: "Trenden er statistisk signifikant (p < 0,01)", icon: AlertTriangle, tone: "warning" as const },
          ].map((x) => (
            <Card key={x.t} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-9 w-9 rounded-xl bg-leaf/20 text-primary grid place-items-center"><x.icon className="h-5 w-5" /></div>
                <Pill tone={x.tone}>Konfidens {x.c}%</Pill>
              </div>
              <div className="font-medium">{x.t}</div>
              <div className="text-xs text-muted-foreground mt-1">{x.why}</div>
              <div className="flex gap-2 mt-4">
                <button className="flex-1 text-sm rounded-lg bg-primary text-primary-foreground py-2">Accepter</button>
                <button className="flex-1 text-sm rounded-lg border bg-card py-2">Senere</button>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader title="Beslutningshistorik" subtitle="Tidligere AI-anbefalinger og deres resultat" />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr><th className="px-5 py-2">Anbefaling</th><th className="py-2">Dato</th><th className="py-2">Status</th><th className="py-2">Effekt</th></tr>
            </thead>
            <tbody className="divide-y">
              {[
                ["Skift sensorbatch i nordzonen", "12. apr", "Implementeret", "+12% datakvalitet", "success"],
                ["Pausér prøvetagning ved storm", "28. mar", "Implementeret", "Sparet 8 t. drift", "success"],
                ["Genplant zone B-3", "14. mar", "Afvist", "—", "default"],
              ].map((r, i) => (
                <tr key={i}><td className="px-5 py-3">{r[0]}</td><td>{r[1]}</td><td><Pill tone={r[4] as any}>{r[2]}</Pill></td><td className="text-muted-foreground">{r[3]}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
