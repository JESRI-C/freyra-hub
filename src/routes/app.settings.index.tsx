import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, Field, Select, SavedToast, useSavedToast } from "@/components/settings/Primitives";
import { ORG_PROFILE } from "@/lib/settings-data";
import { Building2, Save, Image, Users, FolderKanban, FileText, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/settings/")({
  head: () => ({ meta: [{ title: "Organisationsprofil — GoFreyra" }] }),
  component: OrgProfilePage,
});

function OrgProfilePage() {
  const [p, setP] = useState(ORG_PROFILE);
  const { saved, trigger } = useSavedToast();
  const update = (k: keyof typeof p) => (v: string) => setP({ ...p, [k]: v });

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl grid place-items-center bg-leaf/30 text-primary"><Building2 className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-semibold">{p.name}</h1>
            <p className="text-xs text-muted-foreground">{p.cvr} · {p.country} · Plan: Professional</p>
          </div>
        </div>
        <button onClick={trigger} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm inline-flex items-center gap-2"><Save className="h-4 w-4" /> Gem ændringer</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Brugere" value="8" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Projekter" value="7" icon={<FolderKanban className="h-5 w-5" />} />
        <StatCard label="Rapporter" value="24" icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Sikkerhed" value="2FA på" icon={<ShieldCheck className="h-5 w-5" />} accent="bg-success/15 text-success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Organisationslogo" subtitle="Bruges på rapporter og deling" className="lg:col-span-1">
          <div className="rounded-2xl border-2 border-dashed bg-muted/30 p-8 text-center">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-leaf grid place-items-center text-leaf-foreground"><Image className="h-7 w-7" /></div>
            <p className="text-sm mt-3 font-medium">Upload logo</p>
            <p className="text-xs text-muted-foreground mt-1">SVG, PNG eller JPG · maks. 2 MB</p>
            <button className="mt-3 text-xs rounded-lg border bg-card px-3 py-1.5">Vælg fil</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border p-2"><div className="text-muted-foreground">Primær farve</div><div className="mt-1 flex items-center gap-2"><span className="h-4 w-4 rounded bg-primary" /> Skov-grøn</div></div>
            <div className="rounded-lg border p-2"><div className="text-muted-foreground">Accent</div><div className="mt-1 flex items-center gap-2"><span className="h-4 w-4 rounded bg-leaf" /> Blad</div></div>
          </div>
        </Section>

        <Section title="Virksomhedsoplysninger" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Organisationsnavn" value={p.name} onChange={update("name")} />
            <Field label="CVR / registreringsnummer" value={p.cvr} onChange={update("cvr")} />
            <Field label="Industri" value={p.industry} onChange={update("industry")} />
            <Select label="Land" value={p.country} options={["Danmark", "Sverige", "Norge", "Tyskland", "Indonesien", "Kenya"]} onChange={update("country")} />
            <Field label="Adresse" value={p.address} onChange={update("address")} />
            <Field label="Telefon" value="+45 70 27 11 80" />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Kontaktpersoner">
          <div className="space-y-3">
            <Field label="Hovedkontakt" value={p.mainContact} onChange={update("mainContact")} />
            <Field label="ESG-ansvarlig" value={p.esgContact} onChange={update("esgContact")} />
            <Field label="Datakontakt" value="Mikkel Holm · mikkel@freyra.io" />
            <Field label="Faktureringskontakt" value="finance@freyra.io" />
          </div>
        </Section>

        <Section title="Rapportering & regulativ kontekst">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Rapporteringsår" value={p.reportingYear} onChange={update("reportingYear")} />
            <Field label="Rapporteringsperiode" value={p.reportingPeriod} onChange={update("reportingPeriod")} />
            <Select label="Standard rapportsprog" value={p.language} options={["Dansk", "Engelsk"]} onChange={update("language")} />
            <Select label="Standardvaluta" value={p.currency} options={["DKK", "EUR", "USD", "SEK", "NOK"]} onChange={update("currency")} />
            <Select label="Tidszone" value={p.timezone} options={["Europe/Copenhagen", "Europe/Stockholm", "UTC"]} onChange={update("timezone")} />
            <Select label="Regulativ kontekst" value="EU — CSRD/ESRS" options={["EU — CSRD/ESRS", "Global — voluntary", "Local — kommune"]} />
          </div>
        </Section>
      </div>

      <Card className="p-5 bg-leaf/5 border-leaf/20">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <div className="text-sm font-semibold">Datatilsyn og -ansvar</div>
            <p className="text-xs text-muted-foreground mt-1">Freyra er databehandler. Din organisation er dataansvarlig. Data lagres i EU (Frankfurt) og er beskyttet af DPA-aftale, kryptering i hvile og under transport, samt audit logging i ESG Ledger.</p>
            <div className="mt-2 flex gap-2"><button className="text-xs rounded-lg border bg-card px-2.5 py-1">Hent DPA</button><button className="text-xs rounded-lg border bg-card px-2.5 py-1">Se sikkerhedsdokument</button></div>
          </div>
        </div>
      </Card>

      <SavedToast show={saved} />
    </main>
  );
}
