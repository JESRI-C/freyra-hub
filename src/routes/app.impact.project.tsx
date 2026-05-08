import { createFileRoute, Link } from "@tanstack/react-router";
import {
  MapPin,
  Download,
  Plus,
  Leaf,
  Sprout,
  Trees,
  Database,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Satellite,
  Cpu,
  ClipboardCheck,
  Send,
  Droplets,
  Camera,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ImpactMetricCard,
  VerificationBadge,
  RiskBadge,
  CategoryBadge,
  LocalSiteMap,
  VerificationTimeline,
  DataQualityScore,
} from "@/components/impact/Primitives";
import { getProject } from "@/lib/impact-data";
import { usePortfolio } from "@/lib/impact-state";

export const Route = createFileRoute("/app/impact/project")({
  head: () => ({ meta: [{ title: "Projektprofil — Impact Exchange" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const project = getProject("skallebaek")!;
  const portfolio = usePortfolio();
  const inPortfolio = portfolio.has(project.id);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="h-44 relative" style={{ background: project.image }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute top-4 left-4 flex gap-2">
            <CategoryBadge category={project.category} />
            <VerificationBadge status={project.verification} />
          </div>
          <div className="absolute bottom-4 left-4 right-4 text-white flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{project.title}</h1>
              <div className="text-sm opacity-90 inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {project.location}, {project.country} · {project.natureType}
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Standard: <span className="text-foreground font-medium">{project.standard}</span> · Verifier:{" "}
            <span className="text-foreground font-medium">{project.verifier}</span>
          </div>
          <div className="flex gap-2">
            <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center gap-1.5">
              <Download className="h-4 w-4" /> Download projektfakta
            </button>
            <button
              disabled={inPortfolio}
              onClick={() => portfolio.add(project.id)}
              className={`text-sm rounded-lg px-3 py-2 inline-flex items-center gap-1.5 ${
                inPortfolio
                  ? "bg-success/15 text-success cursor-default"
                  : "bg-primary text-primary-foreground hover:opacity-95"
              }`}
            >
              {inPortfolio ? <ShieldCheck className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {inPortfolio ? "I portefølje" : "Føj til portefølje"}
            </button>
          </div>
        </div>
      </Card>

      {/* Key metrics */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <ImpactMetricCard label="Biodiversitetsindeks" value={`${project.biodiversityIndex}`} unit="/100" icon={<Sprout className="h-4 w-4" />} />
        <ImpactMetricCard label="Areal" value={`${project.hectares}`} unit="ha" icon={<Trees className="h-4 w-4" />} />
        <ImpactMetricCard label="CO₂e potentiale" value={`${project.co2ePotential.toLocaleString("da-DK")}`} unit="t" icon={<Leaf className="h-4 w-4" />} />
        <ImpactMetricCard label="Datakvalitet" value={`${project.dataQuality}`} unit="%" icon={<Database className="h-4 w-4" />} />
        <ImpactMetricCard label="Verifikation" value="3.parts" hint="Bureau Veritas" icon={<ShieldCheck className="h-4 w-4" />} />
        <ImpactMetricCard label="Rapportklarhed" value="Høj" icon={<FileText className="h-4 w-4" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Description */}
        <Card className="lg:col-span-2 p-5">
          <div className="font-semibold mb-2">Om projektet</div>
          <p className="text-sm leading-relaxed text-foreground/85">
            Skallebæk Biodiversity Pilot er et tværfagligt naturgenopretningsprojekt langs Skallebæk i Haderslev
            Kommune. Projektet kombinerer hydrologisk genskabning af vandløbet, etablering af eng- og vådområder samt
            beskyttelse af eksisterende skovkant.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <div className="font-medium mb-1">Hvorfor det betyder noget</div>
              <p className="text-muted-foreground leading-relaxed">
                Området er identificeret som kritisk korridor mellem to Natura 2000-områder. Genopretning øger
                forbindelsen mellem habitater og forbedrer både biodiversitet og vandkvalitet nedstrøms.
              </p>
            </div>
            <div>
              <div className="font-medium mb-1">Hvad måles</div>
              <ul className="text-muted-foreground space-y-1 list-disc pl-4">
                <li>Vandkvalitet (NO₃, PO₄, ilt) via 6 sensorpunkter</li>
                <li>Biodiversitetsindeks (artsrigdom, indikatorarter)</li>
                <li>Hydrologi og oversvømmelseszoner</li>
                <li>CO₂e-binding i lavbund og vegetation</li>
              </ul>
            </div>
            <div className="sm:col-span-2">
              <div className="font-medium mb-1">Sådan dokumenteres impact</div>
              <p className="text-muted-foreground leading-relaxed">
                Alle målinger registreres i ESG Ledger med tidsstempel, kilde og metodikreference. Data
                krydsvalideres mod Sentinel-2 satellitlag og kvartalsvise feltobservationer fra DCE.
              </p>
            </div>
          </div>
        </Card>

        {/* Risk */}
        <Card>
          <CardHeader title="Risiko og usikkerhed" subtitle="Aktuelle observationer fra DecisionsIQ" />
          <ul className="px-5 pb-5 space-y-3 text-sm">
            {[
              { t: "Datahuller i sommermåneder", level: "Medium", note: "2 sensorer offline 12 dage i juli" },
              { t: "Sæsonvariation i artsobservationer", level: "Lav", note: "Kompenseret med multi-årig baseline" },
              { t: "Måleusikkerhed på CO₂-flux", level: "Medium", note: "±18% — anbefal flere kammermålinger" },
              { t: "Compliance: ESRS E4 dokumentation", level: "Lav", note: "Mangler kun engelsk audit-bilag" },
            ].map((r) => (
              <li key={r.t} className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{r.t}</div>
                    <RiskBadge level={r.level as any} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.note}</div>
                </div>
              </li>
            ))}
            <li className="border-t pt-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground mb-1">Anbefalede forbedringer</div>
              Tilføj 2 ekstra vandkvalitetssensorer i zone B og udvid feltbesøg til månedlig kadence i Q3.
            </li>
          </ul>
        </Card>
      </div>

      {/* Map and zones */}
      <Card>
        <CardHeader title="Projektzoner og målepunkter" subtitle="Zone A · vandløb — Zone B · eng & vådområde — Zone C · skovkant" />
        <div className="px-5 pb-5"><LocalSiteMap /></div>
      </Card>

      {/* Data sources & timeline */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Datakilder" subtitle="Status, kvalitet og verifikation pr. kilde" />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr><th className="px-5 py-2">Kilde</th><th className="py-2">Status</th><th className="py-2">Sidst opdateret</th><th className="py-2 w-28">Kvalitet</th><th className="py-2">Verifikation</th></tr>
            </thead>
            <tbody className="divide-y">
              {[
                { i: <Cpu className="h-4 w-4" />, n: "Sensorer (6)", s: "Aktiv", d: "for 4 min", q: 94, v: "Auto-valideret" },
                { i: <Satellite className="h-4 w-4" />, n: "Sentinel-2 satellit", s: "Aktiv", d: "i går", q: 88, v: "Verificeret" },
                { i: <Camera className="h-4 w-4" />, n: "Drone-flyvning", s: "Aktiv", d: "3 dage siden", q: 82, v: "Manuelt review" },
                { i: <ClipboardCheck className="h-4 w-4" />, n: "Feltregistrering (DCE)", s: "Aktiv", d: "1 uge siden", q: 90, v: "3.parts" },
                { i: <Droplets className="h-4 w-4" />, n: "Vandprøver (lab)", s: "Aktiv", d: "2 uger siden", q: 96, v: "Akkrediteret lab" },
                { i: <ShieldCheck className="h-4 w-4" />, n: "Tredjepartsverifikation", s: "Igangværende", d: "påbegyndt 2026-05-04", q: 92, v: "Bureau Veritas" },
              ].map((r) => (
                <tr key={r.n}>
                  <td className="px-5 py-3"><div className="inline-flex items-center gap-2 font-medium">{r.i} {r.n}</div></td>
                  <td><Pill tone="success">{r.s}</Pill></td>
                  <td className="text-muted-foreground text-xs">{r.d}</td>
                  <td className="pr-3"><DataQualityScore value={r.q} label="" /></td>
                  <td className="text-xs">{r.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader title="Impact-tidslinje" />
          <div className="px-5 pb-5">
            <VerificationTimeline
              steps={[
                { label: "Baseline etableret", date: "2024-09-12", state: "done" },
                { label: "Første feltdata uploadet", date: "2024-11-04", state: "done" },
                { label: "Satellitanalyse fuldført", date: "2025-04-22", state: "done" },
                { label: "Biodiversitetsforbedring detekteret", date: "2025-09-30", state: "done" },
                { label: "Tredjepartsverifikation startet", date: "2026-05-04", state: "current" },
                { label: "Næste planlagte audit", date: "2026-10-02", state: "todo" },
              ]}
            />
          </div>
        </Card>
      </div>

      {/* Documentation panel */}
      <Card>
        <CardHeader
          title="Dokumentation"
          subtitle="Klar til ESG-rapportering, audit og partnere"
          action={
            <div className="flex gap-2">
              <button className="text-sm rounded-lg border px-3 py-1.5 hover:bg-muted inline-flex items-center gap-1.5">
                <Download className="h-4 w-4" /> Eksportér dokumentation
              </button>
              <Link to="/app/ledger" className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5">
                <Send className="h-4 w-4" /> Send til ESG Ledger
              </Link>
            </div>
          }
        />
        <ul className="px-5 pb-5 grid md:grid-cols-2 gap-3 text-sm">
          {[
            "Project fact sheet (PDF · 2.4 MB)",
            "Data methodology v1.3",
            "Verifikationsnotat — Bureau Veritas",
            "ESG-bilag (ESRS E4 / GHG Protocol)",
            "Audit trail extract — FRY-LDG-2087",
          ].map((d) => (
            <li key={d} className="rounded-xl border p-3 flex items-center gap-3">
              <FileText className="h-4 w-4 text-primary" />
              <div className="flex-1">{d}</div>
              <button className="text-xs text-primary hover:underline">Hent</button>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
