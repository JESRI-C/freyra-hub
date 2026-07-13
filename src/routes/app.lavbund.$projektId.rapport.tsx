import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  getGroefter,
  getProject,
  getReadings,
  getTransekter,
} from "@/services/lavbundService";
import { ledgerList, ledgerVerify } from "@/services/ledgerService";
import { bygSnapshot, beregnOpnaaelse } from "@/services/lavbundBeregning";
import { AFVANDINGSKLASSER, FAKTOR_VERSIONER } from "@/data/lavbundFaktorer";
import { FAKTOR_KILDER, FAKTOR_VERIFICERET_DATO } from "@/data/lavbundFaktorKilder";
import type { Tiltag } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId/rapport")({
  head: () => ({ meta: [{ title: "Verifikationsrapport — LavbundsMRV" }] }),
  component: RapportPage,
});

const TILTAG_LABEL: Record<keyof Tiltag, string> = {
  draenAfbrydes: "Dræn afbrydes",
  groefterTilkastes: "Grøfter tilkastes",
  vandloebsbundHaeves: "Vandløbsbund hæves",
  overrislingszoner: "Overrislingszoner",
  pumpedriftStopper: "Pumpedrift stopper",
};

function RapportPage() {
  const { projektId } = Route.useParams();

  const [projekt, readings, transekter, groefter, ledger, kaede] = useQueries({
    queries: [
      { queryKey: ["lavbund", "project", projektId], queryFn: () => getProject(projektId) },
      { queryKey: ["lavbund", "readings", projektId], queryFn: () => getReadings(projektId) },
      { queryKey: ["lavbund", "transekter", projektId], queryFn: () => getTransekter(projektId) },
      { queryKey: ["lavbund", "groefter", projektId], queryFn: () => getGroefter(projektId) },
      { queryKey: ["lavbund", "ledger", projektId], queryFn: () => ledgerList("lavbund", projektId) },
      {
        queryKey: ["lavbund", "ledger-verify", projektId],
        queryFn: () => ledgerVerify("lavbund", projektId),
      },
    ],
  });

  const snap = useMemo(() => {
    if (!projekt.data) return null;
    return bygSnapshot({
      projekt: projekt.data,
      readings: readings.data ?? [],
      transekterFoer: (transekter.data ?? []).filter((t) => t.fase === "foer"),
      transekterEfter: (transekter.data ?? []).filter((t) => t.fase === "efter"),
      groefter: groefter.data ?? [],
    });
  }, [projekt.data, readings.data, transekter.data, groefter.data]);

  // Arealfordeling pr. klasse
  const fordeling = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const k of AFVANDINGSKLASSER) buckets.set(k.navn, 0);
    for (const r of readings.data ?? []) {
      // klassificerer via samme grænser
      for (const k of AFVANDINGSKLASSER) {
        if (r.dybdeM <= k.max) {
          buckets.set(k.navn, (buckets.get(k.navn) ?? 0) + 1);
          break;
        }
      }
    }
    const total = Array.from(buckets.values()).reduce((s, v) => s + v, 0) || 1;
    return AFVANDINGSKLASSER.map((k) => ({
      navn: k.navn,
      andel: (buckets.get(k.navn) ?? 0) / total,
    }));
  }, [readings.data]);

  if (projekt.isLoading || !projekt.data || !snap)
    return (
      <div className="p-6">
        <Card className="p-8 h-40 animate-pulse">
          <span />
        </Card>
      </div>
    );

  const p = projekt.data;

  function eksporterSnapshot() {
    if (!snap) return;
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snapshot-${projektId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          aside, header, nav { display: none !important; }
          .print-root { max-width: none !important; padding: 0 !important; }
          .print-root main { padding: 0 !important; }
        }
      `}</style>
      <main className="p-6 max-w-[1000px] w-full mx-auto space-y-5 print-root">
        <div className="flex flex-wrap gap-2 justify-end no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted/40"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
          <button
            type="button"
            onClick={eksporterSnapshot}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted/40"
          >
            <Download className="h-3.5 w-3.5" /> Beregningssnapshot (JSON)
          </button>
        </div>

        <header className="border-b pb-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            LavbundsMRV — Verifikationsrapport
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{p.navn}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {p.kommune} · {p.samletArealHa.toLocaleString("da-DK")} ha · Genereret{" "}
            {new Date(snap.genereret).toLocaleString("da-DK")}
          </div>
        </header>

        {/* Konklusion — det revisor/myndighed skal kunne se på ét blik:
            lovet vs. målt + om revisionssporet er intakt. */}
        {(() => {
          const opn = beregnOpnaaelse(p, snap.co2.krediteretTotal, snap.co2.verificeretTotal);
          const kaedeOk = kaede.data?.ok === true;
          return (
            <Section title="Konklusion — målt verifikation af krediteret effekt">
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Lovet effekt (ex-ante)</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {opn.lovetTotal.toLocaleString("da-DK")} t CO₂e/år
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {opn.lovetKilde === "publiceret_ex_ante"
                      ? "Statens publicerede forundersøgelsestal"
                      : "Genberegnet med statens v12-faktorer"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Målt verificeret</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-primary">
                    {opn.verificeretTotal.toLocaleString("da-DK")} t CO₂e/år
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Opnåelsesgrad: <strong>{opn.procent} %</strong> ·{" "}
                    {(readings.data ?? []).length} målinger · verifikationsgrad{" "}
                    {(snap.co2.verifikationsgrad * 100).toFixed(0)} %
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Revisionsspor</div>
                  <div className="mt-1">
                    {kaedeOk ? (
                      <Pill tone="success">Kæde intakt · {ledger.data?.length ?? 0} poster</Pill>
                    ) : kaede.data ? (
                      <Pill tone="danger">KÆDEBRUD ved post {kaede.data.brud?.seq}</Pill>
                    ) : (
                      <Pill tone="default">Verificeres…</Pill>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    SHA-256-kædet hændelseslog — efterprøvbar af revisor/myndighed.
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Formål: Staten krediterer projektets effekt ex-ante. Denne rapport dokumenterer den{" "}
                <strong>målte</strong> effekt med fuldt revisionsspor, så kommunens klimatal er
                verificerbare — ikke selvberegnede skøn. Effektfaktorerne er statens egne
                (se faktorgrundlag, afsnit 8).
              </p>
            </Section>
          );
        })()}

        <Section title="1. Projektstamdata">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{p.status}</dd>
            <dt className="text-muted-foreground">Samlet areal</dt>
            <dd>{p.samletArealHa.toLocaleString("da-DK")} ha</dd>
            <dt className="text-muted-foreground">Vandspejl FØR</dt>
            <dd>{p.vandspejlFoerM.toFixed(2)} m</dd>
            {p.torvAndel !== undefined && (
              <>
                <dt className="text-muted-foreground">Tørveandel</dt>
                <dd>{(p.torvAndel * 100).toFixed(0)} %</dd>
              </>
            )}
            {p.publiceretExAnteTonPrHa !== undefined && (
              <>
                <dt className="text-muted-foreground">Publiceret ex-ante</dt>
                <dd>{p.publiceretExAnteTonPrHa.toFixed(1)} t CO₂e/ha/år</dd>
              </>
            )}
          </dl>
        </Section>

        <Section title="2. Aktive tiltag">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TILTAG_LABEL) as (keyof Tiltag)[])
              .filter((k) => p.tiltag[k])
              .map((k) => (
                <Pill key={k} tone="success">
                  {TILTAG_LABEL[k]}
                </Pill>
              ))}
            {Object.values(p.tiltag).every((v) => !v) && (
              <span className="text-sm text-destructive">Ingen aktive tiltag registreret.</span>
            )}
          </div>
        </Section>

        <Section title="3. Klima — CO₂-effekt">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Kort
              label="Krediteret (v12)"
              value={`${snap.co2.krediteretTotal.toFixed(1)} t CO₂e/år`}
              sub={`${snap.co2.krediteretTonPrHa.toFixed(1)} t/ha`}
            />
            <Kort
              label="Verificeret (målt)"
              value={`${snap.co2.verificeretTotal.toFixed(1)} t CO₂e/år`}
              sub={`${(snap.co2.verifikationsgrad * 100).toFixed(0)} % · ±${snap.co2.usikkerhedTotal.toFixed(1)}`}
            />
          </div>
        </Section>

        <Section title="4. Arealfordeling pr. afvandingsklasse (målt)">
          <ul className="text-sm space-y-1">
            {fordeling.map((f) => (
              <li key={f.navn} className="flex justify-between border-b py-1">
                <span>{f.navn}</span>
                <span className="tabular-nums">{(f.andel * 100).toFixed(0)} %</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="5. Fosfor — brinkerosion og balance">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Kort
              label="Vandløb FØR"
              value={`${snap.fosfor.vandloebFoerKgAar.toFixed(1)} kg P/år`}
            />
            <Kort
              label="Vandløb EFTER"
              value={`${snap.fosfor.vandloebEfterKgAar.toFixed(1)} kg P/år`}
            />
            <Kort
              label="Grøfter FØR"
              value={`${snap.fosfor.groefterFoerKgAar.toFixed(1)} kg P/år`}
            />
            <Kort
              label="Grøfter EFTER"
              value={`${snap.fosfor.groefterEfterKgAar.toFixed(1)} kg P/år`}
            />
          </div>
          <div className="mt-3 text-lg font-semibold">
            Balance:{" "}
            <span className={snap.fosfor.balanceKgAar >= 0 ? "text-primary" : "text-destructive"}>
              {snap.fosfor.balanceKgAar >= 0 ? "+" : ""}
              {snap.fosfor.balanceKgAar.toFixed(1)} kg P/år
            </span>
          </div>
        </Section>

        <Section title="6. Datagrundlag">
          <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
            <li>{readings.data?.length ?? 0} vandstandsmålinger (HOBO + markpejling)</li>
            <li>
              {(transekter.data ?? []).filter((t) => t.fase === "foer").length} FØR-transekter,{" "}
              {(transekter.data ?? []).filter((t) => t.fase === "efter").length} EFTER-transekter
            </li>
            <li>{groefter.data?.length ?? 0} grøfte-strækninger</li>
            <li>{ledger.data?.length ?? 0} ledger-poster</li>
          </ul>
        </Section>

        <Section title="7. Faktorversioner">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">CO₂-faktorer</dt>
            <dd>{FAKTOR_VERSIONER.co2}</dd>
            <dt className="text-muted-foreground">Fosfor-faktorer</dt>
            <dd>{FAKTOR_VERSIONER.fosfor}</dd>
            <dt className="text-muted-foreground">Anvendelsesområde</dt>
            <dd>{snap.usageScope}</dd>
          </dl>
        </Section>

        <Section title="8. Faktorgrundlag & verifikation">
          <p className="text-xs text-muted-foreground mb-3">
            Alle faktorer er indlæst fra de officielle beregningsark (medfølger i
            systemets kildearkiv) og verificeres automatisk mod arkene ved hver
            release. Senest verificeret: {FAKTOR_VERIFICERET_DATO}.
          </p>
          <ul className="space-y-2">
            {FAKTOR_KILDER.map((k) => (
              <li key={k.fil} className="rounded-lg border p-3 text-xs">
                <div className="font-medium text-sm">{k.navn}</div>
                <div className="text-muted-foreground mt-0.5">
                  {k.udgiver} · version {k.version}
                </div>
                <div className="mt-1">{k.anvendtTil}</div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                  {k.fil} · SHA-256: {k.sha256}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <footer className="border-t pt-4 text-xs text-muted-foreground italic">
          Anvendelsesområde: prioritering under tilskudsordninger og kommunens klimaregnskab.
          Metoden egner sig ikke til effektberegning ved salg af CO₂-kvoter og afviger fra den
          nationale opgørelse (jf. v12-vejledningen).
        </footer>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <CardHeader title={title} />
      <div className="px-0 pt-2">{children}</div>
    </Card>
  );
}

function Kort({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-muted/10 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
