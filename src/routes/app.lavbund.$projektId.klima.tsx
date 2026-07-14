import { ledgerAppend } from "@/services/ledgerService";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Leaf, Info, Lock, Sparkles } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  getAnbefalinger,
  getGroefter,
  getMaalepunkter,
  getProject,
  getReadings,
  getTransekter,
  saveSnapshot,
} from "@/services/lavbundService";
import {
  beregnKrediteretCO2,
  beregnVerifikationsgrad,
  beregnOpnaaelse,
  bygSnapshot,
  tiltagValidering,
} from "@/services/lavbundBeregning";
import { AFVANDINGSKLASSER } from "@/data/lavbundFaktorer";
import { BeregningsgrundlagEditor } from "@/components/lavbund/BeregningsgrundlagEditor";
import type { Tiltag } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId/klima")({
  head: () => ({ meta: [{ title: "Klima · CO₂ — LavbundsMRV" }] }),
  component: KlimaPage,
});

const TILTAG_LABEL: Record<keyof Tiltag, string> = {
  draenAfbrydes: "Dræn afbrydes",
  groefterTilkastes: "Grøfter tilkastes",
  vandloebsbundHaeves: "Vandløbsbund hæves",
  overrislingszoner: "Overrislingszoner",
  pumpedriftStopper: "Pumpedrift stopper",
};

function fmtTon(v: number): string {
  return `${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })} t CO₂e/år`;
}
function fmtHa(v: number): string {
  return `${v.toLocaleString("da-DK", { maximumFractionDigits: 2 })} ha`;
}

function KlimaPage() {
  const { projektId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [projekt, _mps, readings, transekter, groefter] = useQueries({
    queries: [
      { queryKey: ["lavbund", "project", projektId], queryFn: () => getProject(projektId) },
      { queryKey: ["lavbund", "mp", projektId], queryFn: () => getMaalepunkter(projektId) },
      { queryKey: ["lavbund", "readings", projektId], queryFn: () => getReadings(projektId) },
      { queryKey: ["lavbund", "transekter", projektId], queryFn: () => getTransekter(projektId) },
      { queryKey: ["lavbund", "groefter", projektId], queryFn: () => getGroefter(projektId) },
    ],
  });
  void _mps;
  const anbefalinger = useQuery({
    queryKey: ["lavbund", "anbefalinger", projektId],
    queryFn: () => getAnbefalinger(projektId),
  });

  const co2 = useMemo(
    () => (projekt.data ? beregnKrediteretCO2(projekt.data) : null),
    [projekt.data],
  );
  const ver = useMemo(
    () => beregnVerifikationsgrad(readings.data ?? [], projekt.data?.etableringsdato),
    [readings.data, projekt.data?.etableringsdato],
  );
  const tilt = useMemo(
    () => (projekt.data ? tiltagValidering(projekt.data) : null),
    [projekt.data],
  );

  const isLoading = projekt.isLoading || readings.isLoading;
  if (isLoading)
    return (
      <div className="p-6 space-y-3">
        <Card className="p-8 h-40 animate-pulse">
          <span />
        </Card>
      </div>
    );
  if (!projekt.data || !co2 || !tilt)
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-destructive">Kunne ikke hente projektdata.</Card>
      </div>
    );

  const p = projekt.data;
  const verificeretTotal = co2.krediteretTotal * ver.verifikationsgrad;
  const verificeretPrHa = co2.krediteretTonPrHa * ver.verifikationsgrad;

  async function bogfoer() {
    if (!projekt.data || !tilt?.ok || co2?.arealTjek !== "ok") return;
    setSaving(true);
    try {
      const snap = bygSnapshot({
        projekt: projekt.data,
        readings: readings.data ?? [],
        transekterFoer: (transekter.data ?? []).filter((t) => t.fase === "foer"),
        transekterEfter: (transekter.data ?? []).filter((t) => t.fase === "efter"),
        groefter: groefter.data ?? [],
      });
      await saveSnapshot(snap);
      await ledgerAppend("lavbund", projektId, {
        actor: "bruger",
        event: "co2_bogfoert",
        detail: `Verificeret ${verificeretTotal.toFixed(1)} t CO₂e/år (${(ver.verifikationsgrad * 100).toFixed(0)} %)`,
      });
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      navigate({ to: "/app/lavbund/$projektId/revisionsspor", params: { projektId } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      {/* Anvendelsesområde-banner — obligatorisk */}
      <Card className="p-4 border-amber-300/60 bg-amber-50">
        <div className="flex gap-3 items-start">
          <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <div className="font-semibold">Anvendelsesområde</div>
            <p className="mt-1">
              Prioritering under tilskudsordningerne og kommunens klimaregnskab. Metoden egner sig{" "}
              <strong>ikke</strong> til effektberegning ved salg af CO₂-kvoter og afviger fra den
              nationale opgørelse (jf. v12-vejledningen).
            </p>
          </div>
        </div>
      </Card>

      {!tilt.ok && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">{tilt.besked}</span>
          </div>
        </Card>
      )}

      {/* Redigér selve beregningsgrundlaget (arealfordeling, tiltag, vandspejl, afvigelser) */}
      <BeregningsgrundlagEditor projekt={p} />

      {/* Opnåelsesgrad — produktets kerne: lovet (ex-ante) vs. målt */}
      {(() => {
        const opn = beregnOpnaaelse(p, co2.krediteretTotal, verificeretTotal);
        const tone =
          opn.procent >= 90 ? "text-primary" : opn.procent >= 70 ? "text-amber-600" : "text-destructive";
        const barTone =
          opn.procent >= 90 ? "bg-primary" : opn.procent >= 70 ? "bg-amber-500" : "bg-destructive";
        return (
          <Card className="p-5 border-primary/25">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Opnåelsesgrad — målt andel af den lovede effekt
                </div>
                <div className={`mt-1 text-4xl font-semibold tabular-nums ${tone}`}>
                  {opn.procent} %
                </div>
                <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                  Staten krediterer effekten <em>på forhånd</em> — LavbundsMRV dokumenterer om den
                  faktisk indtræffer. Lovet grundlag:{" "}
                  {opn.lovetKilde === "publiceret_ex_ante"
                    ? "statens publicerede ex-ante-tal fra forundersøgelsen"
                    : "genberegnet med statens v12-faktorer (publiceret ex-ante ikke angivet)"}
                  .
                </p>
              </div>
              <dl className="text-sm text-right space-y-0.5 shrink-0">
                <div>
                  <dt className="inline text-muted-foreground">Lovet (ex-ante): </dt>
                  <dd className="inline font-medium tabular-nums">{fmtTon(opn.lovetTotal)}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Målt verificeret: </dt>
                  <dd className="inline font-semibold tabular-nums text-primary">
                    {fmtTon(opn.verificeretTotal)}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barTone}`}
                style={{ width: `${Math.min(100, opn.procent)}%` }}
              />
            </div>
            {opn.procent > 100 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Målt effekt overstiger det krediterede — konsistent med at ex-ante-metoder
                systematisk underestimerer (GEST/MoorFutures-data).
              </p>
            )}
          </Card>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Officielt krediteret (v12)
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {fmtTon(co2.krediteretTotal)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {co2.krediteretTonPrHa.toFixed(1)} t/ha · areal {fmtHa(co2.arealSum)} /{" "}
            {fmtHa(p.samletArealHa)}
          </div>
          {p.publiceretExAnteTonPrHa !== undefined && (
            <div className="mt-3 text-xs text-muted-foreground">
              Publiceret ex-ante (forundersøgelse):{" "}
              <strong className="text-foreground">
                {p.publiceretExAnteTonPrHa.toFixed(1)} t/ha
              </strong>
            </div>
          )}
          <div className="mt-3">
            {co2.arealTjek === "ok" ? (
              <Pill tone="success">
                <CheckCircle2 className="h-3 w-3" /> Arealtjek: OK
              </Pill>
            ) : (
              <Pill tone="danger">
                <AlertTriangle className="h-3 w-3" /> Arealtjek: Fejl
              </Pill>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Verificeret opnået (målt)
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-primary">
            {fmtTon(verificeretTotal)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {verificeretPrHa.toFixed(1)} t/ha · verifikationsgrad{" "}
            <strong className="text-foreground">
              {(ver.verifikationsgrad * 100).toFixed(0)} %
            </strong>{" "}
            ({ver.antalMaalinger} målinger)
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Usikkerhedsbånd (±20 %):{" "}
            <strong className="text-foreground">
              ±{(verificeretTotal * 0.2).toFixed(1)} t CO₂e/år
            </strong>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Arealfordeling — målt afvandingsklasse"
          subtitle="Andel af feltdata i hver klasse. Verifikationsgraden vægter våde klasser + halv Fugtig eng."
        />
        <div className="px-5 pb-5">
          <div className="space-y-2">
            {AFVANDINGSKLASSER.map((k) => {
              const andel = ver.fordeling[k.navn] ?? 0;
              return (
                <div key={k.navn} className="flex items-center gap-3">
                  <div className="text-xs w-32 truncate">{k.navn}</div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${andel * 100}%` }}
                    />
                  </div>
                  <div className="text-xs tabular-nums w-14 text-right">
                    {(andel * 100).toFixed(0)} %
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Aktive tiltag" subtitle="Metoden forudsætter aktiv udtagning." />
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {(Object.keys(TILTAG_LABEL) as (keyof Tiltag)[]).map((k) => {
            const on = p.tiltag[k];
            return (
              <span
                key={k}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                  on
                    ? "bg-success/10 border-success/40 text-success"
                    : "bg-muted/40 text-muted-foreground"
                }`}
              >
                <Leaf className="h-3 w-3" />
                {TILTAG_LABEL[k]}
                {!on && " · inaktivt"}
              </span>
            );
          })}
        </div>
      </Card>

      {p.afvigelser.length > 0 && (
        <Card>
          <CardHeader
            title="Afvigelser"
            subtitle="Kun verificeret andel krediteres — åbne afvigelser reducerer opnået effekt."
          />
          <div className="px-5 pb-5 space-y-2">
            {p.afvigelser.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border p-3 flex items-start gap-3 bg-muted/20"
              >
                <AlertTriangle
                  className={`h-4 w-4 mt-0.5 ${a.aaben ? "text-warning" : "text-success"}`}
                />
                <div className="text-sm">
                  <div className="font-medium">{a.beskrivelse}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Korrigerende handling: {a.korrigerendeHandling}
                  </div>
                </div>
                <div className="ml-auto">
                  {a.aaben ? <Pill tone="warning">Åben</Pill> : <Pill tone="success">Lukket</Pill>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* DecisionsIQ — regelbaserede anbefalinger */}
      <Card>
        <CardHeader
          title="Anbefalinger (DecisionsIQ)"
          subtitle="Regelbaserede forslag ud fra tiltag, afvigelser og verifikationsgrad."
        />
        <div className="px-5 pb-5">
          {anbefalinger.isLoading && (
            <div className="text-sm text-muted-foreground">Beregner anbefalinger…</div>
          )}
          {anbefalinger.data && anbefalinger.data.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Ingen aktive anbefalinger — projektet opfylder tærskelværdierne.
            </div>
          )}
          {anbefalinger.data && anbefalinger.data.length > 0 && (
            <ul className="space-y-2">
              {anbefalinger.data.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm rounded-xl border bg-muted/10 p-3"
                >
                  <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Impact Exchange — hård spærring for CO₂-kvotesalg */}
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader
          title="Impact Exchange"
          subtitle="Overførsel til CO₂-kvotesalg er spærret for dette modul."
        />
        <div className="px-5 pb-5 flex items-start gap-3">
          <Lock className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p>
              Verificeret effekt kan bogføres i ESG Ledger og bruges til tilskudsordninger
              og kommunens klimaregnskab, men <strong>kan ikke overføres til Impact
              Exchange</strong> som CO₂-kvoter. Metoden (v12) er ikke godkendt til
              kvotehandel og afviger fra den nationale opgørelse.
            </p>
            <button
              type="button"
              disabled
              title="Metoden understøtter ikke kvotesalg"
              className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 bg-background px-3 py-1.5 text-xs text-destructive opacity-70 cursor-not-allowed"
            >
              <Lock className="h-3.5 w-3.5" /> Overfør til Impact Exchange (spærret)
            </button>
          </div>
        </div>
      </Card>



      <div className="flex justify-end">
        <button
          type="button"
          onClick={bogfoer}
          disabled={!tilt.ok || co2.arealTjek !== "ok" || saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Bogfører…" : "Bogfør verificeret effekt"}
        </button>
      </div>
    </main>
  );
}
