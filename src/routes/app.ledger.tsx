import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { ShieldCheck, FileCheck2, Hash } from "lucide-react";

export const Route = createFileRoute("/app/ledger")({
  head: () => ({ meta: [{ title: "ESG Ledger — GoFreyra" }] }),
  component: Page,
});

function Page() {
  return (
    <>
      <AppTopbar title="ESG Ledger" subtitle="Uforanderlig log over alle verificerede hændelser" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <PageHeader
          title="Verificeret hændelseslog"
          description="Hver post er kryptografisk forseglet og kan revideres af tredjepart."
          actions={<button className="rounded-xl border bg-card text-sm px-3 py-2">Eksportér CSV</button>}
        />

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-success" /><div className="text-sm font-medium">Integritet</div></div>
            <div className="text-2xl font-semibold mt-2">100%</div>
            <div className="text-xs text-muted-foreground">Ingen brud i kæden</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3"><FileCheck2 className="h-5 w-5 text-primary" /><div className="text-sm font-medium">Poster i kvartal</div></div>
            <div className="text-2xl font-semibold mt-2">2.418</div>
            <div className="text-xs text-muted-foreground">+14% vs. forrige</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3"><Hash className="h-5 w-5 text-leaf" /><div className="text-sm font-medium">Seneste hash</div></div>
            <div className="text-sm font-mono mt-2 truncate">0x9f4a…c12e</div>
            <div className="text-xs text-muted-foreground">For 3 minutter siden</div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Seneste poster" />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr><th className="px-5 py-2">Tid</th><th className="py-2">Type</th><th className="py-2">Beskrivelse</th><th className="py-2">Bruger</th><th className="py-2">Hash</th></tr>
            </thead>
            <tbody className="divide-y font-mono text-xs">
              {[
                ["10:24", "VERIFY", "Tang Nord-Q2 datasæt verificeret", "Emma Larsen", "0x9f4a…c12e"],
                ["09:51", "MINT", "240 t CO₂e udstedt til Limfjorden", "System", "0xa12b…77da"],
                ["08:33", "INGEST", "Sentinel-2 batch importeret", "Mikkel Holm", "0x7c11…b09f"],
                ["07:48", "AUDIT", "Verra revisor login fra IP 92.43.…", "Audit", "0x33ea…1100"],
                ["06:02", "ALERT", "Sensor LF-12 ude af synk", "System", "0x5d22…aa01"],
              ].map((r, i) => (
                <tr key={i}><td className="px-5 py-3">{r[0]}</td><td><Pill tone="info">{r[1]}</Pill></td><td className="font-sans">{r[2]}</td><td className="font-sans">{r[3]}</td><td className="text-muted-foreground">{r[4]}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
