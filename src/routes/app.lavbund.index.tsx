import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FolderOpen, Leaf, MapPin, Plus, X } from "lucide-react";
import { Card, PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { getProjects, saveProject } from "@/services/lavbundService";
import {
  beregnKrediteretCO2,
  tiltagValidering,
} from "@/services/lavbundBeregning";
import type { LavbundsProjekt, ProjektStatus } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/")({
  head: () => ({ meta: [{ title: "LavbundsMRV — Projekter" }] }),
  component: LavbundIndexPage,
});

const STATUS_LABEL: Record<ProjektStatus, string> = {
  planlagt: "Planlagt",
  etablering: "Etablering",
  maaling: "Under måling",
  verificeret: "Verificeret",
  overdraget: "Overdraget",
};

const STATUS_TONE: Record<
  ProjektStatus,
  "default" | "success" | "warning" | "info"
> = {
  planlagt: "default",
  etablering: "info",
  maaling: "warning",
  verificeret: "success",
  overdraget: "default",
};

function fmtHa(v: number): string {
  return `${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })} ha`;
}
function fmtTon(v: number): string {
  return `${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })} t CO₂e/år`;
}

function ModulStatusStrip() {
  const items = [
    { navn: "Klima · CO₂", note: "aktiv · v12", tone: "success" as const },
    { navn: "Fosfor · brinkerosion", note: "aktiv · DCE 263", tone: "success" as const },
    { navn: "Fosfor · tilbageholdelse", note: "under import", tone: "default" as const },
    { navn: "Kvælstof · N", note: "under import", tone: "default" as const },
  ];
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Modulstatus
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <div
            key={i.navn}
            className="rounded-xl border bg-card px-3 py-2 text-xs flex items-center gap-2"
          >
            <span className="font-medium">{i.navn}</span>
            <Pill tone={i.tone}>{i.note}</Pill>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LavbundIndexPage() {
  const q = useQuery({
    queryKey: ["lavbund", "projects"],
    queryFn: getProjects,
  });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Lavbundsprojekter"
        description="Målt verifikation af CO₂- og fosforeffekt. Statens faktorer (v12 + DCE 263) anvendes uændret."
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" />
            Nyt lavbundsprojekt
          </button>
        }
      />

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} />}

      {/* Formålet med modulet — produktfortællingen fra LavbundsMRV-oplægget */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <p className="text-sm leading-relaxed">
          <strong>Hvorfor LavbundsMRV?</strong> Staten krediterer hvert lavbunds- og vandprojekts
          CO₂- og fosforeffekt <em>på forhånd</em> (ex-ante) — men ingen måler, om den lovede effekt
          faktisk indtræffer. Dette modul lukker hullet: felt- og loggermålinger dokumenterer den{" "}
          <strong>opnåede</strong> effekt mod statens egne beregninger, med et SHA-256-kædet
          revisionsspor til årlig godkendelse hos myndighed eller revisor. Driftsystemer
          dokumenterer <em>handlingen</em> — LavbundsMRV dokumenterer <em>effekten</em>.
        </p>
      </Card>

      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState onCreate={() => setShowCreate(true)} />}
      {q.data && q.data.length > 0 && <Loaded projects={q.data} />}

      <Leverancemodel />
    </main>
  );
}

/**
 * Leverancemodellen og 24-måneders måleprogrammet — sådan sælges og leveres
 * LavbundsMRV som kontraktforløb, ikke kun som software.
 */
function Leverancemodel() {
  const trin = [
    {
      nr: "TRIN 1 · GOFREYRA",
      titel: "Opsætning + første års MRV",
      tekst: "Metode, målepunkter, drone/felt, referencemåling og konfigureret system.",
    },
    {
      nr: "TRIN 2 · KOMMUNEN",
      titel: "Løbende bogføring",
      tekst:
        "Kommunen bogfører selv sine projekter i systemet — den fysiske måling og verifikation leveres fortsat som ydelse.",
    },
    {
      nr: "TRIN 3 · MYNDIGHED",
      titel: "Årlig verifikation / stempel",
      tekst:
        "Kommunen fremlægger revisionssporet for DCE/SEGES eller anden myndighed til årlig godkendelse.",
    },
  ];
  const faser = [
    {
      titel: "Måned 0–3 · Etablering",
      punkter: [
        "Gennemgang af projektdesign",
        "Referencemåling + drone/RTK",
        "Sensorplacering og installation",
        "Brinketransekter, jord- og vandprøver",
      ],
    },
    {
      titel: "Måned 4–12 · Første måleår",
      punkter: [
        "Kontinuert vandstandsdata",
        "Sæsonvalidering i felten",
        "Fosforprøver + kvalitetskontrol",
        "Midtvejsrapport og anbefalinger",
      ],
    },
    {
      titel: "Måned 13–24 · Verifikationsår",
      punkter: [
        "Anden sæsoncyklus",
        "Bekræftelse af varig hydrologi",
        "Fosfor før/efter-opgørelse",
        "Slutrapport, oplæring og overdragelse",
      ],
    },
  ];
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold">Leverancemodel & måleprogram</div>
      <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
        LavbundsMRV erstatter ikke statens beregningsværktøjer — den <strong>operationaliserer</strong>{" "}
        dem: kobler dem til to års feltmåling og dokumenterer, om de tilsigtede miljøforhold
        reelt blev opnået. Kommunen ejer sine projektdata og kan eksportere dem i åbne formater.
      </p>
      <div className="mt-4 grid md:grid-cols-3 gap-3">
        {trin.map((t) => (
          <div key={t.nr} className="rounded-xl border p-4">
            <div className="font-mono text-[10px] tracking-wider text-primary">{t.nr}</div>
            <div className="mt-1 text-sm font-medium">{t.titel}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t.tekst}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid md:grid-cols-3 gap-3">
        {faser.map((f) => (
          <div key={f.titel} className="rounded-xl border p-4 border-t-2 border-t-primary/50">
            <div className="text-xs font-semibold">{f.titel}</div>
            <ul className="mt-2 space-y-1.5">
              {f.punkter.map((pkt) => (
                <li key={pkt} className="text-xs text-muted-foreground border-b border-border/60 pb-1.5 last:border-0">
                  {pkt}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [navn, setNavn] = useState("");
  const [kommune, setKommune] = useState("");
  const [arealHa, setArealHa] = useState("");
  const [torvAndel, setTorvAndel] = useState("100");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const areal = Number(arealHa.replace(",", "."));
    if (!navn.trim() || !kommune.trim() || !Number.isFinite(areal) || areal <= 0) {
      toast.error("Udfyld navn, kommune og et gyldigt areal.");
      return;
    }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const projekt: LavbundsProjekt = {
        id,
        navn: navn.trim(),
        kommune: kommune.trim(),
        status: "planlagt",
        samletArealHa: areal,
        // Arealfordelingen udfyldes i klima-fanen — én neutral post gør
        // areal-afstemningen gyldig fra start.
        arealFordeling: [
          { kulstofklasse: ">12", arealanvendelse: "Permanent græs", buffer: false, hektar: areal },
        ],
        tiltag: {
          draenAfbrydes: false,
          groefterTilkastes: false,
          vandloebsbundHaeves: false,
          overrislingszoner: false,
          pumpedriftStopper: false,
        },
        torvAndel: Math.min(1, Math.max(0, Number(torvAndel) / 100)) || 1,
        vandspejlFoerM: 0.8,
        usageScope: "tilskudsordning_klimaregnskab",
        afvigelser: [],
      };
      await saveProject(projekt);
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      toast.success("Lavbundsprojekt oprettet");
      navigate({ to: "/app/lavbund/$projektId/kort", params: { projektId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke oprette projekt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 border-primary/30">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">Nyt lavbundsprojekt</div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span className="font-medium">Projektnavn</span>
            <input
              value={navn}
              onChange={(e) => setNavn(e.target.value)}
              placeholder="Fx Åmosen Vest"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              autoFocus
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-medium">Kommune</span>
            <input
              value={kommune}
              onChange={(e) => setKommune(e.target.value)}
              placeholder="Fx Haderslev"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-medium">Samlet areal (ha)</span>
            <input
              value={arealHa}
              onChange={(e) => setArealHa(e.target.value)}
              placeholder="Fx 42,5"
              inputMode="decimal"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-medium">Tørveandel (%)</span>
            <input
              value={torvAndel}
              onChange={(e) => setTorvAndel(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Arealfordeling på kulstofklasser, tiltag og vandspejl justeres bagefter i klima-fanen.
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/40">
            Annuller
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Opretter…" : "Opret projekt"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5 animate-pulse h-24">
          <span />
        </Card>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
      <div className="mt-3 font-semibold">Kunne ikke hente lavbundsprojekter</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Prøv igen eller kontakt din administrator.
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-xl border px-4 py-2 text-sm hover:bg-muted/40"
      >
        Prøv igen
      </button>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="p-10 text-center">
      <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground" />
      <div className="mt-3 font-semibold">Ingen lavbundsprojekter endnu</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Opret det første projekt for at komme i gang med MRV.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Opret det første projekt
      </button>
    </Card>
  );
}

function Loaded({ projects }: { projects: LavbundsProjekt[] }) {
  const totalArea = projects.reduce((s, p) => s + p.samletArealHa, 0);
  const totalKrediteret = projects.reduce(
    (s, p) => s + beregnKrediteretCO2(p).krediteretTotal,
    0,
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Projekter"
          value={String(projects.length)}
          icon={<FolderOpen className="h-5 w-5" />}
        />
        <StatCard
          label="Samlet areal"
          value={fmtHa(totalArea)}
          icon={<MapPin className="h-5 w-5" />}
        />
        <StatCard
          label="Krediteret CO₂ (v12)"
          value={fmtTon(totalKrediteret)}
          icon={<Leaf className="h-5 w-5" />}
        />
      </div>

      <ModulStatusStrip />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Projekt</th>
                <th className="text-left px-4 py-3 font-medium">Kommune</th>
                <th className="text-right px-4 py-3 font-medium">Areal</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">
                  Krediteret t CO₂e/år
                </th>
                <th className="text-left px-4 py-3 font-medium">Bemærkning</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const co2 = beregnKrediteretCO2(p);
                const tilt = tiltagValidering(p);
                const aabne = p.afvigelser.filter((a) => a.aaben).length;
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to="/app/lavbund/$projektId/kort"
                        params={{ projektId: p.id }}
                        className="font-medium hover:underline"
                      >
                        {p.navn}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.kommune}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtHa(p.samletArealHa)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Pill>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {co2.arealTjek === "fejl" ? (
                        <span className="text-destructive">Arealtjek fejler</span>
                      ) : (
                        fmtTon(co2.krediteretTotal)
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {aabne > 0 && (
                          <Pill tone="warning">
                            <AlertTriangle className="h-3 w-3" /> {aabne} åben(e)
                          </Pill>
                        )}
                        {!tilt.ok && <Pill tone="danger">Ingen tiltag</Pill>}
                        {aabne === 0 && tilt.ok && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground italic px-1">
        Anvendelsesområde: prioritering under tilskudsordninger og kommunens
        klimaregnskab. Metoden egner sig ikke til effektberegning ved salg af
        CO₂-kvoter og afviger fra den nationale opgørelse (jf. v12-vejledningen).
      </div>
    </>
  );
}
