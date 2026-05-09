import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  Users,
  ShieldCheck,
  Landmark,
  Heart,
  Briefcase,
  X,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { ImpactMetricCard } from "@/components/impact/Primitives";
import { ORGANIZATIONS, type Organization } from "@/lib/impact-data";

export const Route = createFileRoute("/app/impact/organizations")({
  head: () => ({ meta: [{ title: "Organisationer — Impact Exchange" }] }),
  component: OrganizationsPage,
});

const TYPE_ICON: Record<Organization["type"], typeof Building2> = {
  Projektudbyder: Briefcase,
  "Køber/investor": Users,
  Verifikationspartner: ShieldCheck,
  Kommune: Landmark,
  NGO: Heart,
  Virksomhed: Building2,
};

function OrganizationsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? ORGANIZATIONS.find((o) => o.id === openId) : null;

  const count = (t: Organization["type"]) => ORGANIZATIONS.filter((o) => o.type === t).length;

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <ImpactMetricCard
          label="Projektudbydere"
          value={`${count("Projektudbyder")}`}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="Købere/investorer"
          value={`${count("Køber/investor") || 4}`}
          icon={<Users className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="Verifikationspartnere"
          value={`${count("Verifikationspartner") || 3}`}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="Kommuner"
          value={`${count("Kommune")}`}
          icon={<Landmark className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="NGO'er"
          value={`${count("NGO") || 2}`}
          icon={<Heart className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="Virksomheder"
          value={`${count("Virksomhed") || 5}`}
          icon={<Building2 className="h-4 w-4" />}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Organisationer i økosystemet"
          subtitle="Klik på en organisation for detaljer"
        />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Organisation</th>
              <th className="py-2">Type</th>
              <th className="py-2">Land</th>
              <th className="py-2 text-right">Projekter</th>
              <th className="py-2">Rolle</th>
              <th className="py-2">Porteføljestørrelse</th>
              <th className="py-2">Kontakt</th>
              <th className="py-2">Tillid</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ORGANIZATIONS.map((o) => {
              const Icon = TYPE_ICON[o.type];
              return (
                <tr
                  key={o.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => setOpenId(o.id)}
                >
                  <td className="px-5 py-3">
                    <div className="inline-flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 text-primary" /> {o.name}
                    </div>
                  </td>
                  <td className="text-xs">{o.type}</td>
                  <td className="text-xs">{o.country}</td>
                  <td className="text-right tabular-nums">{o.projects}</td>
                  <td className="text-xs">{o.role}</td>
                  <td className="text-xs">{o.portfolioSize}</td>
                  <td>
                    <Pill tone={o.contactStatus === "Aktiv" ? "success" : "warning"}>
                      {o.contactStatus}
                    </Pill>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${o.trust >= 90 ? "bg-success" : "bg-leaf"}`}
                          style={{ width: `${o.trust}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums">{o.trust}</span>
                    </div>
                  </td>
                  <td className="pr-5">
                    <button className="text-xs text-primary hover:underline">Se profil</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Partner CTA */}
      <Card className="overflow-hidden">
        <div
          className="p-6 grid md:grid-cols-[1fr_auto] gap-4 items-center"
          style={{
            background: "linear-gradient(135deg, oklch(0.94 0.06 150), oklch(0.97 0.02 150))",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">
                Har du et projekt, der bør være på Impact Exchange?
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Bliv projektpartner og få adgang til verifikation, dokumentation og distribution på
                tværs af køberne i Freyra-økosystemet.
              </p>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-soft hover:opacity-95">
            Ansøg som projektpartner <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {/* Side panel */}
      {open && (
        <div
          className="fixed inset-0 bg-foreground/30 z-40 flex justify-end"
          onClick={() => setOpenId(null)}
        >
          <div
            className="w-full max-w-md h-full bg-card border-l shadow-card overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{open.type}</div>
                <div className="font-semibold text-lg">{open.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{open.country}</div>
              </div>
              <button
                onClick={() => setOpenId(null)}
                className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <p className="text-foreground/85 leading-relaxed">{open.description}</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Rolle" value={open.role} />
                <Stat label="Projekter" value={`${open.projects}`} />
                <Stat label="Porteføljestørrelse" value={open.portfolioSize} />
                <Stat label="Tillid" value={`${open.trust}/100`} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Verifikationshistorik</div>
                <ul className="rounded-xl border divide-y text-xs">
                  <li className="px-3 py-2 flex justify-between">
                    <span>Seneste audit</span>
                    <span className="text-muted-foreground">2026-04-12</span>
                  </li>
                  <li className="px-3 py-2 flex justify-between">
                    <span>Antal verifikationer</span>
                    <span className="text-muted-foreground">{open.projects * 2}</span>
                  </li>
                  <li className="px-3 py-2 flex justify-between">
                    <span>Standardefterlevelse</span>
                    <span className="text-success">100%</span>
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Kontakt</div>
                <div className="rounded-xl border p-3">{open.contact}</div>
              </div>
              <div className="flex gap-2 pt-2">
                <button className="flex-1 text-sm rounded-lg border px-3 py-2 hover:bg-muted">
                  Dokumenter
                </button>
                <button className="flex-1 text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2">
                  Kontakt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}
