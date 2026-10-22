import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw, Download, Wrench } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ledgerAppend,
  ledgerList,
  ledgerVerify,
  _debugManipuler,
  type KaedeResultat,
} from "@/services/ledgerService";
import type { LedgerPost } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId/revisionsspor")({
  head: () => ({ meta: [{ title: "Revisionsspor — LavbundsMRV" }] }),
  component: RevisionsSporPage,
});

const MODUL = "lavbund";

function RevisionsSporPage() {
  const { projektId } = Route.useParams();
  const [rows, setRows] = useState<LedgerPost[]>([]);
  const [verifResultat, setVerifResultat] = useState<KaedeResultat | null>(null);
  const [busy, setBusy] = useState(false);

  const isDev = import.meta.env.DEV;

  async function reload() {
    const list = await ledgerList(MODUL, projektId);
    setRows(list);
  }

  useEffect(() => {
    (async () => {
      const list = await ledgerList(MODUL, projektId);
      if (list.length === 0) {
        // Seed en projektoprettelses-post første gang
        await ledgerAppend(MODUL, projektId, {
          actor: "system",
          event: "projekt_oprettet",
          detail: `LavbundsMRV-projekt ${projektId} tilføjet revisionsspor.`,
        });
      }
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId]);

  async function verify() {
    setBusy(true);
    try {
      const r = await ledgerVerify(MODUL, projektId);
      setVerifResultat(r);
    } finally {
      setBusy(false);
    }
  }

  function eksporterJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    triggerDownload(blob, `revisionsspor-${projektId}.json`);
  }

  function eksporterCsv() {
    const headers = ["seq", "tidspunkt", "actor", "event", "detail", "prevHash", "hash"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const cells = headers.map((h) => {
        const v = String((r as unknown as Record<string, unknown>)[h] ?? "");
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `revisionsspor-${projektId}.csv`);
  }

  async function simulerManipulation() {
    if (rows.length === 0) return;
    _debugManipuler(MODUL, projektId, rows[Math.floor(rows.length / 2)].seq);
    await reload();
    await verify();
  }

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <Card>
        <CardHeader
          title="Revisionsspor"
          subtitle="Append-only hændelseslog med SHA-256-kæde. Hver post binder til den forriges hash."
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={verify}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted/40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
                Verificér kæde
              </button>
              <button
                type="button"
                onClick={eksporterJson}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted/40"
              >
                <Download className="h-3.5 w-3.5" /> JSON
              </button>
              <button
                type="button"
                onClick={eksporterCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted/40"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              {isDev && (
                <button
                  type="button"
                  onClick={simulerManipulation}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning-foreground hover:bg-warning/20"
                  title="Kun i dev-mode"
                >
                  <Wrench className="h-3.5 w-3.5" /> Simulér manipulation
                </button>
              )}
            </div>
          }
        />
        <div className="px-5 pb-4">
          {verifResultat === null ? (
            <span className="text-xs text-muted-foreground">
              Kæden er endnu ikke verificeret i denne session.
            </span>
          ) : verifResultat.ok ? (
            <Pill tone="success">
              <CheckCircle2 className="h-3 w-3" /> Kæden er intakt ({rows.length} poster)
            </Pill>
          ) : (
            <div className="text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Kæden er brudt ved post #{verifResultat.brud?.seq}</div>
                <div className="mt-1 font-mono text-[10px] break-all">
                  Forventet {verifResultat.brud?.forventet.slice(0, 20)}… fik{" "}
                  {verifResultat.brud?.faktisk.slice(0, 20)}…
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2 font-medium">#</th>
                <th className="text-left py-2 px-2 font-medium">Tidspunkt</th>
                <th className="text-left py-2 px-2 font-medium">Actor</th>
                <th className="text-left py-2 px-2 font-medium">Event</th>
                <th className="text-left py-2 px-2 font-medium">Detalje</th>
                <th className="text-left py-2 px-2 font-medium">Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seq} className="border-b hover:bg-muted/20">
                  <td className="py-1.5 px-2 tabular-nums">{r.seq}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    {new Date(r.tidspunkt).toLocaleString("da-DK")}
                  </td>
                  <td className="py-1.5 px-2">{r.actor}</td>
                  <td className="py-1.5 px-2 font-medium">{r.event}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{r.detail}</td>
                  <td className="py-1.5 px-2 font-mono text-[10px] text-muted-foreground">
                    {r.hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Ingen ledger-poster endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
