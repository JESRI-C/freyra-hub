/**
 * BeregningsgrundlagEditor — fuld redigering af alt det, CO₂ v12-beregningen
 * bygger på: stamdata, arealfordeling (kulstofklasse × anvendelse × buffer),
 * tiltag, vandspejl, tørveandel og afvigelser. Viser live-beregnet krediteret
 * CO₂ mens der redigeres, og persisterer via saveProject + revisionsspor.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, AlertTriangle, CheckCircle2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { saveProject } from "@/services/lavbundService";
import { ledgerAppend } from "@/services/ledgerService";
import { beregnKrediteretCO2, tiltagValidering } from "@/services/lavbundBeregning";
import type {
  Afvigelse,
  Arealanvendelse,
  ArealFordeling,
  Kulstofklasse,
  LavbundsProjekt,
  ProjektStatus,
  Tiltag,
} from "@/types/lavbund";

const KLASSER: Kulstofklasse[] = [">12", "6-12", "<6"];
const ANVENDELSER: Arealanvendelse[] = ["Omdrift", "Permanent græs", "Natur", "Øvrige IMK-arealer"];
const STATUSSER: { value: ProjektStatus; label: string }[] = [
  { value: "planlagt", label: "Planlagt" },
  { value: "etablering", label: "Etablering" },
  { value: "maaling", label: "Under måling" },
  { value: "verificeret", label: "Verificeret" },
  { value: "overdraget", label: "Overdraget" },
];
const TILTAG_LABEL: Record<keyof Tiltag, string> = {
  draenAfbrydes: "Dræn afbrydes",
  groefterTilkastes: "Grøfter tilkastes",
  vandloebsbundHaeves: "Vandløbsbund hæves",
  overrislingszoner: "Overrislingszoner",
  pumpedriftStopper: "Pumpedrift stopper",
};

const inputCls = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm";
const numCls = `${inputCls} text-right tabular-nums`;

function num(v: string, fallback = 0): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function BeregningsgrundlagEditor({ projekt }: { projekt: LavbundsProjekt }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LavbundsProjekt>(() => structuredClone(projekt));
  const [saving, setSaving] = useState(false);

  // Genindlæs kladden når projektet ændrer sig udefra (fx efter gem).
  useEffect(() => {
    setDraft(structuredClone(projekt));
  }, [projekt]);

  const co2 = useMemo(() => beregnKrediteretCO2(draft), [draft]);
  const tilt = useMemo(() => tiltagValidering(draft), [draft]);
  const arealSum = draft.arealFordeling.reduce((s, a) => s + a.hektar, 0);

  const set = <K extends keyof LavbundsProjekt>(key: K, value: LavbundsProjekt[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setRække = (i: number, patch: Partial<ArealFordeling>) =>
    setDraft((d) => ({
      ...d,
      arealFordeling: d.arealFordeling.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));

  const gem = async () => {
    if (!draft.navn.trim()) {
      toast.error("Projektnavn må ikke være tomt.");
      return;
    }
    setSaving(true);
    try {
      await saveProject(draft);
      await ledgerAppend("lavbund", projekt.id, {
        actor: "bruger",
        event: "grundlag_opdateret",
        detail: `Areal ${arealSum.toFixed(2)} ha i ${draft.arealFordeling.length} poster · ${
          Object.values(draft.tiltag).filter(Boolean).length
        } tiltag · krediteret ${co2.krediteretTotal.toFixed(1)} t CO₂e/år`,
      });
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      toast.success("Beregningsgrundlag gemt");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke gemme");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-5 py-3.5 text-sm font-medium hover:bg-muted/30 transition"
      >
        <Pencil className="h-4 w-4 text-primary" />
        Redigér beregningsgrundlag
        <span className="text-xs text-muted-foreground font-normal">
          — arealfordeling, tiltag, vandspejl, afvigelser
        </span>
        {open ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t pt-4">
          {/* ── Stamdata ─────────────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span className="font-medium">Projektnavn</span>
              <input className={inputCls} value={draft.navn} onChange={(e) => set("navn", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Kommune</span>
              <input className={inputCls} value={draft.kommune} onChange={(e) => set("kommune", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Status</span>
              <select
                className={inputCls}
                value={draft.status}
                onChange={(e) => set("status", e.target.value as ProjektStatus)}
              >
                {STATUSSER.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Samlet areal (ha)</span>
              <input
                className={numCls}
                inputMode="decimal"
                value={String(draft.samletArealHa)}
                onChange={(e) => set("samletArealHa", num(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Tørveandel (0-1)</span>
              <input
                className={numCls}
                inputMode="decimal"
                value={String(draft.torvAndel ?? 1)}
                onChange={(e) => set("torvAndel", Math.min(1, Math.max(0, num(e.target.value, 1))))}
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Vandspejl FØR (m under terræn)</span>
              <input
                className={numCls}
                inputMode="decimal"
                value={String(draft.vandspejlFoerM)}
                onChange={(e) => set("vandspejlFoerM", num(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Etableringsdato (vådlægning gennemført)</span>
              <input
                type="date"
                className={inputCls}
                value={draft.etableringsdato?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  set("etableringsdato", e.target.value ? e.target.value : undefined)
                }
              />
              <span className="block text-[10px] text-muted-foreground">
                Målinger før datoen er baseline og tæller ikke i verifikationsgraden.
              </span>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Publiceret ex-ante (t/ha, valgfri)</span>
              <input
                className={numCls}
                inputMode="decimal"
                value={draft.publiceretExAnteTonPrHa != null ? String(draft.publiceretExAnteTonPrHa) : ""}
                placeholder="—"
                onChange={(e) =>
                  set(
                    "publiceretExAnteTonPrHa",
                    e.target.value.trim() === "" ? undefined : num(e.target.value),
                  )
                }
              />
            </label>
          </div>

          {/* ── Tiltag ───────────────────────────────────────────────────── */}
          <div>
            <div className="text-xs font-semibold mb-2">Hydrologiske tiltag (metoden kræver aktiv udtagning)</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TILTAG_LABEL) as (keyof Tiltag)[]).map((k) => (
                <label
                  key={k}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border cursor-pointer transition ${
                    draft.tiltag[k]
                      ? "bg-success/10 border-success/40 text-success"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={draft.tiltag[k]}
                    onChange={(e) => set("tiltag", { ...draft.tiltag, [k]: e.target.checked })}
                  />
                  {TILTAG_LABEL[k]}
                </label>
              ))}
            </div>
            {!tilt.ok && (
              <div className="mt-2 text-xs text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {tilt.besked}
              </div>
            )}
          </div>

          {/* ── Arealfordeling ───────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold">
                Arealfordeling — kulstofklasse × anvendelse (v12-faktorer)
              </div>
              <button
                type="button"
                onClick={() =>
                  set("arealFordeling", [
                    ...draft.arealFordeling,
                    { kulstofklasse: ">12", arealanvendelse: "Permanent græs", buffer: false, hektar: 0 },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs rounded-lg border px-2.5 py-1 hover:bg-muted/40"
              >
                <Plus className="h-3.5 w-3.5" /> Tilføj post
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-1.5 pr-2 font-medium">Kulstofklasse (% C)</th>
                    <th className="text-left py-1.5 pr-2 font-medium">Arealanvendelse</th>
                    <th className="text-center py-1.5 pr-2 font-medium">Bufferzone (halv effekt)</th>
                    <th className="text-right py-1.5 pr-2 font-medium">Hektar</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {draft.arealFordeling.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">
                        <select
                          className={inputCls}
                          value={r.kulstofklasse}
                          onChange={(e) => setRække(i, { kulstofklasse: e.target.value as Kulstofklasse })}
                        >
                          {KLASSER.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          className={inputCls}
                          value={r.arealanvendelse}
                          onChange={(e) => setRække(i, { arealanvendelse: e.target.value as Arealanvendelse })}
                        >
                          {ANVENDELSER.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2 text-center">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={r.buffer}
                          onChange={(e) => setRække(i, { buffer: e.target.checked })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          className={numCls}
                          inputMode="decimal"
                          value={String(r.hektar)}
                          onChange={(e) => setRække(i, { hektar: num(e.target.value) })}
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            set("arealFordeling", draft.arealFordeling.filter((_, j) => j !== i))
                          }
                          className="text-destructive/70 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span>
                Sum: <strong className="tabular-nums">{arealSum.toFixed(2)} ha</strong> af{" "}
                {draft.samletArealHa.toFixed(2)} ha
              </span>
              {co2.arealTjek === "ok" ? (
                <Pill tone="success"><CheckCircle2 className="h-3 w-3" /> Arealtjek OK</Pill>
              ) : (
                <Pill tone="danger"><AlertTriangle className="h-3 w-3" /> Afstem arealfordeling (±0,05 ha)</Pill>
              )}
              <span className="ml-auto">
                Live-beregnet krediteret:{" "}
                <strong className="text-primary tabular-nums">
                  {co2.krediteretTotal.toLocaleString("da-DK", { maximumFractionDigits: 1 })} t CO₂e/år
                </strong>{" "}
                ({co2.krediteretTonPrHa.toFixed(1)} t/ha)
              </span>
            </div>
          </div>

          {/* ── Afvigelser ───────────────────────────────────────────────── */}
          <AfvigelsesEditor
            afvigelser={draft.afvigelser}
            onChange={(a) => set("afvigelser", a)}
          />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDraft(structuredClone(projekt))}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/40"
            >
              Nulstil
            </button>
            <button
              type="button"
              onClick={gem}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? "Gemmer…" : "Gem grundlag"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AfvigelsesEditor({
  afvigelser,
  onChange,
}: {
  afvigelser: Afvigelse[];
  onChange: (a: Afvigelse[]) => void;
}) {
  const [beskrivelse, setBeskrivelse] = useState("");
  const [handling, setHandling] = useState("");

  const tilfoej = () => {
    if (!beskrivelse.trim()) return;
    onChange([
      ...afvigelser,
      {
        id: `afv-${afvigelser.length + 1}-${beskrivelse.trim().slice(0, 12).replace(/\s+/g, "-")}`,
        beskrivelse: beskrivelse.trim(),
        korrigerendeHandling: handling.trim() || "Afventer korrigerende handling",
        aaben: true,
      },
    ]);
    setBeskrivelse("");
    setHandling("");
  };

  return (
    <div>
      <div className="text-xs font-semibold mb-2">
        Afvigelser <span className="font-normal text-muted-foreground">— åbne afvigelser reducerer verificeret effekt</span>
      </div>
      <div className="space-y-1.5">
        {afvigelser.map((a, i) => (
          <div key={a.id} className="flex items-start gap-2 rounded-lg border p-2 text-xs">
            <Pill tone={a.aaben ? "warning" : "success"}>{a.aaben ? "Åben" : "Lukket"}</Pill>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{a.beskrivelse}</div>
              <div className="text-muted-foreground">{a.korrigerendeHandling}</div>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange(afvigelser.map((x, j) => (j === i ? { ...x, aaben: !x.aaben } : x)))
              }
              className="rounded-md border px-2 py-1 hover:bg-muted/40 shrink-0"
            >
              {a.aaben ? "Luk" : "Genåbn"}
            </button>
            <button
              type="button"
              onClick={() => onChange(afvigelser.filter((_, j) => j !== i))}
              className="text-destructive/70 hover:text-destructive shrink-0 mt-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {afvigelser.length === 0 && (
          <div className="text-xs text-muted-foreground">Ingen afvigelser registreret.</div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className={`${inputCls} flex-1 min-w-[180px]`}
          placeholder="Beskrivelse af afvigelse…"
          value={beskrivelse}
          onChange={(e) => setBeskrivelse(e.target.value)}
        />
        <input
          className={`${inputCls} flex-1 min-w-[180px]`}
          placeholder="Korrigerende handling…"
          value={handling}
          onChange={(e) => setHandling(e.target.value)}
        />
        <button
          type="button"
          onClick={tilfoej}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted/40"
        >
          <Plus className="h-3.5 w-3.5" /> Tilføj
        </button>
      </div>
    </div>
  );
}
