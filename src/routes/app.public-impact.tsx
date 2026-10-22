import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe, ArrowRight, Eye, Image as ImageIcon, FileText } from "lucide-react";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";

export const Route = createFileRoute("/app/public-impact")({
  head: () => ({ meta: [{ title: "Public impact — GoFreyra" }] }),
  component: PublicImpactPage,
});

const PUBLIC_PAGES = [
  {
    slug: "skallebaek-biodiversity-pilot",
    name: "Skallebæk Wetland & Biodiversity",
    status: "Publiceret",
    tone: "success" as const,
    visitors: "1.284 sidste 30 dage",
    last: "Opdateret 12. maj",
  },
  {
    slug: "regenerative-farm-pilot",
    name: "Regenerative Farm Pilot",
    status: "Udkast",
    tone: "warning" as const,
    visitors: "—",
    last: "Mangler hero-billede + lodsejer-citat",
  },
  {
    slug: "stream-restoration-edna",
    name: "Stream Restoration · eDNA",
    status: "Publiceret",
    tone: "success" as const,
    visitors: "412 sidste 30 dage",
    last: "Opdateret 28. april",
  },
];

function PublicImpactPage() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Public impact"
        description="Offentlige projektsider, der kommunikerer naturarbejdet med dokumenteret metode og evidens."
      />

      <Card className="p-5 bg-leaf/10 border-leaf/30">
        <div className="inline-flex items-center gap-1.5 mb-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Offentlig dokumentation
          </span>
        </div>
        <p className="text-sm leading-relaxed text-foreground/85 max-w-3xl">
          Hver naturprojekt-side kan publiceres offentligt med metodevalg, datakilder, billeder,
          lodsejer-citater og fremdrift — så kommuner, fonde og borgere kan se det reelle arbejde.
        </p>
      </Card>

      <Card>
        <CardHeader title="Projektsider" subtitle="Publicerede og igangværende public impact-sider" />
        <div className="px-5 pb-5 grid md:grid-cols-3 gap-3">
          {PUBLIC_PAGES.map((p) => (
            <div key={p.slug} className="rounded-xl border p-4 bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-sm">{p.name}</div>
                <Pill tone={p.tone}>{p.status}</Pill>
              </div>
              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <Eye className="h-3 w-3" /> {p.visitors}
              </div>
              <div className="text-xs text-muted-foreground mt-2">{p.last}</div>
              <div className="flex gap-2 mt-4">
                <Link
                  to="/app/projects/$slug"
                  params={{ slug: p.slug }}
                  className="text-xs rounded-lg border px-2.5 py-1.5 hover:bg-muted inline-flex items-center gap-1"
                >
                  Åbn projekt <ArrowRight className="h-3 w-3" />
                </Link>
                <button className="text-xs rounded-lg bg-primary text-primary-foreground px-2.5 py-1.5 inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> Rediger side
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="inline-flex items-center gap-2 font-semibold text-sm">
            <FileText className="h-4 w-4 text-primary" /> Skabeloner
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Standardlayouts til vådområde, skov, landbrug og vandløb. Genbruges på tværs af projekter.
          </p>
          <Link
            to="/app/reports"
            className="text-xs inline-flex items-center gap-1 text-primary mt-3 hover:underline"
          >
            Gå til Report Engine <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
        <Card className="p-5">
          <div className="inline-flex items-center gap-2 font-semibold text-sm">
            <Globe className="h-4 w-4 text-primary" /> Distribution
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Offentlige links, QR-koder til lodsejer-aftaler og embed til kommunale hjemmesider.
          </p>
        </Card>
      </div>
    </main>
  );
}
