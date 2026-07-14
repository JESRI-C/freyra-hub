import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { Card, Pill } from "@/components/ui-bits";
import {
  ReportDoc,
  ReportMasthead,
  ReportSection,
  ReportHero,
  ReportKpi,
  ReportMeter,
  ReportBars,
  ReportTable,
  ReportKV,
  ReportNote,
  ReportFooter,
  DOC_BLAA,
  DOC_RAV,
  DOC_GROEN,
} from "@/components/reports/ReportDoc";
import { KLASSE_FARVE } from "@/components/lavbund/LavbundFeltkort";
import {
  getGroefter,
  getMaalepunkter,
  getProject,
  getReadings,
  getTransekter,
} from "@/services/lavbundService";
import { ledgerList, ledgerVerify } from "@/services/ledgerService";
import {
  bygSnapshot,
  beregnOpnaaelse,
  beregnVerifikationsgrad,
  beregnMetodeStat,
} from "@/services/lavbundBeregning";
import { AFVANDINGSKLASSER, FAKTOR_VERSIONER } from "@/data/lavbundFaktorer";
import { FAKTOR_KILDER, FAKTOR_VERIFICERET_DATO } from "@/data/lavbundFaktorKilder";
import type { Tiltag, VandstandsReading } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId/rapport")({
  head: () => ({ meta: [{ title: "Verifikationsrapport — LavbundsMRV" }] }),
  component: RapportPage,
});

const KILDE_LABEL: Record<VandstandsReading["kilde"], string> = {
  hobo_logger: "HOBO-logger (15-min serier)",
  manuel_pejling: "Manuel pejling",
  drone_dem: "Drone-DEM",
  insar: "InSAR (satellit)",
};

const TILTAG_LABEL: Record<keyof Tiltag, string> = {
  draenAfbrydes: "Dræn afbrydes",
  groefterTilkastes: "Grøfter tilkastes",
  vandloebsbundHaeves: "Vandløbsbund hæves",
  overrislingszoner: "Overrislingszoner",
  pumpedriftStopper: "Pumpedrift stopper",
};

function RapportPage() {
  const { projektId } = Route.useParams();

  const [projekt, readings, transekter, groefter, ledger, kaede, maalepunkter] = useQueries({
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
      // Samme nøgle som kort-siden, så cachen deles på tværs af faner.
      {
        queryKey: ["lavbund", "mp", projektId],
        queryFn: () => getMaalepunkter(projektId),
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

  // Arealfordeling pr. klasse — motorens beregning (ekskl. baseline), så
  // fordelingen aldrig kan modsige verifikationsgraden i Konklusionen.
  const ver = useMemo(
    () => beregnVerifikationsgrad(readings.data ?? [], projekt.data?.etableringsdato),
    [readings.data, projekt.data?.etableringsdato],
  );
  const fordeling = useMemo(
    () =>
      AFVANDINGSKLASSER.map((k) => ({ navn: k.navn, andel: ver.fordeling[k.navn] ?? 0 })),
    [ver],
  );

  // Metode & datagrundlag — tæthed, kildefordeling, periode og baseline/efter
  // (samme skille som motoren, jf. beregnMetodeStat).
  const metode = useMemo(
    () => beregnMetodeStat(readings.data ?? [], projekt.data?.etableringsdato),
    [readings.data, projekt.data?.etableringsdato],
  );
  const antalPunkter = (maalepunkter.data ?? []).length;

  // Rapporten er et revisionsdokument — den må aldrig vise "0 målepunkter"
  // eller tomme tællinger blot fordi en delforespørgsel stadig indlæser.
  if (projekt.isLoading || readings.isLoading || maalepunkter.isLoading || !projekt.data || !snap)
    return (
      <div className="p-6">
        <Card className="p-8 h-40 animate-pulse">
          <span />
        </Card>
      </div>
    );

  const p = projekt.data;
  const opn = beregnOpnaaelse(p, snap.co2.krediteretTotal, snap.co2.verificeretTotal);
  const kaedeOk = kaede.data?.ok === true;
  const opnTone = opn.procent >= 90 ? "positive" : opn.procent >= 70 ? "warning" : "negative";

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

  const co2Max = Math.max(snap.co2.krediteretTotal, snap.co2.verificeretTotal, 1);
  const fosforMax = Math.max(
    snap.fosfor.vandloebFoerKgAar,
    snap.fosfor.vandloebEfterKgAar,
    snap.fosfor.groefterFoerKgAar,
    snap.fosfor.groefterEfterKgAar,
    1,
  );
  const dybdeMax = Math.max(
    metode.baseline.middelDybdeM ?? 0,
    metode.efter.middelDybdeM ?? 0,
    0.5,
  );
  const aktiveTiltag = (Object.keys(TILTAG_LABEL) as (keyof Tiltag)[]).filter(
    (k) => p.tiltag[k],
  );

  return (
    <main className="p-6 max-w-[880px] w-full mx-auto space-y-4">
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

      <ReportDoc>
        <ReportMasthead
          kicker="LavbundsMRV · Verifikationsrapport"
          title={p.navn}
          subtitle="Målt verifikation af krediteret klimaeffekt — med fuldt revisionsspor"
          badge={
            kaedeOk ? (
              <Pill tone="success">Revisionsspor intakt</Pill>
            ) : kaede.data ? (
              <Pill tone="danger">KÆDEBRUD ved post {kaede.data.brud?.seq}</Pill>
            ) : (
              <Pill tone="default">Kæde verificeres…</Pill>
            )
          }
          meta={[
            { label: "Kommune", value: p.kommune },
            { label: "Samlet areal", value: `${p.samletArealHa.toLocaleString("da-DK")} ha` },
            { label: "Målepunkter", value: `${antalPunkter} stk.` },
            { label: "Status", value: p.status },
            {
              label: "Genereret",
              value: new Date(snap.genereret).toLocaleDateString("da-DK"),
            },
          ]}
        />

        {/* Konklusion — det revisor/myndighed skal se på ét blik. */}
        <ReportSection
          title="Konklusion — målt verifikation af krediteret effekt"
        >
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-6 items-start">
            <div>
              <ReportHero
                label="Opnåelsesgrad — målt andel af den lovede effekt"
                value={opn.procent.toLocaleString("da-DK")}
                unit="%"
                tone={opnTone}
                sub={
                  <>
                    Lovet grundlag:{" "}
                    {opn.lovetKilde === "publiceret_ex_ante"
                      ? "statens publicerede ex-ante-tal fra forundersøgelsen"
                      : "genberegnet med statens v12-faktorer"}
                    {" · "}
                    {metode.efter.antal} målinger
                    {metode.baseline.antal > 0 ? " (efter etablering)" : ""} · verifikationsgrad{" "}
                    {(snap.co2.verifikationsgrad * 100).toFixed(0)} %
                  </>
                }
              />
              <div className="mt-3">
                <ReportMeter procent={opn.procent} tone={opnTone} />
              </div>
              {opn.procent > 100 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Målt effekt overstiger det krediterede — konsistent med at ex-ante-metoder
                  systematisk underestimerer (GEST/MoorFutures-data).
                </p>
              )}
            </div>
            <div className="grid gap-3">
              <ReportKpi
                label="Lovet effekt (ex-ante)"
                value={`${opn.lovetTotal.toLocaleString("da-DK")} t CO₂e/år`}
                sub={
                  opn.lovetKilde === "publiceret_ex_ante"
                    ? "Statens publicerede forundersøgelsestal"
                    : "Genberegnet, v12"
                }
              />
              <ReportKpi
                label="Målt verificeret"
                value={`${opn.verificeretTotal.toLocaleString("da-DK")} t CO₂e/år`}
                sub={`±${snap.co2.usikkerhedTotal.toFixed(1)} t · ${ledger.data?.length ?? 0} poster i SHA-256-kædet revisionsspor`}
                accent
              />
            </div>
          </div>
          <p className="mt-5 text-xs text-muted-foreground max-w-2xl">
            Staten krediterer projektets effekt <em>ex-ante</em>. Denne rapport dokumenterer den{" "}
            <strong>målte</strong> effekt med fuldt revisionsspor, så kommunens klimatal er
            verificerbare — ikke selvberegnede skøn. Effektfaktorerne er statens egne (se
            faktorgrundlag).
          </p>
        </ReportSection>

        <ReportSection nr={1} title="Projektstamdata & tiltag">
          <ReportKV
            items={[
              { label: "Status", value: p.status },
              {
                label: "Samlet areal",
                value: `${p.samletArealHa.toLocaleString("da-DK")} ha`,
              },
              { label: "Vandspejl FØR", value: `${p.vandspejlFoerM.toFixed(2)} m` },
              ...(p.torvAndel !== undefined
                ? [{ label: "Tørveandel", value: `${(p.torvAndel * 100).toFixed(0)} %` }]
                : []),
              ...(p.publiceretExAnteTonPrHa !== undefined
                ? [
                    {
                      label: "Publiceret ex-ante",
                      value: `${p.publiceretExAnteTonPrHa.toFixed(1)} t CO₂e/ha/år`,
                    },
                  ]
                : []),
              ...(p.etableringsdato
                ? [
                    {
                      label: "Etableringsdato",
                      value: new Date(p.etableringsdato).toLocaleDateString("da-DK", {
                        timeZone: "UTC",
                      }),
                    },
                  ]
                : []),
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {aktiveTiltag.map((k) => (
              <Pill key={k} tone="success">
                {TILTAG_LABEL[k]}
              </Pill>
            ))}
            {aktiveTiltag.length === 0 && (
              <span className="text-sm text-destructive">Ingen aktive tiltag registreret.</span>
            )}
          </div>
        </ReportSection>

        <ReportSection
          nr={2}
          title="Klima — CO₂-effekt"
          intro="Krediteret effekt efter statens v12-beregningsark sammenholdt med den målt verificerede effekt."
        >
          <ReportBars
            rows={[
              {
                label: "Krediteret (v12)",
                andel: snap.co2.krediteretTotal / co2Max,
                vaerdi: `${snap.co2.krediteretTotal.toFixed(1)} t`,
                farve: DOC_BLAA,
                sub: `${snap.co2.krediteretTonPrHa.toFixed(1)} t/ha`,
              },
              {
                label: "Verificeret (målt)",
                andel: snap.co2.verificeretTotal / co2Max,
                vaerdi: `${snap.co2.verificeretTotal.toFixed(1)} t`,
                farve: DOC_GROEN,
                sub: `±${snap.co2.usikkerhedTotal.toFixed(1)}`,
              },
            ]}
          />
          <p className="mt-2.5 text-[11px] text-muted-foreground">
            t CO₂e/år · verifikationsgrad {(snap.co2.verifikationsgrad * 100).toFixed(0)} % af
            arealet dokumenteret i våd tilstand.
          </p>
        </ReportSection>

        <ReportSection
          nr={3}
          title="Arealfordeling pr. afvandingsklasse (målt)"
          intro="Andel af målingerne pr. afvandingsklasse (Naturstyrelsens klasseskala, våd → tør)."
        >
          <ReportBars
            rows={fordeling.map((f) => ({
              label: f.navn,
              andel: f.andel,
              vaerdi: `${(f.andel * 100).toFixed(0)} %`,
              farve: KLASSE_FARVE[f.navn] ?? "#94a3b8",
            }))}
          />
          {metode.baseline.antal > 0 && (
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Opgjort på {metode.efter.antal} målinger efter etableringsdatoen — samme grundlag
              som verifikationsgraden. Baseline-målinger ({metode.baseline.antal}) er opgjort
              separat i metodeafsnittet.
            </p>
          )}
        </ReportSection>

        <ReportSection
          nr={4}
          title="Fosfor — brinkerosion og balance"
          intro="Fosfortab fra brinkerosion før og efter tiltag (DCE-263, maj 2024)."
        >
          <ReportBars
            rows={[
              {
                label: "Vandløb",
                sub: "FØR",
                andel: snap.fosfor.vandloebFoerKgAar / fosforMax,
                vaerdi: `${snap.fosfor.vandloebFoerKgAar.toFixed(1)} kg`,
                farve: DOC_RAV,
              },
              {
                label: "Vandløb",
                sub: "EFTER",
                andel: snap.fosfor.vandloebEfterKgAar / fosforMax,
                vaerdi: `${snap.fosfor.vandloebEfterKgAar.toFixed(1)} kg`,
                farve: DOC_BLAA,
              },
              {
                label: "Grøfter",
                sub: "FØR",
                andel: snap.fosfor.groefterFoerKgAar / fosforMax,
                vaerdi: `${snap.fosfor.groefterFoerKgAar.toFixed(1)} kg`,
                farve: DOC_RAV,
              },
              {
                label: "Grøfter",
                sub: "EFTER",
                andel: snap.fosfor.groefterEfterKgAar / fosforMax,
                vaerdi: `${snap.fosfor.groefterEfterKgAar.toFixed(1)} kg`,
                farve: DOC_BLAA,
              },
            ]}
          />
          <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: DOC_RAV }} />
              FØR tiltag
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: DOC_BLAA }} />
              EFTER tiltag
            </span>
            <span>kg P/år</span>
          </div>
          <div className="mt-4 rounded-xl border bg-muted/20 px-4 py-3 inline-flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Balance
            </span>
            <span
              className={`text-xl font-semibold ${
                snap.fosfor.balanceKgAar >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {snap.fosfor.balanceKgAar >= 0 ? "+" : ""}
              {snap.fosfor.balanceKgAar.toFixed(1)} kg P/år
            </span>
          </div>
        </ReportSection>

        <ReportSection nr={5} title="Metode & datagrundlag">
          <ReportKV
            items={[
              {
                label: "Målepunkter",
                value:
                  p.samletArealHa > 0
                    ? `${antalPunkter} stk. (${(antalPunkter / p.samletArealHa).toLocaleString(
                        "da-DK",
                        { maximumFractionDigits: 2 },
                      )} pr. ha)`
                    : `${antalPunkter} stk.`,
              },
              {
                label: "Måleperiode",
                value:
                  metode.foersteTidspunkt && metode.senesteTidspunkt
                    ? `${new Date(metode.foersteTidspunkt).toLocaleDateString("da-DK")} – ${new Date(
                        metode.senesteTidspunkt,
                      ).toLocaleDateString("da-DK")}`
                    : "Ingen målinger endnu",
              },
              {
                label: "Transekter (FØR / EFTER)",
                value: `${(transekter.data ?? []).filter((t) => t.fase === "foer").length} / ${
                  (transekter.data ?? []).filter((t) => t.fase === "efter").length
                }`,
              },
              { label: "Grøfte-strækninger", value: `${groefter.data?.length ?? 0}` },
              { label: "Ledger-poster", value: `${ledger.data?.length ?? 0}` },
            ]}
          />

          {p.etableringsdato && (
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2.5">
                Baseline vs. efter etablering — middeldybde til vandspejl
              </div>
              <ReportBars
                rows={[
                  {
                    label: "Baseline (før)",
                    sub: `${metode.baseline.antal} mål.`,
                    andel: (metode.baseline.middelDybdeM ?? 0) / dybdeMax,
                    vaerdi:
                      metode.baseline.middelDybdeM !== null
                        ? `${metode.baseline.middelDybdeM.toFixed(2)} m`
                        : "—",
                    farve: DOC_RAV,
                  },
                  {
                    label: "Efter etablering",
                    sub: `${metode.efter.antal} mål.`,
                    andel: (metode.efter.middelDybdeM ?? 0) / dybdeMax,
                    vaerdi:
                      metode.efter.middelDybdeM !== null
                        ? `${metode.efter.middelDybdeM.toFixed(2)} m`
                        : "—",
                    farve: DOC_BLAA,
                  },
                ]}
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                m under terræn — kortere bjælke = vådere areal. Baseline-målinger indgår ikke i
                verifikationsgraden (jf. statens N/P-protokol).
              </p>
            </div>
          )}

          <div className="mt-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Målinger pr. kilde
            </div>
            <ReportTable
              head={["Kilde", "Antal"]}
              rows={metode.kilder.map(({ kilde, antal }) => [
                KILDE_LABEL[kilde] ?? kilde,
                antal.toLocaleString("da-DK"),
              ])}
            />
            {metode.kilder.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">Ingen målinger registreret.</p>
            )}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            <strong>Interpolation:</strong> Arealfordelingen pr. afvandingsklasse beregnes ud fra
            punktmålingernes seneste dybde til vandspejl; hvert målepunkt repræsenterer sit
            opland (nærmeste-punkt-princip). Vandstandsdybden (WTD) er den bærende
            MRV-parameter, jf. IPCC 2013 Wetlands Supplement og GEST/VM0036, hvor WTD-klasser
            anvendes som fallback-proxy for drivhusgasflux. Metoden er parallel til DCE's
            W01-overvågningsdesign med før/efter-måling.
          </p>
        </ReportSection>

        <ReportNote title="Metodisk kontekst">
          Statens kreditering sker ex-ante ud fra kortlagt tørvejord og forventet
          vandstandshævning. Empiriske eftermålinger på tyske MoorFutures-projekter og
          GEST-baserede opgørelser viser, at ex-ante/proxy-metoder systematisk{" "}
          <strong>underestimerer</strong> den faktiske klimaeffekt i langt de fleste scenarier
          (~96–98 % af de undersøgte). Målt verifikation som i denne rapport vil derfor typisk
          vise en effekt, der er lig med eller større end den krediterede — aldrig et grundlag
          for at nedskrive den. Se{" "}
          <span className="font-mono">docs/lavbund-mrv-positionering.md</span> for kilder og
          regulatorisk kontekst (bl.a. VLP-ordningens ex-ante-fokus og
          sørestaurerings-præcedensen for honorering af eftermåling).
        </ReportNote>

        <ReportSection
          nr={6}
          title="Faktorgrundlag & verifikation"
          intro={`Alle faktorer er indlæst fra de officielle beregningsark og verificeres automatisk mod arkene ved hver release. Senest verificeret: ${FAKTOR_VERIFICERET_DATO}.`}
        >
          <ReportKV
            items={[
              { label: "CO₂-faktorer", value: FAKTOR_VERSIONER.co2 },
              { label: "Fosfor-faktorer", value: FAKTOR_VERSIONER.fosfor },
              { label: "Anvendelsesområde", value: snap.usageScope },
            ]}
          />
          <ul className="mt-4 space-y-2.5">
            {FAKTOR_KILDER.map((k) => (
              <li key={k.fil} className="rounded-xl border px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-medium text-sm">{k.navn}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {k.udgiver} · version {k.version}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{k.anvendtTil}</div>
                <div className="mt-1.5 font-mono text-[10px] text-muted-foreground break-all">
                  {k.fil} · SHA-256: {k.sha256}
                </div>
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportFooter>
          Anvendelsesområde: prioritering under tilskudsordninger og kommunens klimaregnskab.
          Metoden egner sig ikke til effektberegning ved salg af CO₂-kvoter og afviger fra den
          nationale opgørelse (jf. v12-vejledningen). SHA-256-kædet hændelseslog — efterprøvbar
          af revisor/myndighed.
        </ReportFooter>
      </ReportDoc>
    </main>
  );
}
