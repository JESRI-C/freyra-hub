import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Coins, Loader2, ShieldCheck, Wallet, Lock, Info, X, FileText, Download } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { ImpactMetricCard, VerificationBadge } from "@/components/impact/Primitives";
import { ASSETS, PROJECTS } from "@/lib/impact-data";

export const Route = createFileRoute("/app/impact/credits")({
  head: () => ({ meta: [{ title: "Credits & aktiver — Impact Exchange" }] }),
  component: CreditsPage,
});

function CreditsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? ASSETS.find((a) => a.id === openId) : null;
  const project = open ? PROJECTS.find((p) => p.id === open.projectId) : null;

  const sum = (s: typeof ASSETS[number]["status"]) =>
    ASSETS.filter((a) => a.status === s).reduce((acc, a) => acc + a.quantity, 0);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      {/* Asset overview */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <ImpactMetricCard label="Tilgængelige credits" value={sum("Tilgængelig").toLocaleString("da-DK")} icon={<Wallet className="h-4 w-4" />} />
        <ImpactMetricCard label="Reserverede" value={sum("Reserveret").toLocaleString("da-DK")} icon={<Lock className="h-4 w-4" />} />
        <ImpactMetricCard label="Købte" value={sum("Købt").toLocaleString("da-DK")} icon={<ShieldCheck className="h-4 w-4" />} />
        <ImpactMetricCard label="Under verifikation" value={sum("Under verifikation").toLocaleString("da-DK")} icon={<Loader2 className="h-4 w-4" />} />
        <ImpactMetricCard label="Ledger-registrerede" value={ASSETS.length.toString()} unit="aktiver" icon={<Coins className="h-4 w-4" />} />
      </div>

      {/* Marketplace status legend */}
      <div className="flex flex-wrap gap-2">
        <Pill tone="success">Tilgængelig</Pill>
        <Pill tone="info">Reserveret</Pill>
        <Pill tone="default">Købt</Pill>
        <Pill tone="warning">Under verifikation</Pill>
        <Pill tone="danger">Ikke rapportklar</Pill>
      </div>

      {/* Credit table */}
      <Card className="overflow-hidden">
        <CardHeader title="Aktiver og credits" subtitle="Klik på en række for at se detaljer" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Credit ID</th>
              <th className="py-2">Projekt</th>
              <th className="py-2">Type</th>
              <th className="py-2 text-right">Mængde</th>
              <th className="py-2">Enhed</th>
              <th className="py-2">Vintage</th>
              <th className="py-2">Status</th>
              <th className="py-2">Verifikation</th>
              <th className="py-2 text-right">Pris (DKK)</th>
              <th className="py-2">Ledger ID</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ASSETS.map((a) => {
              const p = PROJECTS.find((x) => x.id === a.projectId)!;
              const tone = a.status === "Tilgængelig" ? "success"
                : a.status === "Reserveret" ? "info"
                : a.status === "Købt" ? "default"
                : a.status === "Under verifikation" ? "warning" : "danger";
              return (
                <tr key={a.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(a.id)}>
                  <td className="px-5 py-3 font-medium tabular-nums text-xs">{a.id}</td>
                  <td>{p.title}</td>
                  <td className="text-xs">{a.type}</td>
                  <td className="text-right tabular-nums">{a.quantity.toLocaleString("da-DK")}</td>
                  <td className="text-xs">{a.unit}</td>
                  <td className="text-xs">{a.vintage}</td>
                  <td><Pill tone={tone as any}>{a.status}</Pill></td>
                  <td><VerificationBadge status={a.verification} /></td>
                  <td className="text-right tabular-nums">{a.pricePerUnit}</td>
                  <td className="text-xs text-muted-foreground">{a.ledgerId}</td>
                  <td className="pr-5"><button className="text-xs text-primary hover:underline">Detaljer</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Compliance */}
      <Card className="p-5 flex gap-3">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Credits og impact-aktiver vises som dokumentations- og porteføljelag. Endelig anvendelse afhænger af
          gældende standarder, aftaler og verifikation hos den valgte rammeudbyder.
        </p>
      </Card>

      {/* Detail drawer */}
      {open && project && (
        <div className="fixed inset-0 bg-foreground/30 z-40 flex justify-end" onClick={() => setOpenId(null)}>
          <div className="w-full max-w-md h-full bg-card border-l shadow-card overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{open.id}</div>
                <div className="font-semibold">{open.type}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{project.title}</div>
              </div>
              <button onClick={() => setOpenId(null)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <Field k="Oprindelse" v={`${project.location}, ${project.country}`} />
              <Field k="Metodologi" v={project.standard} />
              <Field k="Verifikation" v={`${project.verifier} · ${open.verification}`} />
              <Field k="Risiko" v={project.risk} />
              <Field k="Datakilder" v="Sensorer · Sentinel-2 · Drone · Felt · Lab" />
              <Field k="Ejerskab" v={open.status} />
              <Field k="Anvendelse i rapportering" v={project.reporting} />
              <div>
                <div className="text-xs text-muted-foreground mb-1">Audit trail</div>
                <div className="rounded-lg border p-3 text-xs space-y-1.5">
                  <div>2026-04-30 · Credit udstedt fra ledger</div>
                  <div>2026-05-02 · Tilknyttet portefølje (Freyra Demo)</div>
                  <div>2026-05-04 · 3.parts review påbegyndt</div>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button className="flex-1 text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center justify-center gap-1.5"><FileText className="h-4 w-4" /> Dokumentation</button>
                <button className="flex-1 text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2 inline-flex items-center justify-center gap-1.5"><Download className="h-4 w-4" /> Eksportér</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <div className="text-muted-foreground text-xs">{k}</div>
      <div className="font-medium text-right">{v}</div>
    </div>
  );
}
