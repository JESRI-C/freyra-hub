import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Droplets } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  appendLedger,
  getGroefter,
  getProject,
  getReadings,
  getTransekter,
  saveSnapshot,
} from "@/services/lavbundService";
import { beregnFosforBalance, bygSnapshot } from "@/services/lavbundBeregning";
import type {
  GroeftStraekning,
  Georegion,
  Landskabstype,
  Transekt,
  Vandloebsform,
  VandloebsType,
} from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId/fosfor")({
  head: () => ({ meta: [{ title: "Fosfor · brinkerosion — LavbundsMRV" }] }),
  component: FosforPage,
});

function fmtKg(v: number): string {
  return `${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })} kg P/år`;
}

function FosforPage() {
  const { projektId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [projekt, initialTransekter, initialGroefter, readings] = useQueries({
    queries: [
      { queryKey: ["lavbund", "project", projektId], queryFn: () => getProject(projektId) },
      { queryKey: ["lavbund", "transekter", projektId], queryFn: () => getTransekter(projektId) },
      { queryKey: ["lavbund", "groefter", projektId], queryFn: () => getGroefter(projektId) },
      { queryKey: ["lavbund", "readings", projektId], queryFn: () => getReadings(projektId) },
    ],
  });

  const [transekter, setTransekter] = useState<Transekt[]>([]);
  const [groefter, setGroefter] = useState<GroeftStraekning[]>([]);

  useEffect(() => {
    if (initialTransekter.data) setTransekter(initialTransekter.data);
  }, [initialTransekter.data]);
  useEffect(() => {
    if (initialGroefter.data) setGroefter(initialGroefter.data);
  }, [initialGroefter.data]);

  const balance = useMemo(
    () =>
      beregnFosforBalance(
        transekter.filter((t) => t.fase === "foer"),
        transekter.filter((t) => t.fase === "efter"),
        groefter,
      ),
    [transekter, groefter],
  );

  if (initialTransekter.isLoading || initialGroefter.isLoading)
    return (
      <div className="p-6">
        <Card className="p-6 h-40 animate-pulse">
          <span />
        </Card>
      </div>
    );

  function updateTransekt(index: number, patch: Partial<Transekt>) {
    setTransekter((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addTransekt(fase: "foer" | "efter") {
    const nr = Math.max(0, ...transekter.filter((t) => t.fase === fase).map((t) => t.nr)) + 1;
    setTransekter((rows) => [
      ...rows,
      {
        nr,
        projektId,
        fase,
        landskabstype: "moraene",
        vandloebsType: 2,
        georegion: 4,
        vandloebsform: "slynget",
        laengdeM: 500,
        hoejVegetationSide1: 0.2,
        hoejVegetationSide2: 0.2,
        brinkHoejdeSide1M: 1.0,
        brinkHoejdeSide2M: 1.0,
        brinkLaengdeSide1M: 1.0,
        brinkLaengdeSide2M: 1.0,
      },
    ]);
  }
  function deleteTransekt(index: number) {
    setTransekter((rows) => rows.filter((_, i) => i !== index));
  }

  async function bogfoer() {
    if (!projekt.data) return;
    setSaving(true);
    try {
      const snap = bygSnapshot({
        projekt: projekt.data,
        readings: readings.data ?? [],
        transekterFoer: transekter.filter((t) => t.fase === "foer"),
        transekterEfter: transekter.filter((t) => t.fase === "efter"),
        groefter,
      });
      await saveSnapshot(snap);
      await appendLedger(projektId, {
        seq: Date.now(),
        tidspunkt: new Date().toISOString(),
        actor: "bruger",
        event: "fosfor_bogfoert",
        detail: `Fosforbalance ${balance.balanceKgAar.toFixed(1)} kg P/år`,
        prevHash: "",
        hash: "",
      });
      await qc.invalidateQueries({ queryKey: ["lavbund"] });
      navigate({ to: "/app/lavbund/$projektId/revisionsspor", params: { projektId } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <BalanceKort label="Vandløb FØR" value={balance.vandloebFoerKgAar} tone="danger" />
        <BalanceKort label="Vandløb EFTER" value={balance.vandloebEfterKgAar} tone="success" />
        <BalanceKort label="Grøfter FØR" value={balance.groefterFoerKgAar} tone="danger" />
        <BalanceKort label="Grøfter EFTER" value={balance.groefterEfterKgAar} tone="success" />
      </div>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Fosforbalance (positiv = tilbageholdelse)
            </div>
            <div
              className={`mt-2 text-3xl font-semibold tabular-nums ${
                balance.balanceKgAar >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {balance.balanceKgAar >= 0 ? "+" : ""}
              {fmtKg(balance.balanceKgAar)}
            </div>
          </div>
          <Droplets className="h-10 w-10 text-primary/60" />
        </div>
      </Card>

      {(["foer", "efter"] as const).map((fase) => (
        <Card key={fase}>
          <CardHeader
            title={`Transekter — ${fase === "foer" ? "FØR" : "EFTER"}`}
            subtitle="Anlæg beregnes automatisk fra brinkhøjde/brinklængde."
            action={
              <button
                type="button"
                onClick={() => addTransekt(fase)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted/40"
              >
                <Plus className="h-3.5 w-3.5" /> Tilføj transekt
              </button>
            }
          />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">Nr</th>
                  <th className="text-left py-2 px-2 font-medium">Landskab</th>
                  <th className="text-left py-2 px-2 font-medium">Type</th>
                  <th className="text-left py-2 px-2 font-medium">Georeg.</th>
                  <th className="text-left py-2 px-2 font-medium">Form</th>
                  <th className="text-right py-2 px-2 font-medium">Længde m</th>
                  <th className="text-right py-2 px-2 font-medium">Veg 1</th>
                  <th className="text-right py-2 px-2 font-medium">Veg 2</th>
                  <th className="text-right py-2 px-2 font-medium">Højde 1</th>
                  <th className="text-right py-2 px-2 font-medium">Højde 2</th>
                  <th className="text-right py-2 px-2 font-medium">Længde 1</th>
                  <th className="text-right py-2 px-2 font-medium">Længde 2</th>
                  <th className="text-right py-2 px-2 font-medium">Anlæg</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {transekter.map((t, idx) => {
                  if (t.fase !== fase) return null;
                  const anlaeg1 =
                    t.brinkLaengdeSide1M > 0
                      ? (t.brinkHoejdeSide1M / t.brinkLaengdeSide1M).toFixed(2)
                      : "—";
                  return (
                    <tr key={`${fase}-${idx}`} className="border-b hover:bg-muted/20">
                      <td className="py-1.5 px-2 tabular-nums">{t.nr}</td>
                      <td className="py-1.5 px-2">
                        <select
                          value={t.landskabstype}
                          onChange={(e) =>
                            updateTransekt(idx, {
                              landskabstype: e.target.value as Landskabstype,
                            })
                          }
                          className="rounded border bg-background px-1.5 py-0.5"
                        >
                          <option value="moraene">Moræne</option>
                          <option value="hedeslette">Hedeslette</option>
                        </select>
                      </td>
                      <td className="py-1.5 px-2">
                        <select
                          value={t.vandloebsType}
                          onChange={(e) =>
                            updateTransekt(idx, {
                              vandloebsType: Number(e.target.value) as VandloebsType,
                            })
                          }
                          className="rounded border bg-background px-1.5 py-0.5"
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      </td>
                      <td className="py-1.5 px-2">
                        <select
                          value={t.georegion}
                          onChange={(e) =>
                            updateTransekt(idx, {
                              georegion: Number(e.target.value) as Georegion,
                            })
                          }
                          className="rounded border bg-background px-1.5 py-0.5"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2">
                        <select
                          value={t.vandloebsform}
                          onChange={(e) =>
                            updateTransekt(idx, {
                              vandloebsform: e.target.value as Vandloebsform,
                            })
                          }
                          className="rounded border bg-background px-1.5 py-0.5"
                        >
                          <option value="slynget">Slynget</option>
                          <option value="udrettet">Udrettet</option>
                        </select>
                      </td>
                      <NumCell
                        value={t.laengdeM}
                        onChange={(v) => updateTransekt(idx, { laengdeM: v })}
                      />
                      <NumCell
                        value={t.hoejVegetationSide1}
                        step={0.05}
                        onChange={(v) => updateTransekt(idx, { hoejVegetationSide1: v })}
                      />
                      <NumCell
                        value={t.hoejVegetationSide2}
                        step={0.05}
                        onChange={(v) => updateTransekt(idx, { hoejVegetationSide2: v })}
                      />
                      <NumCell
                        value={t.brinkHoejdeSide1M}
                        step={0.05}
                        onChange={(v) => updateTransekt(idx, { brinkHoejdeSide1M: v })}
                      />
                      <NumCell
                        value={t.brinkHoejdeSide2M}
                        step={0.05}
                        onChange={(v) => updateTransekt(idx, { brinkHoejdeSide2M: v })}
                      />
                      <NumCell
                        value={t.brinkLaengdeSide1M}
                        step={0.05}
                        onChange={(v) => updateTransekt(idx, { brinkLaengdeSide1M: v })}
                      />
                      <NumCell
                        value={t.brinkLaengdeSide2M}
                        step={0.05}
                        onChange={(v) => updateTransekt(idx, { brinkLaengdeSide2M: v })}
                      />
                      <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">
                        {anlaeg1}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => deleteTransekt(idx)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Slet transekt"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {transekter.filter((t) => t.fase === fase).length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">
                Ingen transekter i {fase === "foer" ? "FØR" : "EFTER"}. Tilføj den første.
              </div>
            )}
          </div>
        </Card>
      ))}

      <Card>
        <CardHeader
          title="Grøfter"
          subtitle="Tilkastede grøfter tæller som 0 kg P/år i EFTER-tilstanden."
        />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2 font-medium">ID</th>
                <th className="text-right py-2 px-2 font-medium">Længde m</th>
                <th className="text-right py-2 px-2 font-medium">Brinkhøjde m</th>
                <th className="text-left py-2 px-2 font-medium">Tilkastet</th>
              </tr>
            </thead>
            <tbody>
              {groefter.map((g, i) => (
                <tr key={g.id} className="border-b">
                  <td className="py-1.5 px-2 text-xs text-muted-foreground">{g.id}</td>
                  <NumCell
                    value={g.laengdeM}
                    onChange={(v) =>
                      setGroefter((rows) =>
                        rows.map((r, ri) => (ri === i ? { ...r, laengdeM: v } : r)),
                      )
                    }
                  />
                  <NumCell
                    value={g.brinkHoejdeM}
                    step={0.05}
                    onChange={(v) =>
                      setGroefter((rows) =>
                        rows.map((r, ri) => (ri === i ? { ...r, brinkHoejdeM: v } : r)),
                      )
                    }
                  />
                  <td className="py-1.5 px-2">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={g.tilkastet}
                        onChange={(e) =>
                          setGroefter((rows) =>
                            rows.map((r, ri) =>
                              ri === i ? { ...r, tilkastet: e.target.checked } : r,
                            ),
                          )
                        }
                      />
                      {g.tilkastet ? "Ja" : "Nej"}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <BrinkProfil transekter={transekter} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={bogfoer}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Bogfører…" : "Bogfør fosforbalance"}
        </button>
      </div>
    </main>
  );
}

function BalanceKort({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "success";
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{fmtKg(value)}</div>
      <div className="mt-2">
        <Pill tone={tone}>{tone === "danger" ? "Tab" : "Reduceret"}</Pill>
      </div>
    </Card>
  );
}

function NumCell({
  value,
  step = 1,
  onChange,
}: {
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <td className="py-1 px-2 text-right">
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded border bg-background px-1.5 py-0.5 text-right tabular-nums"
      />
    </td>
  );
}

function BrinkProfil({ transekter }: { transekter: Transekt[] }) {
  const foer = transekter.filter((t) => t.fase === "foer");
  const efter = transekter.filter((t) => t.fase === "efter");
  const avg = (rows: Transekt[], key: "brinkHoejdeSide1M" | "brinkLaengdeSide1M") =>
    rows.length ? rows.reduce((s, r) => s + r[key], 0) / rows.length : 0;
  const fH = avg(foer, "brinkHoejdeSide1M");
  const fL = avg(foer, "brinkLaengdeSide1M");
  const eH = avg(efter, "brinkHoejdeSide1M");
  const eL = avg(efter, "brinkLaengdeSide1M");
  return (
    <Card>
      <CardHeader
        title="Brinkprofil (gennemsnit)"
        subtitle="Side 1 · lodret snit — FØR og EFTER etablering."
      />
      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProfilSvg label="FØR" hoejde={fH} laengde={fL} />
        <ProfilSvg label="EFTER" hoejde={eH} laengde={eL} />
      </div>
    </Card>
  );
}

function ProfilSvg({ label, hoejde, laengde }: { label: string; hoejde: number; laengde: number }) {
  const W = 240;
  const H = 120;
  const maxDim = Math.max(hoejde, laengde, 1.5);
  const scale = 60 / maxDim;
  const baseY = H - 20;
  const brinkX = 40 + laengde * scale;
  const topY = baseY - hoejde * scale;
  return (
    <div className="rounded-xl border bg-muted/10 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32">
        <line x1={10} y1={baseY} x2={W - 10} y2={baseY} stroke="#94a3b8" strokeWidth={0.5} />
        <path
          d={`M 40 ${baseY} L ${brinkX} ${topY} L ${W - 20} ${topY}`}
          fill="#a3a3a3"
          fillOpacity={0.4}
          stroke="#525252"
          strokeWidth={1}
        />
        <line x1={10} y1={baseY - 6} x2={38} y2={baseY - 6} stroke="#0369a1" strokeWidth={1.5} />
        <text x={12} y={baseY - 9} fontSize={8} fill="#0369a1">
          vandspejl
        </text>
        <text x={brinkX + 4} y={topY - 4} fontSize={9} fill="#334155">
          h {hoejde.toFixed(2)} m · l {laengde.toFixed(2)} m
        </text>
      </svg>
    </div>
  );
}
