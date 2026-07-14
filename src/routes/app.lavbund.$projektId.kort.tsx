import { createFileRoute } from "@tanstack/react-router";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Info, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  getMaalepunkter,
  getProject,
  getReadings,
  saveReading,
  saveMaalepunkt,
  getLinkedProjectId,
} from "@/services/lavbundService";
import { getProjectById } from "@/services/projects-service";
import { ledgerAppend } from "@/services/ledgerService";
import { normalizeHoboPayload } from "@/services/lavbundSmartConnect";
import { AFVANDINGSKLASSER } from "@/data/lavbundFaktorer";
import { LavbundFeltkort, KLASSE_FARVE } from "@/components/lavbund/LavbundFeltkort";
import { KULSTOF2022_WMS } from "@/data/kulstof2022";
import { TidsserieChart } from "@/components/lavbund/TidsserieChart";
import type { Maalepunkt, Opmaalingsintensitet } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId/kort")({
  head: () => ({ meta: [{ title: "Feltkort & tidsserie — LavbundsMRV" }] }),
  component: KortPage,
});

const INTENSITETER: { id: Opmaalingsintensitet; label: string; feltdage: number }[] = [
  { id: "minimal", label: "Minimal", feltdage: 4 },
  { id: "standard", label: "Standard", feltdage: 12 },
  { id: "intensiv", label: "Intensiv", feltdage: 26 },
];

/** Fallback-centrum når hverken målepunkter eller koblet projekt har geodata. */
const DK_CENTER = { lat: 55.494, lng: 9.472 };

function KortPage() {
  const { projektId } = Route.useParams();
  const [intensitet, setIntensitet] = useState<Opmaalingsintensitet>("standard");
  const [placing, setPlacing] = useState(false);
  const [visKulstof, setVisKulstof] = useState(false);
  const qc = useQueryClient();

  const [projekt, maalepunkter, readings, linkedGeo] = useQueries({
    queries: [
      { queryKey: ["lavbund", "project", projektId], queryFn: () => getProject(projektId) },
      { queryKey: ["lavbund", "mp", projektId], queryFn: () => getMaalepunkter(projektId) },
      { queryKey: ["lavbund", "readings", projektId], queryFn: () => getReadings(projektId) },
      {
        queryKey: ["lavbund", "linked-geo", projektId],
        queryFn: async () => {
          // Geometri fra det koblede kerneprojekt: centrum + polygon til kortet.
          const linkedId = await getLinkedProjectId(projektId);
          if (!linkedId) return null;
          const core = await getProjectById(linkedId).catch(() => null);
          if (!core) return null;
          return {
            center:
              core.geometry_centroid_lat != null && core.geometry_centroid_lng != null
                ? { lat: core.geometry_centroid_lat, lng: core.geometry_centroid_lng }
                : null,
            polygon: (core.geometry_polygon ?? null) as {
              type: "Polygon";
              coordinates: number[][][];
            } | null,
          };
        },
      },
    ],
  });

  const mapCenter = useMemo(() => {
    const medGeo = (maalepunkter.data ?? []).find((m) => m.lat != null && m.lng != null);
    if (medGeo?.lat != null && medGeo.lng != null) return { lat: medGeo.lat, lng: medGeo.lng };
    return linkedGeo.data?.center ?? DK_CENTER;
  }, [maalepunkter.data, linkedGeo.data]);

  const placerMaalepunkt = async (pos: { lat: number; lng: number }) => {
    setPlacing(false);
    try {
      const n = (maalepunkter.data ?? []).length;
      const mp: Maalepunkt = {
        id: `MP-${String(n + 1).padStart(2, "0")}-${projektId.slice(0, 4)}`,
        projektId,
        type: "markpejling",
        position: { x: 10 + (n % 8) * 11, y: 12 + Math.floor(n / 8) * 14 },
        lat: pos.lat,
        lng: pos.lng,
        intensiteter: ["minimal", "standard", "intensiv"],
      };
      await saveMaalepunkt(mp);
      await ledgerAppend("lavbund", projektId, {
        actor: "bruger",
        event: "maalepunkt_placeret",
        detail: `${mp.id} placeret på ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
      });
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      toast.success(`Målepunkt ${mp.id} placeret på kortet`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke placere målepunkt");
    }
  };

  const isLoading = projekt.isLoading || maalepunkter.isLoading || readings.isLoading;
  const isError = projekt.isError || maalepunkter.isError || readings.isError;

  const filteredMp = useMemo(
    () => (maalepunkter.data ?? []).filter((m) => m.intensiteter.includes(intensitet)),
    [maalepunkter.data, intensitet],
  );

  // Seneste måling pr. målepunkt
  const senesteDybde = useMemo(() => {
    const map = new Map<string, number>();
    for (const mp of filteredMp) {
      const rs = (readings.data ?? [])
        .filter((r) => r.maalepunktId === mp.id)
        .sort((a, b) => a.tidspunkt.localeCompare(b.tidspunkt));
      const last = rs[rs.length - 1];
      if (last) map.set(mp.id, last.dybdeM);
    }
    return map;
  }, [filteredMp, readings.data]);

  // Tidsseriemiddel pr. måned
  const tidsserie = useMemo(() => {
    const buckets = new Map<string, { sum: number; n: number }>();
    for (const r of readings.data ?? []) {
      const key = r.tidspunkt.slice(0, 7);
      const b = buckets.get(key) ?? { sum: 0, n: 0 };
      b.sum += r.dybdeM;
      b.n += 1;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ maaned: k, dybde: v.sum / v.n }));
  }, [readings.data]);

  const stats = useMemo(() => {
    // Middelværdier opgøres kun over efter-perioden når etableringsdato er
    // sat — baseline-måneder (førtilstand) må ikke trække tallene skævt i
    // forhold til verifikationsgraden og rapportens efter-middel.
    const etabMaaned = projekt.data?.etableringsdato?.slice(0, 7);
    const grundlag = etabMaaned ? tidsserie.filter((t) => t.maaned >= etabMaaned) : tidsserie;
    if (grundlag.length === 0) return null;
    const avg = (a: { dybde: number }[]) =>
      a.length ? a.reduce((s, x) => s + x.dybde, 0) / a.length : 0;
    const sommer = grundlag.filter((t) => {
      const m = Number(t.maaned.slice(5, 7));
      return m >= 5 && m <= 9;
    });
    const vinter = grundlag.filter((t) => {
      const m = Number(t.maaned.slice(5, 7));
      return m === 11 || m === 12 || m === 1 || m === 2 || m === 3;
    });
    return {
      aar: avg(grundlag),
      sommer: avg(sommer),
      vinter: avg(vinter),
      efterEtablering: Boolean(etabMaaned && grundlag.length < tidsserie.length),
    };
  }, [tidsserie, projekt.data?.etableringsdato]);

  if (isError)
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-destructive">Kunne ikke hente feltdata.</Card>
      </div>
    );
  if (isLoading)
    return (
      <div className="p-6 space-y-3">
        <Card className="p-6 h-72 animate-pulse">
          <span />
        </Card>
        <Card className="p-6 h-40 animate-pulse">
          <span />
        </Card>
      </div>
    );

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <Card>
        <CardHeader
          title="Feltkort — vandspejl efter afvandingsklasse"
          subtitle="Nearest-neighbour-interpolation af målepunkternes seneste dybde til vandspejl."
          action={
            <div className="flex items-center gap-1.5">
              {INTENSITETER.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setIntensitet(i.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    intensitet === i.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-muted/40"
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="px-5 pb-4 flex flex-wrap gap-3 items-center text-xs text-muted-foreground">
          <span>
            {filteredMp.length} målepunkter · estimeret feltbehov{" "}
            <strong className="text-foreground">
              {INTENSITETER.find((i) => i.id === intensitet)?.feltdage} dage/år
            </strong>
          </span>
          <span className="inline-flex items-center gap-1 italic">
            <Info className="h-3 w-3" /> Registrér manuel pejling eller importér
            HOBO-logger-CSV nedenfor
          </span>
        </div>
        <div className="px-5 pb-4 space-y-2">
          <PejlingsForm
            projektId={projektId}
            maalepunkter={maalepunkter.data ?? []}
          />
          <HoboImport
            projektId={projektId}
            maalepunkter={maalepunkter.data ?? []}
          />
        </div>
        <div className="px-5 pb-5">
          <LavbundFeltkort
            maalepunkter={filteredMp}
            senesteDybde={senesteDybde}
            center={mapCenter}
            polygon={linkedGeo.data?.polygon ?? null}
            placing={placing}
            onPlace={placerMaalepunkt}
            height={440}
            wmsOverlay={visKulstof ? KULSTOF2022_WMS : null}
          />
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border cursor-pointer hover:bg-muted/40">
              <input
                type="checkbox"
                checked={visKulstof}
                onChange={(e) => setVisKulstof(e.target.checked)}
                className="h-3 w-3 accent-primary"
              />
              {KULSTOF2022_WMS.label}
            </label>
            {AFVANDINGSKLASSER.map((k) => (
              <span
                key={k.navn}
                className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: KLASSE_FARVE[k.navn] }}
                />
                {k.navn}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setPlacing((p) => !p)}
              className={`ml-auto inline-flex items-center gap-1.5 text-xs rounded-lg border px-3 py-1.5 transition ${
                placing
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted/40"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              {placing ? "Annullér placering" : "Placér nyt målepunkt på kortet"}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Tidsserie — dybde til vandspejl (24 mdr.)"
          subtitle="HOBO-logger 15-min serier + periodiske markpejlinger. Grænsen for Våd eng: 0,50 m."
        />
        <div className="px-5 pb-5">
          <TidsserieChart serie={tidsserie} height={260} etableringMaaned={projekt.data?.etableringsdato?.slice(0, 7)} />
          {stats && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <StatBoks label="Årsmiddel" value={`${stats.aar.toFixed(2)} m`} />
                <StatBoks label="Sommermiddel (maj–sep)" value={`${stats.sommer.toFixed(2)} m`} />
                <StatBoks label="Vintermiddel (nov–mar)" value={`${stats.vinter.toFixed(2)} m`} />
              </div>
              {stats.efterEtablering && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Middelværdier er opgjort efter etableringsdatoen — baseline-måneder (skraveret
                  i grafen) indgår ikke.
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      {filteredMp.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ingen målepunkter i valgt intensitet.
        </Card>
      )}
    </main>
  );
}

function StatBoks({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

// ─── Manuel pejling + nyt målepunkt ────────────────────────────────────────────

function PejlingsForm({
  projektId,
  maalepunkter,
}: {
  projektId: string;
  maalepunkter: Maalepunkt[];
}) {
  const qc = useQueryClient();
  const [mpId, setMpId] = useState("");
  const [dybdeCm, setDybdeCm] = useState("");
  const [saving, setSaving] = useState(false);

  const registrer = async (e: React.FormEvent) => {
    e.preventDefault();
    const dybde = Number(dybdeCm.replace(",", "."));
    if (!mpId || !Number.isFinite(dybde)) {
      toast.error("Vælg målepunkt og angiv dybde i cm.");
      return;
    }
    setSaving(true);
    try {
      await saveReading(projektId, {
        maalepunktId: mpId,
        tidspunkt: new Date().toISOString(),
        dybdeM: Math.round(dybde) / 100,
        kilde: "manuel_pejling",
      });
      await ledgerAppend("lavbund", projektId, {
        actor: "bruger",
        event: "pejling_registreret",
        detail: `Målepunkt ${mpId}: ${dybde} cm under terræn`,
      });
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      setDybdeCm("");
      toast.success("Pejling registreret");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke gemme pejling");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={registrer}
      className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/20 p-3"
    >
      <label className="text-xs space-y-1">
        <span className="font-medium">Målepunkt</span>
        <select
          value={mpId}
          onChange={(e) => setMpId(e.target.value)}
          className="block rounded-lg border bg-background px-2.5 py-1.5 text-sm min-w-[160px]"
        >
          <option value="">Vælg…</option>
          {maalepunkter.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} ({m.type === "kanal_logger" ? "logger" : "pejling"})
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs space-y-1">
        <span className="font-medium">Dybde under terræn (cm)</span>
        <input
          value={dybdeCm}
          onChange={(e) => setDybdeCm(e.target.value)}
          inputMode="decimal"
          placeholder="Fx 35"
          className="block rounded-lg border bg-background px-2.5 py-1.5 text-sm w-32"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-primary text-primary-foreground px-3.5 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Gemmer…" : "Registrér pejling"}
      </button>
    </form>
  );
}

// ─── HOBO-logger CSV-import (Smart Connect) ───────────────────────────────────
//
// CSV-format: tidsstempel;dybde_cm (eller komma-separeret) — én række pr.
// måling. Normaliseres via Smart Connect-adapteren og gemmes som
// hobo_logger-readings på det valgte målepunkt.

export function HoboImport({
  projektId,
  maalepunkter,
}: {
  projektId: string;
  maalepunkter: Maalepunkt[];
}) {
  const qc = useQueryClient();
  const [mpId, setMpId] = useState("");
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    if (!mpId) {
      toast.error("Vælg målepunkt før import.");
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const samples = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^[a-zA-Z#]/.test(line)) // skip header/kommentarer
        .map((line) => {
          const [t, v] = line.split(/[;,\t]/).map((s) => s?.trim());
          return { t: t ?? "", waterDepthCm: Number((v ?? "").replace(",", ".")) };
        });
      const result = normalizeHoboPayload({ serial: file.name, maalepunktId: mpId, samples });
      if (result.readings.length === 0) {
        toast.error(
          `Ingen gyldige målinger i filen${result.fejl.length ? ` (${result.fejl[0]})` : ""}.`,
        );
        return;
      }
      for (const r of result.readings) {
        await saveReading(projektId, r);
      }
      await ledgerAppend("lavbund", projektId, {
        actor: "bruger",
        event: "hobo_import",
        detail: `${result.readings.length} logger-målinger importeret til ${mpId} (${file.name})${
          result.fejl.length ? ` · ${result.fejl.length} rækker afvist` : ""
        }`,
      });
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      toast.success(
        `${result.readings.length} målinger importeret${
          result.fejl.length ? ` · ${result.fejl.length} afvist` : ""
        }`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import fejlede");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/20 p-3">
      <label className="text-xs space-y-1">
        <span className="font-medium">HOBO-logger CSV → målepunkt</span>
        <select
          value={mpId}
          onChange={(e) => setMpId(e.target.value)}
          className="block rounded-lg border bg-background px-2.5 py-1.5 text-sm min-w-[160px]"
        >
          <option value="">Vælg…</option>
          {maalepunkter.map((m) => (
            <option key={m.id} value={m.id}>{m.id}</option>
          ))}
        </select>
      </label>
      <label
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40 ${
          importing ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
        {importing ? "Importerer…" : "Importér CSV"}
        <input
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      <span className="text-[11px] text-muted-foreground">
        Format: tidsstempel;dybde_cm — én måling pr. række
      </span>
    </div>
  );
}
