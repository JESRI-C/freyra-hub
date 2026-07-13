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
} from "@/services/lavbundService";
import { ledgerAppend } from "@/services/ledgerService";
import { klassificerDybde } from "@/services/lavbundBeregning";
import { AFVANDINGSKLASSER } from "@/data/lavbundFaktorer";
import type { Maalepunkt, Opmaalingsintensitet } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId/kort")({
  head: () => ({ meta: [{ title: "Feltkort & tidsserie — LavbundsMRV" }] }),
  component: KortPage,
});

const KLASSE_FARVE: Record<string, string> = {
  "Frit vandspejl": "#1e3a8a",
  Sump: "#2563eb",
  "Våd eng": "#38bdf8",
  "Fugtig eng": "#86efac",
  "Tør eng": "#fcd34d",
  "Tør overjord": "#f97316",
  Mark: "#b91c1c",
};

const INTENSITETER: { id: Opmaalingsintensitet; label: string; feltdage: number }[] = [
  { id: "minimal", label: "Minimal", feltdage: 4 },
  { id: "standard", label: "Standard", feltdage: 12 },
  { id: "intensiv", label: "Intensiv", feltdage: 26 },
];

function KortPage() {
  const { projektId } = Route.useParams();
  const [intensitet, setIntensitet] = useState<Opmaalingsintensitet>("standard");

  const [projekt, maalepunkter, readings] = useQueries({
    queries: [
      { queryKey: ["lavbund", "project", projektId], queryFn: () => getProject(projektId) },
      { queryKey: ["lavbund", "mp", projektId], queryFn: () => getMaalepunkter(projektId) },
      { queryKey: ["lavbund", "readings", projektId], queryFn: () => getReadings(projektId) },
    ],
  });

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
    if (tidsserie.length === 0) return null;
    const values = tidsserie.map((t) => t.dybde);
    const mid = values.reduce((s, v) => s + v, 0) / values.length;
    const sommer = tidsserie.filter((t) => {
      const m = Number(t.maaned.slice(5, 7));
      return m >= 5 && m <= 9;
    });
    const vinter = tidsserie.filter((t) => {
      const m = Number(t.maaned.slice(5, 7));
      return m === 11 || m === 12 || m === 1 || m === 2 || m === 3;
    });
    const avg = (a: { dybde: number }[]) =>
      a.length ? a.reduce((s, x) => s + x.dybde, 0) / a.length : 0;
    return { aar: mid, sommer: avg(sommer), vinter: avg(vinter) };
  }, [tidsserie]);

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
            <Info className="h-3 w-3" /> Manuel pejling registreres nedenfor — Smart
            Connect-kobling til loggere kommer senere
          </span>
        </div>
        <div className="px-5 pb-4">
          <PejlingsForm
            projektId={projektId}
            maalepunkter={maalepunkter.data ?? []}
          />
        </div>
        <div className="px-5 pb-5 overflow-x-auto">
          <div className="min-w-[600px]">
            <VandspejlKort mps={filteredMp} senesteDybde={senesteDybde} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {AFVANDINGSKLASSER.map((k) => (
              <span
                key={k.navn}
                className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border"
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: KLASSE_FARVE[k.navn] }}
                />
                {k.navn}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Tidsserie — dybde til vandspejl (24 mdr.)"
          subtitle="HOBO-logger 15-min serier + periodiske markpejlinger. Grænsen for Våd eng: 0,50 m."
        />
        <div className="px-5 pb-5 overflow-x-auto">
          <div className="min-w-[600px]">
            <Tidsseriekurve serie={tidsserie} />
          </div>
          {stats && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <StatBoks label="Årsmiddel" value={`${stats.aar.toFixed(2)} m`} />
              <StatBoks label="Sommermiddel (maj–sep)" value={`${stats.sommer.toFixed(2)} m`} />
              <StatBoks label="Vintermiddel (nov–mar)" value={`${stats.vinter.toFixed(2)} m`} />
            </div>
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

function VandspejlKort({
  mps,
  senesteDybde,
}: {
  mps: { id: string; type: string; position: { x: number; y: number } }[];
  senesteDybde: Map<string, number>;
}) {
  const W = 100;
  const H = 60;
  const CELL = 5;
  const cols = W / CELL;
  const rows = H / CELL;
  const cells: { x: number; y: number; color: string; klasse: string }[] = [];
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const cx = ix * CELL + CELL / 2;
      const cy = iy * CELL + CELL / 2;
      let nearest = mps[0];
      let bd = Infinity;
      for (const mp of mps) {
        const d = (mp.position.x - cx) ** 2 + (mp.position.y - cy) ** 2;
        if (d < bd) {
          bd = d;
          nearest = mp;
        }
      }
      if (!nearest) continue;
      const dybde = senesteDybde.get(nearest.id) ?? 1;
      const klasse = klassificerDybde(dybde);
      cells.push({
        x: ix * CELL,
        y: iy * CELL,
        color: KLASSE_FARVE[klasse.navn] ?? "#94a3b8",
        klasse: klasse.navn,
      });
    }
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[320px] rounded-lg border bg-muted/10"
      role="img"
      aria-label="Feltkort med vandspejlsklasser"
    >
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={CELL}
          height={CELL}
          fill={c.color}
          opacity={0.55}
        />
      ))}
      <path
        d={`M0,${H * 0.55} Q${W * 0.3},${H * 0.4} ${W * 0.55},${H * 0.6} T${W},${H * 0.5}`}
        stroke="#0369a1"
        strokeWidth={0.6}
        fill="none"
      />
      {mps.map((mp) => {
        const dybde = senesteDybde.get(mp.id);
        const klasse = dybde !== undefined ? klassificerDybde(dybde).navn : "ukendt";
        return (
          <g key={mp.id} tabIndex={0} focusable="true">
            <circle
              cx={mp.position.x}
              cy={mp.position.y}
              r={mp.type === "kanal_logger" ? 1.4 : 1.0}
              fill="#0f172a"
              stroke="#ffffff"
              strokeWidth={0.4}
            >
              <title>
                {mp.id} — {mp.type === "kanal_logger" ? "Kanal-logger" : "Markpejling"}:{" "}
                {dybde !== undefined ? `${dybde.toFixed(2)} m (${klasse})` : "ingen data"}
              </title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function Tidsseriekurve({ serie }: { serie: { maaned: string; dybde: number }[] }) {
  if (serie.length === 0)
    return <div className="text-sm text-muted-foreground p-6">Ingen målinger endnu.</div>;
  const W = 600;
  const H = 180;
  const P = 30;
  const maxD = Math.max(1.5, ...serie.map((s) => s.dybde));
  const minD = 0;
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(1, serie.length - 1);
  const y = (d: number) => P + ((d - minD) / (maxD - minD)) * (H - P * 2);
  const path = serie.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i)},${y(s.dybde)}`).join(" ");
  const wetLine = y(0.5);
  const etablering = Math.min(6, serie.length);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[220px]"
      role="img"
      aria-label="Tidsserie — dybde til vandspejl"
    >
      <rect
        x={P}
        y={P}
        width={x(etablering - 1) - P}
        height={H - P * 2}
        fill="#fde68a"
        opacity={0.25}
      />
      <line
        x1={P}
        x2={W - P}
        y1={wetLine}
        y2={wetLine}
        stroke="#059669"
        strokeDasharray="4 3"
        strokeWidth={1}
      />
      <text x={W - P} y={wetLine - 4} fontSize={9} textAnchor="end" fill="#059669">
        Våd eng ≤ 0,50 m
      </text>
      <path d={path} fill="none" stroke="#0369a1" strokeWidth={1.5} />
      {serie.map((s, i) => (
        <circle key={s.maaned} cx={x(i)} cy={y(s.dybde)} r={1.6} fill="#0369a1" />
      ))}
      <text x={P} y={H - 6} fontSize={9} fill="#64748b">
        {serie[0]?.maaned}
      </text>
      <text x={W - P} y={H - 6} fontSize={9} textAnchor="end" fill="#64748b">
        {serie[serie.length - 1]?.maaned}
      </text>
      <text x={4} y={P + 8} fontSize={9} fill="#64748b">
        {minD.toFixed(1)} m
      </text>
      <text x={4} y={H - P + 4} fontSize={9} fill="#64748b">
        {maxD.toFixed(1)} m
      </text>
    </svg>
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
  const [addingMp, setAddingMp] = useState(false);

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

  const tilfoejMaalepunkt = async () => {
    setAddingMp(true);
    try {
      const n = maalepunkter.length;
      const mp: Maalepunkt = {
        id: `MP-${String(n + 1).padStart(2, "0")}-${projektId.slice(0, 4)}`,
        projektId,
        type: "markpejling",
        position: { x: 10 + (n % 8) * 11, y: 12 + Math.floor(n / 8) * 14 },
        intensiteter: ["minimal", "standard", "intensiv"],
      };
      await saveMaalepunkt(mp);
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      setMpId(mp.id);
      toast.success(`Målepunkt ${mp.id} oprettet`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke oprette målepunkt");
    } finally {
      setAddingMp(false);
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
      <button
        type="button"
        onClick={tilfoejMaalepunkt}
        disabled={addingMp}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> {addingMp ? "Opretter…" : "Nyt målepunkt"}
      </button>
    </form>
  );
}
