import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { FileText, Download, Plus } from "lucide-react";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Rapporter — GoFreyra" }] }),
  component: Page,
});

function Page() {
  const reports = [
    { t: "ESG Q2 2026", k: "ESG", d: "01. jul 2026", s: "Klar", tone: "success" as const },
    { t: "CSRD basislinje", k: "CSRD", d: "14. jun 2026", s: "Udkast", tone: "warning" as const },
    { t: "Biodiversitet — Skallebæk", k: "TNFD", d: "30. maj 2026", s: "Indsendt", tone: "info" as const },
    { t: "Vandkvalitet — Aarhus Å", k: "Internt", d: "12. maj 2026", s: "Klar", tone: "success" as const },
    { t: "Årsrapport 2025", k: "ESG", d: "28. feb 2026", s: "Arkiveret", tone: "default" as const },
  ];

  return (
    <>
      <AppTopbar title="Rapporter" subtitle="Generér og del verificerede rapporter" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <PageHeader
          title="Mine rapporter"
          description="Brug skabeloner til ESG, CSRD, TNFD eller byg dine egne."
          actions={<button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm shadow-soft"><Plus className="h-4 w-4" /> Ny rapport</button>}
        />

        <div className="grid md:grid-cols-3 gap-4">
          {["ESG kvartal", "CSRD årlig", "TNFD baseline"].map((t) => (
            <Card key={t} className="p-5">
              <div className="h-10 w-10 rounded-xl bg-leaf/20 text-primary grid place-items-center"><FileText className="h-5 w-5" /></div>
              <div className="mt-3 font-medium">{t}</div>
              <div className="text-xs text-muted-foreground mt-1">Skabelon med præudfyldte felter fra dit verificerede data.</div>
              <button className="mt-4 text-sm rounded-lg bg-secondary px-3 py-2">Brug skabelon</button>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader title="Tidligere rapporter" />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr><th className="px-5 py-2">Titel</th><th className="py-2">Kategori</th><th className="py-2">Dato</th><th className="py-2">Status</th><th className="py-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {reports.map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 font-medium">{r.t}</td>
                  <td><Pill>{r.k}</Pill></td>
                  <td className="text-muted-foreground">{r.d}</td>
                  <td><Pill tone={r.tone}>{r.s}</Pill></td>
                  <td className="pr-5 text-right"><button className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Download className="h-3.5 w-3.5" /> Hent</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
