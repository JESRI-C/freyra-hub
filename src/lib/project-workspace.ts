import { z } from "zod";

export const entryKinds = [
  "scenario",
  "stakeholder",
  "decision_note",
  "esrs",
  "co2_entry",
  "funding",
  "partner",
  "public_page",
] as const;
export type EntryKind = (typeof entryKinds)[number];
export type EntryField = {
  key: string;
  label: string;
  type?: "number" | "date" | "textarea";
  options?: string[];
  required?: boolean;
};
export const entryDefinitions: Record<
  EntryKind,
  { label: string; description: string; fields: EntryField[] }
> = {
  scenario: {
    label: "Scenarie",
    description:
      "Sammenlign registrerede forudsætninger. Beregnede effekter kræver en dokumenteret model; felterne er planforudsætninger.",
    fields: [
      { key: "horizon", label: "Tidshorisont (måneder)", type: "number" },
      {
        key: "focus",
        label: "Fokus",
        options: ["CO₂", "Biodiversitet", "Vand", "ESG", "Datakvalitet"],
      },
      { key: "investment", label: "Investeringsniveau", options: ["Lav", "Medium", "Høj"] },
      { key: "assumptions", label: "Forudsætninger og metode", type: "textarea", required: true },
      { key: "expectedEffect", label: "Forventet effekt og enhed" },
      { key: "source", label: "Kilde / dokumentreference", required: true },
    ],
  },
  stakeholder: {
    label: "Lodsejer og interessent",
    description: "Registrér aftalegrundlag og afklaringer på den valgte sag.",
    fields: [
      { key: "role", label: "Rolle" },
      { key: "area", label: "Areal / matrikel" },
      {
        key: "status",
        label: "Aftalestatus",
        options: ["Uafklaret", "Dialog", "Aftaleudkast", "Aftale dokumenteret"],
      },
      { key: "owner", label: "Ansvarlig" },
      { key: "source", label: "Dokumentreference" },
      { key: "notes", label: "Afklaringer", type: "textarea" },
    ],
  },
  decision_note: {
    label: "Beslutningsnotat",
    description:
      "Gem beslutningsgrundlag med alternativer, usikkerhed og ansvar. Et notat er ikke en faglig godkendelse.",
    fields: [
      { key: "basis", label: "Beslutningsgrundlag", type: "textarea", required: true },
      { key: "alternatives", label: "Alternativer", type: "textarea" },
      { key: "decision", label: "Beslutning og begrundelse", type: "textarea" },
      { key: "uncertainty", label: "Usikkerheder", type: "textarea" },
      { key: "owner", label: "Ansvarlig" },
      { key: "source", label: "Kilde / rapportversion", required: true },
    ],
  },
  esrs: {
    label: "ESRS-datapunkt",
    description:
      "Registrér konkrete datapunkter og dokumentation. Dækning kan kun vurderes i forhold til de registrerede krav.",
    fields: [
      { key: "code", label: "ESRS-kode", required: true },
      {
        key: "status",
        label: "Dokumentationsstatus",
        options: ["Mangler", "Delvis", "Dokumenteret"],
      },
      { key: "owner", label: "Ansvarlig" },
      { key: "source", label: "Kilde / bilag" },
      { key: "notes", label: "Metode og afgrænsning", type: "textarea", required: true },
    ],
  },
  co2_entry: {
    label: "CO₂-post",
    description:
      "Registrér en afgrænset post med metode og periode. Brutto, reduktion og binding må ikke summeres på tværs uden samme afgrænsning.",
    fields: [
      { key: "category", label: "Type", options: ["Udledning", "Reduktion", "Binding"] },
      { key: "quantity", label: "Mængde (t CO₂e)", type: "number", required: true },
      { key: "period", label: "Periode", required: true },
      { key: "boundary", label: "Afgrænsning / scope", required: true },
      { key: "method", label: "Beregningsmetode og faktorversion", required: true },
      { key: "source", label: "Datakilde", required: true },
    ],
  },
  funding: {
    label: "Finansiering",
    description:
      "Registrér finansiering på projektet. Beløb er registreringer; de udsteder eller sælger ikke credits.",
    fields: [
      { key: "organization", label: "Fond / finansieringskilde", required: true },
      { key: "amount", label: "Beløb (DKK)", type: "number" },
      {
        key: "status",
        label: "Status",
        options: ["Mulighed", "Ansøgt", "Tilsagn dokumenteret", "Modtaget"],
      },
      { key: "deadline", label: "Frist", type: "date" },
      { key: "source", label: "Dokumentreference" },
      { key: "notes", label: "Betingelser", type: "textarea" },
    ],
  },
  partner: {
    label: "Partner eller fond",
    description: "Gem sagens samarbejdspartnere og deres dokumenterede rolle.",
    fields: [
      {
        key: "type",
        label: "Type",
        options: ["Kommune", "Privat virksomhed", "Lodsejer", "Fond", "Rådgiver", "Anden"],
      },
      { key: "role", label: "Rolle på projektet", required: true },
      { key: "contact", label: "Kontakt" },
      { key: "source", label: "Aftale / kilde" },
      { key: "notes", label: "Bemærkninger", type: "textarea" },
    ],
  },
  public_page: {
    label: "Offentlig side — kladde",
    description:
      "Forbered projektets offentlige formidling. Gemte kladder offentliggøres ikke automatisk.",
    fields: [
      { key: "summary", label: "Introduktion", type: "textarea", required: true },
      { key: "results", label: "Dokumenterede resultater", type: "textarea" },
      { key: "limitations", label: "Begrænsninger", type: "textarea", required: true },
      { key: "source", label: "Rapportversion / kilde", required: true },
    ],
  },
};
export const WorkspaceEntrySchema = z.object({
  id: z.string().uuid(),
  entry_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  project_id: z.string().uuid(),
  kind: z.enum(entryKinds),
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  payload: z.record(z.string(), z.string().max(10000)),
  created_by: z.string().uuid(),
  created_at: z.string(),
});
export type WorkspaceEntry = z.infer<typeof WorkspaceEntrySchema>;
export function validateEntry(kind: EntryKind, title: string, payload: Record<string, string>) {
  if (!title.trim() || title.length > 200) throw new Error("Angiv en titel på højst 200 tegn.");
  const fields = entryDefinitions[kind].fields;
  if (Object.keys(payload).some((key) => !fields.some((f) => f.key === key)))
    throw new Error("Ukendt felt.");
  for (const field of fields) {
    const value = payload[field.key] ?? "";
    if (value.length > 10000 || (field.required && !value.trim()))
      throw new Error(`Udfyld ${field.label}.`);
    if (value && field.options && !field.options.includes(value))
      throw new Error(`Ugyldigt valg: ${field.label}.`);
    if (
      value &&
      field.type === "number" &&
      (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))
    )
      throw new Error(`Angiv et ikke-negativt tal: ${field.label}.`);
    if (value && field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Ugyldig dato.");
  }
}
export function latestEntries(rows: WorkspaceEntry[]) {
  const latest = new Map<string, WorkspaceEntry>();
  for (const row of rows)
    if (!latest.has(row.entry_id) || latest.get(row.entry_id)!.version < row.version)
      latest.set(row.entry_id, row);
  return [...latest.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
