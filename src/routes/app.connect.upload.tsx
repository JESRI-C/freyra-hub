import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Sparkles, Plus } from "lucide-react";
import { Card, PageHeader, Pill } from "@/components/ui-bits";
import { Section, Chip } from "@/components/connect/Primitives";
import {
  UploadDropzone,
  UploadQueueTable,
  FileMetadataPanel,
  GeospatialValidationPanel,
  LayerPreviewCard,
  RoutingDestinationSelector,
  Toast,
} from "@/components/connect/MapPrimitives";
import { UPLOAD_TYPES, UPLOAD_QUEUE, VALIDATION_WARNINGS } from "@/lib/connect-map-data";
import { UploadWizard } from "@/components/monitoring/UploadWizard";
import { useConnectContext } from "@/lib/connect-context";
import { listUploads, uploadStatusLabel } from "@/services/monitoring/uploads-service";

export const Route = createFileRoute("/app/connect/upload")({
  component: Page,
});

function Page() {
  const { projectId } = useConnectContext();
  const [queue, setQueue] = useState(UPLOAD_QUEUE);
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.id ?? null);
  const [routing, setRouting] = useState<string[]>(["map", "ledger"]);
  const [toast, setToast] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const uploadsQuery = useQuery({
    queryKey: ["monitoring-uploads", projectId],
    queryFn: () => listUploads({ projectId, limit: 20 }),
  });

  const selected = useMemo(
    () => queue.find((q) => q.id === selectedId) ?? null,
    [queue, selectedId],
  );

  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-4">
      <PageHeader
        title="Upload center"
        description="Upload dronefiler, kortlag, feltdata og dokumentation til projektets datagrundlag."
      />

      {/* Hero */}
      <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold">
                Upload kortlag, drone, felt og dokumentation
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                Filer aktiveres automatisk i Smart Connect map, og kan rutes til DecisionsIQ, ESG
                Ledger, Impact Exchange og Reports efter validering.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone="primary">{queue.length} filer i kø</Chip>
            <Chip>{queue.filter((q) => q.status === "Klar").length} klar</Chip>
            <Chip tone="muted">
              {queue.filter((q) => q.status === "Validering").length} under validering
            </Chip>
          </div>
        </div>
      </Card>

      {/* Dropzone */}
      <UploadDropzone
        onAdd={(files) => {
          const newRows = files.map((f, i) => ({
            id: `nu-${Date.now()}-${i}`,
            name: f.name,
            type: f.type,
            size: f.size,
            project: "Skallebæk Biodiversity Pilot",
            zone: "—",
            status: "Validering" as const,
            geo: f.type !== "PDF" && f.type !== "JPG/PNG",
            metaOk: false,
            validationNote: "Validering i gang",
          }));
          setQueue([...newRows, ...queue]);
          setToast(`${files.length} fil(er) tilføjet til kø`);
        }}
      />

      {/* Supported types */}
      <Section
        title="Understøttede filtyper"
        subtitle="Hvad kan uploades og hvordan bliver det brugt"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {UPLOAD_TYPES.map((t) => (
            <div key={t.name} className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
                {t.onMap && <Chip tone="primary">Kort</Chip>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <Chip>{t.geo ? "Kræver geolocation" : "Ingen geolocation"}</Chip>
                <Chip tone="muted">{t.use}</Chip>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Upload queue */}
      <Section title="Upload-kø" subtitle="Filer under validering, klar til map eller med fejl">
        <UploadQueueTable
          rows={queue}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAction={(label) => setToast(`${label} udført (mock)`)}
        />
      </Section>

      {/* Metadata + validation */}
      {selected && (
        <div className="grid lg:grid-cols-2 gap-4">
          <FileMetadataPanel name={selected.name} type={selected.type} />
          <GeospatialValidationPanel
            checks={[
              { label: "Filformat valid", pass: true },
              { label: "Koordinater detekteret", pass: selected.geo },
              {
                label: "Projektion genkendt (EPSG:25832)",
                pass: selected.type !== "GeoTIFF" || selected.status !== "Fejl",
              },
              {
                label: "Bounds matcher projektområde",
                pass: !selected.validationNote.toLowerCase().includes("overlap"),
              },
              { label: "Påkrævet metadata komplet", pass: selected.metaOk },
              { label: "Lag kan previewes", pass: selected.geo },
              { label: "Klar til kortvisning", pass: selected.geo && selected.status === "Klar" },
              { label: "Klar til ESG Ledger", pass: selected.metaOk && selected.status === "Klar" },
              { label: "Klar til DecisionsIQ", pass: selected.geo && selected.status !== "Fejl" },
              { label: "Klar til Reports", pass: selected.metaOk && selected.status === "Klar" },
            ]}
          />
        </div>
      )}

      {/* Layer preview + routing */}
      {selected && (
        <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
          <LayerPreviewCard coverage={selected.status === "Fejl" ? 48 : 92} />
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <div className="text-sm font-semibold">Routing — hvor skal filen bruges?</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Vælg hvilke moduler filen automatisk skal aktiveres i, når validering er gennemført.
              </div>
            </div>
            <RoutingDestinationSelector
              selected={routing}
              onToggle={(k) =>
                setRouting(routing.includes(k) ? routing.filter((x) => x !== k) : [...routing, k])
              }
            />
            <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {routing.length} destination(er) valgt
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setToast("Filen er sat på pause")}
                  className="text-xs rounded-lg border bg-card px-3 py-1.5"
                >
                  Pause
                </button>
                <button
                  onClick={() => {
                    setQueue(
                      queue.map((q) =>
                        q.id === selected.id ? { ...q, status: "Klar", metaOk: true } : q,
                      ),
                    );
                    setToast(
                      "Filen er tilføjet til Smart Connect og kan nu bruges som kortlag, datakilde og rapportbilag.",
                    );
                  }}
                  className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Gem og aktivér
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation warnings + AI insight */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Aktive valideringsadvarsler">
          <ul className="text-sm space-y-2">
            {VALIDATION_WARNINGS.map((w, i) => (
              <li key={i} className="flex items-start gap-2 p-2.5 rounded-lg border bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">AI upload-anbefaling</div>
              <p className="text-sm mt-2 text-foreground/90">
                Drone-orthomosaic for Skallebæk dækker 92% af projektarealet — restende dækning kan
                suppleres med en ny overflyvning over Zone C. NDVI GeoTIFF-importen mangler
                EPSG-projektion: bekræft EPSG:25832 og kør re-validering før den frigives til ESG
                Ledger og Reports.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Toast msg={toast} onDone={() => setToast(null)} />
    </main>
  );
}
