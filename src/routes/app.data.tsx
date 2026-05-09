import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { Database, Layers, GitBranch, Clock, Plus, X, ChevronDown, ChevronUp, Search } from "lucide-react";

export const Route = createFileRoute("/app/data")({
  head: () => ({ meta: [{ title: "Datakilder — GoFreyra" }] }),
  component: Page,
});

type VerificationTone = "success" | "warning" | "danger" | "info";

interface DataRow {
  id: string;
  navn: string;
  kilde: string;
  format: string;
  størrelse: string;
  verifikationTone: VerificationTone;
  verifikationLabel: string;
  opdateret: string;
  // slide-over details
  beskrivelse: string;
  sti: string;
  sidstSynket: string;
}

const SEED_ROWS: DataRow[] = [
  {
    id: "1",
    navn: "Tang_NDVI_2026",
    kilde: "Sentinel-2",
    format: "GeoTIFF",
    størrelse: "1,2 GB",
    verifikationTone: "success",
    verifikationLabel: "Verificeret",
    opdateret: "i dag",
    beskrivelse: "NDVI-analyse af tangbevoksning langs Jyllands vestkyst baseret på Sentinel-2 multispektraldata fra 2026.",
    sti: "s3://gofreyra-data/sentinel2/Tang_NDVI_2026.tif",
    sidstSynket: "2026-05-09 08:14",
  },
  {
    id: "2",
    navn: "Vandtemperatur_LF",
    kilde: "Aanderaa IoT",
    format: "Parquet",
    størrelse: "84 MB",
    verifikationTone: "success",
    verifikationLabel: "Verificeret",
    opdateret: "5 min",
    beskrivelse: "Kontinuerlige vandtemperaturmålinger fra Aanderaa optiske sensorer placeret i Limfjorden.",
    sti: "s3://gofreyra-data/iot/Vandtemperatur_LF.parquet",
    sidstSynket: "2026-05-09 11:52",
  },
  {
    id: "3",
    navn: "eDNA_Q2",
    kilde: "Felt",
    format: "CSV",
    størrelse: "12 MB",
    verifikationTone: "warning",
    verifikationLabel: "Afventer",
    opdateret: "i går",
    beskrivelse: "eDNA-prøver indsamlet i 2. kvartal 2026. Afventer laboratoriebekræftelse af artssammensætning.",
    sti: "s3://gofreyra-data/felt/eDNA_Q2.csv",
    sidstSynket: "2026-05-08 14:30",
  },
  {
    id: "4",
    navn: "LiDAR_Skallebæk",
    kilde: "Drone",
    format: "LAS",
    størrelse: "4,8 GB",
    verifikationTone: "success",
    verifikationLabel: "Verificeret",
    opdateret: "3 d",
    beskrivelse: "Højopløsnings LiDAR-punktsky fra droneflyvning over Skallebæk-ådalen. Anvendes til terrænmodellering.",
    sti: "s3://gofreyra-data/lidar/LiDAR_Skallebæk.las",
    sidstSynket: "2026-05-06 09:00",
  },
  {
    id: "5",
    navn: "Klimadata_DMI",
    kilde: "DMI API",
    format: "JSON",
    størrelse: "320 MB",
    verifikationTone: "success",
    verifikationLabel: "Verificeret",
    opdateret: "1 t",
    beskrivelse: "Historiske og aktuelle klimadata fra DMI's åbne API, inkl. nedbør, temperatur og vind.",
    sti: "s3://gofreyra-data/dmi/Klimadata_DMI.json",
    sidstSynket: "2026-05-09 11:00",
  },
];

const FORMAT_OPTIONS = ["GeoTIFF", "CSV", "JSON", "Parquet", "LAS", "GeoPackage"] as const;

interface UploadFormState {
  navn: string;
  kilde: string;
  format: (typeof FORMAT_OPTIONS)[number];
  filNavn: string;
}

function Page() {
  const [rows, setRows] = useState<DataRow[]>(SEED_ROWS);
  const [søgning, setSøgning] = useState("");
  const [modalÅben, setModalÅben] = useState(false);
  const [udvidetRække, setUdvidetRække] = useState<string | null>(null);
  const [form, setForm] = useState<UploadFormState>({
    navn: "",
    kilde: "",
    format: "GeoTIFF",
    filNavn: "",
  });
  const filInputRef = useRef<HTMLInputElement>(null);

  const filtreredeRækker = rows.filter(
    (r) =>
      r.navn.toLowerCase().includes(søgning.toLowerCase()) ||
      r.kilde.toLowerCase().includes(søgning.toLowerCase()),
  );

  function åbnModal() {
    setForm({ navn: "", kilde: "", format: "GeoTIFF", filNavn: "" });
    setModalÅben(true);
  }

  function lukModal() {
    setModalÅben(false);
  }

  function håndterIndsend(e: React.FormEvent) {
    e.preventDefault();
    const nyRække: DataRow = {
      id: `ny-${Date.now()}`,
      navn: form.navn || "Unavngivet datasæt",
      kilde: form.kilde || "Ukendt",
      format: form.format,
      størrelse: "—",
      verifikationTone: "warning",
      verifikationLabel: "Afventer",
      opdateret: "nu",
      beskrivelse: `Uploadet datasæt: ${form.filNavn || "ingen fil valgt"}.`,
      sti: `uploads/${form.filNavn || "ukendt"}`,
      sidstSynket: new Date().toLocaleString("da-DK"),
    };
    setRows((prev) => [nyRække, ...prev]);
    setModalÅben(false);
  }

  function skiftUdvidetRække(id: string) {
    setUdvidetRække((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <AppTopbar title="Datakilder" subtitle="Katalog over alle datasæt i dit projekt" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Datakatalog"
            description="Søg, inspicér og verificér datasæt på tværs af kilder."
          />
          <button
            onClick={åbnModal}
            className="shrink-0 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Upload datasæt
          </button>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Datasæt"
            value={String(rows.length)}
            delta={9}
            icon={<Database className="h-5 w-5" />}
          />
          <StatCard
            label="Lag"
            value="36"
            delta={3}
            icon={<Layers className="h-5 w-5" />}
            accent="bg-accent text-accent-foreground"
          />
          <StatCard
            label="Versioner"
            value="1.284"
            delta={18}
            icon={<GitBranch className="h-5 w-5" />}
            accent="bg-success/15 text-success"
          />
          <StatCard
            label="Senest synket"
            value="3 min"
            icon={<Clock className="h-5 w-5" />}
            accent="bg-warning/20 text-warning-foreground"
          />
        </div>

        <Card>
          <div className="flex items-center justify-between px-5 py-3 border-b gap-3">
            <CardHeader title="Datasæt" />
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                placeholder="Søg..."
                value={søgning}
                onChange={(e) => setSøgning(e.target.value)}
                className="w-full rounded-md border bg-background pl-9 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr>
                <th className="px-5 py-2">Navn</th>
                <th className="py-2">Kilde</th>
                <th className="py-2">Format</th>
                <th className="py-2">Størrelse</th>
                <th className="py-2">Verifikation</th>
                <th className="py-2">Opdateret</th>
                <th className="py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtreredeRækker.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                    Ingen datasæt matcher søgningen.
                  </td>
                </tr>
              )}
              {filtreredeRækker.map((r) => (
                <>
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => skiftUdvidetRække(r.id)}
                  >
                    <td className="px-5 py-3 font-medium">{r.navn}</td>
                    <td>{r.kilde}</td>
                    <td>
                      <span className="font-mono text-xs">{r.format}</span>
                    </td>
                    <td className="tabular-nums">{r.størrelse}</td>
                    <td>
                      <Pill tone={r.verifikationTone}>{r.verifikationLabel}</Pill>
                    </td>
                    <td className="text-muted-foreground">{r.opdateret}</td>
                    <td className="pr-3 text-muted-foreground">
                      {udvidetRække === r.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </td>
                  </tr>
                  {udvidetRække === r.id && (
                    <tr key={`${r.id}-detail`} className="bg-muted/20">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="grid sm:grid-cols-3 gap-4 text-sm">
                          <div className="sm:col-span-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                              Beskrivelse
                            </p>
                            <p>{r.beskrivelse}</p>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                                Sti
                              </p>
                              <p className="font-mono text-xs break-all text-muted-foreground">
                                {r.sti}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                                Sidst synket
                              </p>
                              <p className="text-muted-foreground">{r.sidstSynket}</p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </Card>
      </main>

      {/* Upload modal */}
      {modalÅben && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) lukModal();
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-background shadow-xl border">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-base">Upload datasæt</h2>
              <button
                onClick={lukModal}
                className="rounded-md p-1 hover:bg-muted transition-colors text-muted-foreground"
                aria-label="Luk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={håndterIndsend} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="ds-navn">
                  Navn
                </label>
                <input
                  id="ds-navn"
                  type="text"
                  required
                  value={form.navn}
                  onChange={(e) => setForm((f) => ({ ...f, navn: e.target.value }))}
                  placeholder="f.eks. Tang_NDVI_2027"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="ds-kilde">
                  Kilde
                </label>
                <input
                  id="ds-kilde"
                  type="text"
                  required
                  value={form.kilde}
                  onChange={(e) => setForm((f) => ({ ...f, kilde: e.target.value }))}
                  placeholder="f.eks. Sentinel-2"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="ds-format">
                  Format
                </label>
                <select
                  id="ds-format"
                  value={form.format}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      format: e.target.value as UploadFormState["format"],
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {FORMAT_OPTIONS.map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {fmt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="ds-fil">
                  Fil
                </label>
                <input
                  ref={filInputRef}
                  id="ds-fil"
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const fil = e.target.files?.[0];
                    setForm((f) => ({ ...f, filNavn: fil?.name ?? "" }));
                  }}
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={form.filNavn}
                    placeholder="Ingen fil valgt"
                    className="flex-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground cursor-default"
                  />
                  <button
                    type="button"
                    onClick={() => filInputRef.current?.click()}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    Vælg fil
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={lukModal}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Annuller
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Tilføj datasæt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
